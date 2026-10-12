import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { StudentDashboard } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { AttemptService } from '../../core/data/attempt.service';
import { DashboardService } from '../../core/data/dashboard.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ProgressChartComponent } from '../../shared/components/progress-chart.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { TopicBarsComponent } from '../../shared/components/topic-bars.component';
import { difficultyLabel, formatRelative, scoreTone } from '../../shared/util/format';

/**
 * The learner's home screen.
 *
 * Every number here comes from the GraphQL `studentDashboard` query - one
 * request for the whole page. Nothing is computed from placeholder data, so an
 * account with no history renders honest zeros and a "take your first exam"
 * call to action rather than invented statistics.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LoadingBlockComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    TopicBarsComponent,
    ProgressChartComponent,
  ],
  styles: [
    `
      .next-action {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-4);
        align-items: center;
        justify-content: space-between;
        padding: var(--s-4) var(--s-5);
        border-radius: var(--radius-lg);
        background: linear-gradient(180deg, var(--c-brand-soft), var(--c-surface));
        border: 1px solid var(--c-border);
      }
      .next-action h2 {
        font-size: var(--fs-lg);
      }
      .layout {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: 1.4fr 1fr;
        align-items: start;
      }
      .attempt-row {
        display: flex;
        gap: var(--s-3);
        align-items: center;
        justify-content: space-between;
        padding: var(--s-3) 0;
        border-bottom: 1px solid var(--c-border);
      }
      .attempt-row:last-child {
        border-bottom: 0;
      }
      .attempt-row__score {
        font-variant-numeric: tabular-nums;
        font-weight: 680;
      }
      @media (max-width: 920px) {
        .layout {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
  template: `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1>Welcome back, {{ firstName() }}</h1>
          <p>Your progress, your weak spots, and the single best thing to do next.</p>
        </div>
        <a class="btn btn--secondary" routerLink="/exams">Browse all exams</a>
      </div>

      @if (loading()) {
        <app-loading-block [count]="2" [height]="160" label="Loading your dashboard" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (data(); as dashboard) {
        <!-- Next action ------------------------------------------------- -->
        <section class="next-action mb-4" data-testid="next-action">
          <div>
            <h2>{{ dashboard.nextAction.label }}</h2>
            <p class="muted small mt-2">{{ dashboard.nextAction.detail }}</p>
          </div>
          @if (dashboard.nextAction.attemptId) {
            <a
              class="btn btn--primary btn--lg"
              [routerLink]="['/attempts', dashboard.nextAction.attemptId, 'take']"
            >
              Resume attempt
            </a>
          } @else if (dashboard.nextAction.examId) {
            <button
              type="button"
              class="btn btn--primary btn--lg"
              [disabled]="starting()"
              (click)="startExam(dashboard.nextAction.examId!)"
            >
              {{ starting() ? 'Starting...' : 'Start now' }}
            </button>
          } @else {
            <a class="btn btn--primary btn--lg" routerLink="/exams">Browse exams</a>
          }
        </section>

        <!-- Headline statistics ----------------------------------------- -->
        <section class="grid-stats mb-4" aria-label="Your statistics">
          <div class="stat">
            <div class="stat__label">Exams completed</div>
            <div class="stat__value">{{ dashboard.stats.attemptsCompleted }}</div>
            <div class="stat__hint">{{ dashboard.stats.examsAvailable }} available</div>
          </div>
          <div class="stat">
            <div class="stat__label">Average score</div>
            <div class="stat__value">{{ dashboard.stats.averagePercentage }}%</div>
            <div class="stat__hint">Best {{ dashboard.stats.bestPercentage }}%</div>
          </div>
          <div class="stat">
            <div class="stat__label">Answer accuracy</div>
            <div class="stat__value">{{ dashboard.stats.accuracy }}%</div>
            <div class="stat__hint">
              {{ dashboard.stats.totalCorrect }} of
              {{ dashboard.stats.totalQuestionsAnswered }} answered
            </div>
          </div>
          <div class="stat">
            <div class="stat__label">Pass rate</div>
            <div class="stat__value">{{ dashboard.stats.passRate }}%</div>
            <div class="stat__hint">Recent attempts</div>
          </div>
          <div class="stat">
            <div class="stat__label">In progress</div>
            <div class="stat__value">{{ dashboard.stats.attemptsInProgress }}</div>
            <div class="stat__hint">Unfinished attempts</div>
          </div>
        </section>

        <div class="layout">
          <div class="stack">
            <!-- Progress over time -------------------------------------- -->
            <section class="card">
              <div class="section-title">
                <h2>Score over time</h2>
                <span class="small muted">Pass mark shown dashed</span>
              </div>
              @if (dashboard.progress.length >= 2) {
                <app-progress-chart [points]="progressPoints()" />
                <p class="xs muted mt-2">
                  Oldest to newest, last {{ dashboard.progress.length }} graded attempts.
                </p>
              } @else {
                <p class="small muted">
                  Complete at least two exams and your score trend will appear here.
                </p>
              }
            </section>

            <!-- Recent attempts ----------------------------------------- -->
            <section class="card">
              <div class="section-title">
                <h2>Recent attempts</h2>
                <a class="small" routerLink="/attempts">View all</a>
              </div>

              @if (dashboard.recentAttempts.length === 0) {
                <p class="small muted">No completed attempts yet.</p>
              } @else {
                <ul>
                  @for (attempt of dashboard.recentAttempts; track attempt.attemptId) {
                    <li class="attempt-row">
                      <div class="stack-sm">
                        <a
                          class="strong"
                          [routerLink]="['/attempts', attempt.attemptId, 'result']"
                        >
                          {{ attempt.examTitle }}
                        </a>
                        <span class="xs muted">
                          {{ relative(attempt.submittedAt) }}
                          @if (attempt.status === 'EXPIRED') {
                            &middot; ran out of time
                          }
                        </span>
                      </div>
                      <div class="row">
                        <span class="attempt-row__score">{{ attempt.percentage ?? 0 }}%</span>
                        <span
                          class="badge"
                          [class.badge--success]="attempt.passed"
                          [class.badge--danger]="!attempt.passed"
                        >
                          {{ attempt.passed ? 'Passed' : 'Not passed' }}
                        </span>
                      </div>
                    </li>
                  }
                </ul>
              }
            </section>
          </div>

          <div class="stack">
            <!-- Unfinished attempts ------------------------------------- -->
            @if (dashboard.inProgressAttempts.length > 0) {
              <section class="card">
                <div class="section-title"><h2>Pick up where you left off</h2></div>
                <ul class="stack-sm">
                  @for (attempt of dashboard.inProgressAttempts; track attempt.attemptId) {
                    <li class="row-between">
                      <span class="small truncate">{{ attempt.examTitle }}</span>
                      <a
                        class="btn btn--secondary btn--sm"
                        [routerLink]="['/attempts', attempt.attemptId, 'take']"
                      >
                        Resume
                      </a>
                    </li>
                  }
                </ul>
              </section>
            }

            <!-- Topic strengths ----------------------------------------- -->
            <section class="card">
              <div class="section-title">
                <h2>Topic accuracy</h2>
                <span class="small muted">Weakest first</span>
              </div>
              @if (dashboard.topicPerformance.length === 0) {
                <p class="small muted">
                  Answer some questions and your per-topic accuracy will show up here.
                </p>
              } @else {
                <app-topic-bars [rows]="topicRows()" />
              }
            </section>

            <!-- Recommendations ----------------------------------------- -->
            <section class="card">
              <div class="section-title"><h2>Recommended for you</h2></div>
              @if (dashboard.recommendedExams.length === 0) {
                <app-empty-state
                  title="Nothing published yet"
                  message="There are no published exams at the moment."
                />
              } @else {
                <ul class="stack-sm">
                  @for (exam of dashboard.recommendedExams; track exam.id) {
                    <li class="stack-sm" style="padding-bottom: var(--s-3)">
                      <a class="strong" [routerLink]="['/exams', exam.slug]">{{ exam.title }}</a>
                      <span class="xs muted">
                        {{ exam.topic.name }} &middot; {{ difficulty(exam.difficulty) }} &middot;
                        {{ exam.questionCount }} questions &middot; {{ exam.durationMinutes }} min
                      </span>
                    </li>
                  }
                </ul>
              }
            </section>
          </div>
        </div>
      }
    </div>
  `,
})
export class DashboardPage {
  private readonly dashboards = inject(DashboardService);
  private readonly attempts = inject(AttemptService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly data = signal<StudentDashboard | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly starting = signal(false);

  protected readonly firstName = computed(
    () => this.auth.displayName().split(' ')[0] ?? 'there',
  );

  protected readonly topicRows = computed(() =>
    (this.data()?.topicPerformance ?? []).map((topic) => ({
      label: topic.topicName,
      value: topic.accuracy,
      detail: `${topic.correct}/${topic.answered}`,
    })),
  );

  protected readonly progressPoints = computed(() =>
    (this.data()?.progress ?? []).map((point) => ({
      label: point.examTitle,
      value: point.percentage,
    })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.dashboards.getStudentDashboard());
    } catch (error) {
      this.error.set(
        ApiError.isApiError(error) ? error.message : 'Could not load your dashboard.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async startExam(examId: string): Promise<void> {
    this.starting.set(true);
    try {
      const state = await this.attempts.start(examId);
      await this.router.navigate(['/attempts', state.attemptId, 'take']);
    } catch (error) {
      this.toasts.error(
        ApiError.isApiError(error) ? error.message : 'Could not start that exam.',
      );
    } finally {
      this.starting.set(false);
    }
  }

  protected relative(iso: string | null): string {
    return formatRelative(iso);
  }

  protected difficulty(value: 'EASY' | 'MEDIUM' | 'HARD'): string {
    return difficultyLabel(value);
  }

  protected tone(percentage: number): string {
    return scoreTone(percentage);
  }
}
