import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { AttemptResultDetail } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AttemptService } from '../../core/data/attempt.service';
import { ProgressChartComponent } from '../../shared/components/progress-chart.component';
import { ScoreDonutComponent } from '../../shared/components/score-donut.component';
import {
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { TopicBarsComponent } from '../../shared/components/topic-bars.component';
import { formatDateTime, formatDuration } from '../../shared/util/format';

/**
 * Results and answer review.
 *
 * Everything here comes from the server's stored grading - the page never
 * recomputes a score. The per-question review shows the learner's choice next
 * to the correct one plus the explanation, which is the part that actually
 * teaches; the filters let them jump straight to what they got wrong.
 */
@Component({
  selector: 'app-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LoadingBlockComponent,
    ErrorStateComponent,
    ScoreDonutComponent,
    TopicBarsComponent,
    ProgressChartComponent,
  ],
  styles: [
    `
      .summary {
        display: grid;
        gap: var(--s-5);
        grid-template-columns: auto 1fr;
        align-items: center;
      }
      .breakdown {
        display: grid;
        gap: var(--s-3);
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      }
      .layout {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: 1.5fr 1fr;
        align-items: start;
      }
      .question {
        border: 1px solid var(--c-border);
        border-radius: var(--radius);
        padding: var(--s-4);
        background: var(--c-surface);
      }
      .question + .question {
        margin-top: var(--s-3);
      }
      .question__prompt {
        white-space: pre-wrap;
        line-height: 1.6;
        margin-top: var(--s-2);
      }
      .answer {
        display: flex;
        gap: var(--s-3);
        align-items: flex-start;
        padding: var(--s-2) var(--s-3);
        border: 1px solid var(--c-border);
        border-radius: var(--radius-sm);
        font-size: var(--fs-sm);
      }
      .answer + .answer {
        margin-top: var(--s-2);
      }
      .answer--correct {
        border-color: #bfe3cb;
        background: var(--c-success-soft);
      }
      .answer--chosen-wrong {
        border-color: #f3c6c2;
        background: var(--c-danger-soft);
      }
      .answer__tag {
        margin-left: auto;
        font-size: var(--fs-xs);
        font-weight: 650;
        white-space: nowrap;
      }
      .explanation {
        margin-top: var(--s-3);
        padding: var(--s-3);
        border-left: 3px solid var(--c-brand);
        background: var(--c-surface-alt);
        border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        font-size: var(--fs-sm);
      }
      @media (max-width: 900px) {
        .layout,
        .summary {
          grid-template-columns: 1fr;
        }
        .summary {
          justify-items: center;
          text-align: center;
        }
      }
    `,
  ],
  template: `
    <div class="container page">
      @if (loading()) {
        <app-loading-block [count]="1" [height]="260" label="Loading your result" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
        <p class="mt-3"><a routerLink="/attempts">Back to my attempts</a></p>
      } @else if (result(); as detail) {
        @if (timeUp()) {
          <div class="alert alert--warning mb-4" role="status">
            <div>
              <span class="alert__title">Time ran out</span>
              <div>
                The attempt was submitted automatically when the clock reached zero. Everything you
                had answered was graded; unanswered questions scored zero.
              </div>
            </div>
          </div>
        }

        <div class="page-head">
          <div>
            <p class="small muted">
              <a [routerLink]="['/exams', detail.examSlug]">{{ detail.examTitle }}</a>
              &middot; submitted {{ dateTime(detail.submittedAt) }}
            </p>
            <h1>{{ detail.passed ? 'Passed' : 'Not passed yet' }}</h1>
          </div>
          <div class="row">
            <a class="btn btn--secondary" routerLink="/attempts">My attempts</a>
            <a class="btn btn--primary" [routerLink]="['/exams', detail.examSlug]">
              Retake this exam
            </a>
          </div>
        </div>

        <!-- Headline ---------------------------------------------------- -->
        <section class="card mb-4">
          <div class="summary">
            <app-score-donut
              [percentage]="detail.percentage"
              [passMark]="detail.passPercentage"
              caption="score"
            />
            <div class="stack">
              <div class="breakdown">
                <div class="stat">
                  <div class="stat__label">Marks</div>
                  <div class="stat__value">{{ detail.score }}/{{ detail.maxScore }}</div>
                </div>
                <div class="stat">
                  <div class="stat__label">Correct</div>
                  <div class="stat__value text-success">{{ detail.correctCount }}</div>
                </div>
                <div class="stat">
                  <div class="stat__label">Incorrect</div>
                  <div class="stat__value text-danger">{{ detail.incorrectCount }}</div>
                </div>
                <div class="stat">
                  <div class="stat__label">Unanswered</div>
                  <div class="stat__value">{{ detail.unansweredCount }}</div>
                </div>
                <div class="stat">
                  <div class="stat__label">Time taken</div>
                  <div class="stat__value" style="font-size: var(--fs-lg)">
                    {{ duration(detail.timeSpentSeconds) }}
                  </div>
                  <div class="stat__hint">of {{ detail.durationMinutes }} min</div>
                </div>
              </div>
              <p class="small muted">
                Pass mark for this paper is {{ detail.passPercentage }}%. You scored
                {{ detail.percentage }}%.
                @if (detail.unansweredCount > 0) {
                  Answering the {{ detail.unansweredCount }} blank
                  {{ detail.unansweredCount === 1 ? 'question' : 'questions' }} is the quickest way
                  to improve.
                }
              </p>
            </div>
          </div>
        </section>

        <div class="layout">
          <!-- Review ------------------------------------------------- -->
          <section class="card">
            <div class="section-title">
              <h2>Answer review</h2>
              <div class="row">
                <button
                  type="button"
                  class="btn btn--sm"
                  [class.btn--primary]="filter() === 'all'"
                  [class.btn--secondary]="filter() !== 'all'"
                  (click)="filter.set('all')"
                >
                  All ({{ detail.questions.length }})
                </button>
                <button
                  type="button"
                  class="btn btn--sm"
                  [class.btn--primary]="filter() === 'wrong'"
                  [class.btn--secondary]="filter() !== 'wrong'"
                  data-testid="filter-wrong"
                  (click)="filter.set('wrong')"
                >
                  Incorrect ({{ detail.incorrectCount }})
                </button>
                <button
                  type="button"
                  class="btn btn--sm"
                  [class.btn--primary]="filter() === 'blank'"
                  [class.btn--secondary]="filter() !== 'blank'"
                  (click)="filter.set('blank')"
                >
                  Blank ({{ detail.unansweredCount }})
                </button>
              </div>
            </div>

            @if (visibleQuestions().length === 0) {
              <p class="small muted">Nothing to show with that filter.</p>
            }

            @for (question of visibleQuestions(); track question.id) {
              <article class="question" [attr.data-testid]="'review-' + question.position">
                <div class="row-between">
                  <span class="small strong">Question {{ question.position }}</span>
                  <span class="row">
                    <span class="badge">{{ question.topic.name }}</span>
                    @if (question.isCorrect) {
                      <span class="badge badge--success">Correct</span>
                    } @else if (question.selectedOptionId === null) {
                      <span class="badge badge--warning">Not answered</span>
                    } @else {
                      <span class="badge badge--danger">Incorrect</span>
                    }
                  </span>
                </div>

                <p class="question__prompt">{{ question.prompt }}</p>

                <div class="mt-3">
                  @for (option of question.options; track option.id) {
                    <div
                      class="answer"
                      [class.answer--correct]="option.isCorrect"
                      [class.answer--chosen-wrong]="
                        !option.isCorrect && option.id === question.selectedOptionId
                      "
                    >
                      <span>{{ option.text }}</span>
                      @if (option.isCorrect) {
                        <span class="answer__tag text-success">Correct answer</span>
                      } @else if (option.id === question.selectedOptionId) {
                        <span class="answer__tag text-danger">Your answer</span>
                      }
                    </div>
                  }
                </div>

                @if (question.explanation) {
                  <div class="explanation">
                    <strong>Why:</strong>
                    {{ question.explanation }}
                  </div>
                }
              </article>
            }
          </section>

          <aside class="stack">
            <section class="card">
              <div class="section-title">
                <h2>By topic</h2>
                <span class="small muted">This attempt</span>
              </div>
              @if (detail.topicScores.length === 0) {
                <p class="small muted">No topic data for this attempt.</p>
              } @else {
                <app-topic-bars [rows]="topicRows()" [passMark]="detail.passPercentage" />
              }
            </section>

            @if (detail.history.length >= 2) {
              <section class="card">
                <div class="section-title">
                  <h2>Your attempts at this exam</h2>
                </div>
                <app-progress-chart
                  [points]="historyPoints()"
                  [passMark]="detail.passPercentage"
                />
                <div class="table-wrap mt-3">
                  <table class="table">
                    <caption class="sr-only">Previous attempts at this exam</caption>
                    <thead>
                      <tr>
                        <th scope="col">Attempt</th>
                        <th scope="col">Submitted</th>
                        <th scope="col" class="num">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of detail.history; track row.attemptId; let i = $index) {
                        <tr>
                          <td>
                            @if (row.attemptId === detail.attemptId) {
                              <strong>#{{ i + 1 }} (this one)</strong>
                            } @else {
                              <a [routerLink]="['/attempts', row.attemptId, 'result']">
                                #{{ i + 1 }}
                              </a>
                            }
                          </td>
                          <td>{{ dateTime(row.submittedAt) }}</td>
                          <td class="num">{{ row.percentage }}%</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </section>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class ResultPage {
  readonly id = input.required<string>();

  private readonly attempts = inject(AttemptService);
  private readonly router = inject(Router);

  protected readonly result = signal<AttemptResultDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly filter = signal<'all' | 'wrong' | 'blank'>('all');

  protected readonly timeUp = computed(
    () => this.router.parseUrl(this.router.url).queryParams['timeUp'] === '1',
  );

  protected readonly visibleQuestions = computed(() => {
    const questions = this.result()?.questions ?? [];
    switch (this.filter()) {
      case 'wrong':
        return questions.filter((q) => !q.isCorrect && q.selectedOptionId !== null);
      case 'blank':
        return questions.filter((q) => q.selectedOptionId === null);
      default:
        return questions;
    }
  });

  protected readonly topicRows = computed(() =>
    (this.result()?.topicScores ?? []).map((topic) => ({
      label: topic.topic.name,
      value: topic.percentage,
      detail: `${topic.correct}/${topic.total}`,
    })),
  );

  protected readonly historyPoints = computed(() =>
    (this.result()?.history ?? []).map((row, index) => ({
      label: `Attempt ${index + 1}`,
      value: row.percentage,
    })),
  );

  constructor() {
    effect(() => {
      const attemptId = this.id();
      void this.load(attemptId);
    });
  }

  protected async load(attemptId = this.id()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.result.set(await this.attempts.getResult(attemptId));
    } catch (error) {
      if (ApiError.isApiError(error) && error.code === 'CONFLICT') {
        // Still in progress: send the learner back to the paper.
        await this.router.navigate(['/attempts', attemptId, 'take'], { replaceUrl: true });
        return;
      }
      this.error.set(
        ApiError.isApiError(error)
          ? error.status === 404
            ? 'That result does not exist, or it belongs to someone else.'
            : error.message
          : 'Could not load that result.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected dateTime(iso: string | null): string {
    return formatDateTime(iso);
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }
}
