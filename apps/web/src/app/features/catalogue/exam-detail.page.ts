import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ExamDetail } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { AttemptService } from '../../core/data/attempt.service';
import { ExamService } from '../../core/data/exam.service';
import { ToastService } from '../../core/notifications/toast.service';
import {
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { difficultyLabel, formatDuration } from '../../shared/util/format';

/**
 * Exam detail / pre-flight screen.
 *
 * Shows everything a learner needs to decide whether to sit the paper -
 * duration, question count, pass mark, topic mix and their own best score - and
 * nothing that would spoil it. Question text is never previewed here; the
 * public API does not return it.
 */
@Component({
  selector: 'app-exam-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadingBlockComponent, ErrorStateComponent],
  styles: [
    `
      .layout {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: 1.5fr 1fr;
        align-items: start;
      }
      .facts {
        display: grid;
        gap: var(--s-3);
      }
      .fact {
        display: flex;
        justify-content: space-between;
        gap: var(--s-3);
        padding-bottom: var(--s-2);
        border-bottom: 1px solid var(--c-border);
        font-size: var(--fs-sm);
      }
      .fact:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }
      .fact dt {
        color: var(--c-text-muted);
      }
      .fact dd {
        margin: 0;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }
      .rules li {
        display: flex;
        gap: var(--s-2);
        font-size: var(--fs-sm);
        color: var(--c-text-muted);
        padding: var(--s-1) 0;
      }
      .rules li::before {
        content: '•';
        color: var(--c-brand);
        font-weight: 700;
      }
      @media (max-width: 860px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  template: `
    <div class="container page">
      @if (loading()) {
        <app-loading-block [count]="1" [height]="320" label="Loading exam" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()">
        </app-error-state>
        <p class="mt-3"><a routerLink="/exams">Back to the catalogue</a></p>
      } @else if (exam(); as detail) {
        <nav class="small muted mb-3" aria-label="Breadcrumb">
          <a routerLink="/exams">Exams</a> / <span>{{ detail.topic.name }}</span>
        </nav>

        <div class="page-head">
          <div>
            <div class="row mb-3">
              <span class="badge badge--brand">{{ detail.topic.name }}</span>
              <span class="badge">{{ label(detail.difficulty) }}</span>
              @if (detail.activeAttemptId) {
                <span class="badge badge--warning">Attempt in progress</span>
              }
            </div>
            <h1>{{ detail.title }}</h1>
            <p>{{ detail.description }}</p>
          </div>
        </div>

        <div class="layout">
          <div class="stack">
            <section class="card">
              <div class="section-title"><h2>What this paper covers</h2></div>
              @if (detail.topicBreakdown.length === 0) {
                <p class="small muted">No questions have been added to this exam yet.</p>
              } @else {
                <div class="table-wrap">
                  <table class="table">
                    <caption class="sr-only">Questions per topic</caption>
                    <thead>
                      <tr>
                        <th scope="col">Topic</th>
                        <th scope="col" class="num">Questions</th>
                        <th scope="col" class="num">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of detail.topicBreakdown; track row.topic.id) {
                        <tr>
                          <td>{{ row.topic.name }}</td>
                          <td class="num">{{ row.questionCount }}</td>
                          <td class="num">{{ share(row.questionCount, detail) }}%</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </section>

            <section class="card">
              <div class="section-title"><h2>How the attempt works</h2></div>
              <ul class="rules">
                <li>
                  The timer starts when you press start and is anchored to the server, so closing
                  the tab does not pause it.
                </li>
                <li>
                  Your answers save automatically as you pick them. You can refresh or come back
                  on another device and continue.
                </li>
                <li>
                  You can move freely between questions and change answers until you submit or the
                  time runs out.
                </li>
                <li>
                  Submitting is final. Afterwards you get the correct answers, explanations and a
                  per-topic breakdown.
                </li>
                <li>No negative marking - a wrong answer costs the same as a blank one.</li>
              </ul>
            </section>
          </div>

          <aside class="stack">
            <section class="card">
              <dl class="facts">
                <div class="fact">
                  <dt>Questions</dt>
                  <dd>{{ detail.questionCount }}</dd>
                </div>
                <div class="fact">
                  <dt>Total marks</dt>
                  <dd>{{ detail.totalPoints }}</dd>
                </div>
                <div class="fact">
                  <dt>Time limit</dt>
                  <dd>{{ duration(detail.durationMinutes) }}</dd>
                </div>
                <div class="fact">
                  <dt>Pass mark</dt>
                  <dd>{{ detail.passPercentage }}%</dd>
                </div>
                @if (detail.attemptCount !== undefined) {
                  <div class="fact">
                    <dt>Your attempts</dt>
                    <dd>{{ detail.attemptCount }}</dd>
                  </div>
                }
                @if (detail.bestPercentage !== null && detail.bestPercentage !== undefined) {
                  <div class="fact">
                    <dt>Your best</dt>
                    <dd>{{ detail.bestPercentage }}%</dd>
                  </div>
                }
              </dl>

              <div class="mt-4 stack-sm">
                @if (detail.activeAttemptId) {
                  <a
                    class="btn btn--primary btn--lg btn--block"
                    [routerLink]="['/attempts', detail.activeAttemptId, 'take']"
                  >
                    Resume your attempt
                  </a>
                  <span class="xs muted">
                    You already have an unfinished attempt at this paper.
                  </span>
                } @else {
                  <button
                    type="button"
                    class="btn btn--primary btn--lg btn--block"
                    [disabled]="starting() || detail.questionCount === 0"
                    data-testid="start-exam"
                    (click)="start(detail)"
                  >
                    {{ starting() ? 'Starting...' : 'Start exam' }}
                  </button>
                  @if (!signedIn()) {
                    <span class="xs muted">You will be asked to sign in first.</span>
                  }
                }
                @if (detail.attemptCount) {
                  <a class="btn btn--ghost btn--sm btn--block" routerLink="/attempts">
                    See your past attempts
                  </a>
                }
              </div>
            </section>
          </aside>
        </div>
      }
    </div>
  `,
})
export class ExamDetailPage {
  /** Bound from the route via withComponentInputBinding(). */
  readonly idOrSlug = input.required<string>();

  private readonly exams = inject(ExamService);
  private readonly attempts = inject(AttemptService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly exam = signal<ExamDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);
  protected readonly signedIn = computed(() => this.auth.isAuthenticated());

  constructor() {
    // Reloads when the route parameter changes (e.g. a recommendation link).
    effect(() => {
      const slug = this.idOrSlug();
      void this.load(slug);
    });
  }

  protected async load(slug = this.idOrSlug()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.exam.set(await this.exams.getExam(slug));
    } catch (error) {
      this.error.set(
        ApiError.isApiError(error)
          ? error.status === 404
            ? 'That exam does not exist or is not published.'
            : error.message
          : 'Could not load that exam.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async start(detail: ExamDetail): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      await this.router.navigate(['/login'], {
        queryParams: { returnUrl: `/exams/${detail.slug}` },
      });
      return;
    }

    this.starting.set(true);
    try {
      const state = await this.attempts.start(detail.id);
      await this.router.navigate(['/attempts', state.attemptId, 'take']);
    } catch (error) {
      this.toasts.error(
        ApiError.isApiError(error) ? error.message : 'Could not start that exam.',
      );
    } finally {
      this.starting.set(false);
    }
  }

  protected label(value: 'EASY' | 'MEDIUM' | 'HARD'): string {
    return difficultyLabel(value);
  }

  protected duration(minutes: number): string {
    return formatDuration(minutes * 60);
  }

  protected share(questionCount: number, detail: ExamDetail): number {
    if (detail.questionCount === 0) {
      return 0;
    }
    return Math.round((questionCount / detail.questionCount) * 100);
  }
}
