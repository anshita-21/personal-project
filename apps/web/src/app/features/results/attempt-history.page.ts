import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AttemptResultSummary, Paginated } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AttemptService } from '../../core/data/attempt.service';
import { PaginationComponent } from '../../shared/components/pagination.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { formatDateTime, formatDuration } from '../../shared/util/format';

/**
 * Attempt history.
 *
 * A table rather than cards: the useful operation here is comparison down a
 * column (did my score go up?), which a grid of cards makes harder. Unfinished
 * attempts are shown with a Resume action instead of a score.
 */
@Component({
  selector: 'app-attempt-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    PaginationComponent,
    LoadingBlockComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1>My attempts</h1>
          <p>Every paper you have sat, newest first, with the score the server recorded.</p>
        </div>
        <a class="btn btn--secondary" routerLink="/exams">Take another exam</a>
      </div>

      @if (loading()) {
        <app-loading-block [count]="1" [height]="280" label="Loading your attempts" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (page(); as result) {
        @if (result.items.length === 0) {
          <app-empty-state
            title="No attempts yet"
            message="Once you sit a paper it will appear here with your score and a full answer review."
          >
            <a class="btn btn--primary" routerLink="/exams">Browse practice exams</a>
          </app-empty-state>
        } @else {
          <div class="row-between mb-3">
            <p class="small muted nums">
              {{ result.total }} {{ result.total === 1 ? 'attempt' : 'attempts' }} &middot; average
              {{ averagePercentage() }}%
            </p>
          </div>

          <div class="table-wrap">
            <table class="table" data-testid="attempt-table">
              <caption class="sr-only">Your exam attempts</caption>
              <thead>
                <tr>
                  <th scope="col">Exam</th>
                  <th scope="col">When</th>
                  <th scope="col" class="num">Score</th>
                  <th scope="col" class="num">Correct</th>
                  <th scope="col" class="num">Time</th>
                  <th scope="col">Outcome</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (attempt of result.items; track attempt.attemptId) {
                  <tr>
                    <td>
                      <a [routerLink]="['/exams', attempt.examSlug]">{{ attempt.examTitle }}</a>
                    </td>
                    <td class="small muted">{{ dateTime(attempt.submittedAt ?? attempt.startedAt) }}</td>
                    <td class="num">
                      @if (attempt.status === 'IN_PROGRESS') {
                        <span class="muted">-</span>
                      } @else {
                        <strong>{{ attempt.percentage }}%</strong>
                      }
                    </td>
                    <td class="num">
                      @if (attempt.status === 'IN_PROGRESS') {
                        <span class="muted">-</span>
                      } @else {
                        {{ attempt.correctCount }}/{{ attempt.questionCount }}
                      }
                    </td>
                    <td class="num small muted">
                      @if (attempt.status === 'IN_PROGRESS') {
                        <span class="muted">-</span>
                      } @else {
                        {{ duration(attempt.timeSpentSeconds) }}
                      }
                    </td>
                    <td>
                      @switch (attempt.status) {
                        @case ('IN_PROGRESS') {
                          <span class="badge badge--warning">In progress</span>
                        }
                        @case ('EXPIRED') {
                          <span class="badge badge--danger">Time ran out</span>
                        }
                        @default {
                          <span
                            class="badge"
                            [class.badge--success]="attempt.passed"
                            [class.badge--danger]="!attempt.passed"
                          >
                            {{ attempt.passed ? 'Passed' : 'Not passed' }}
                          </span>
                        }
                      }
                    </td>
                    <td class="text-right">
                      @if (attempt.status === 'IN_PROGRESS') {
                        <a
                          class="btn btn--primary btn--sm"
                          [routerLink]="['/attempts', attempt.attemptId, 'take']"
                        >
                          Resume
                        </a>
                      } @else {
                        <a
                          class="btn btn--secondary btn--sm"
                          [routerLink]="['/attempts', attempt.attemptId, 'result']"
                        >
                          Review
                        </a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <app-pagination
            [page]="result.page"
            [pageSize]="result.pageSize"
            [total]="result.total"
            [totalPages]="result.totalPages"
            label="Attempt pages"
            (pageChange)="goToPage($event)"
          />
        }
      }
    </div>
  `,
})
export class AttemptHistoryPage {
  private readonly attempts = inject(AttemptService);

  protected readonly page = signal<Paginated<AttemptResultSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly currentPage = signal(1);

  protected readonly averagePercentage = computed(() => {
    const graded = (this.page()?.items ?? []).filter((item) => item.status !== 'IN_PROGRESS');
    if (graded.length === 0) {
      return 0;
    }
    const total = graded.reduce((sum, item) => sum + item.percentage, 0);
    return Math.round((total / graded.length) * 100) / 100;
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.page.set(await this.attempts.listAttempts({ page: this.currentPage(), pageSize: 10 }));
    } catch (error) {
      this.error.set(
        ApiError.isApiError(error) ? error.message : 'Could not load your attempts.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected goToPage(page: number): void {
    this.currentPage.set(page);
    void this.load();
  }

  protected dateTime(iso: string | null): string {
    return formatDateTime(iso);
  }

  protected duration(seconds: number): string {
    return formatDuration(seconds);
  }
}
