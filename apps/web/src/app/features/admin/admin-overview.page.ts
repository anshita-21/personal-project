import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminStats } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { DashboardService } from '../../core/data/dashboard.service';
import { TopicBarsComponent } from '../../shared/components/topic-bars.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';

/**
 * Administrator overview.
 *
 * Also served by the GraphQL endpoint (`adminStats`), which is role-gated in
 * the resolver - a student asking for this query gets a FORBIDDEN error, not an
 * empty object.
 */
@Component({
  selector: 'app-admin-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    LoadingBlockComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    TopicBarsComponent,
  ],
  styles: [
    `
      .layout {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: 1.5fr 1fr;
        align-items: start;
      }
      @media (max-width: 900px) {
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
          <span class="badge badge--brand">Administration</span>
          <h1 class="mt-2">Platform overview</h1>
          <p>Content inventory and how learners are performing across every published paper.</p>
        </div>
        <div class="row">
          <a class="btn btn--secondary" routerLink="/admin/exams">Manage exams</a>
          <a class="btn btn--primary" routerLink="/admin/exams/new">New exam</a>
        </div>
      </div>

      @if (loading()) {
        <app-loading-block [count]="2" [height]="150" label="Loading statistics" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (stats(); as data) {
        <section class="grid-stats mb-4" aria-label="Platform statistics">
          <div class="stat">
            <div class="stat__label">Learners</div>
            <div class="stat__value">{{ data.totalStudents }}</div>
            <div class="stat__hint">{{ data.totalUsers }} accounts in total</div>
          </div>
          <div class="stat">
            <div class="stat__label">Published exams</div>
            <div class="stat__value">{{ data.publishedExams }}</div>
            <div class="stat__hint">
              {{ data.draftExams }} draft &middot; {{ data.archivedExams }} archived
            </div>
          </div>
          <div class="stat">
            <div class="stat__label">Questions</div>
            <div class="stat__value">{{ data.totalQuestions }}</div>
            <div class="stat__hint">across {{ data.totalExams }} exams</div>
          </div>
          <div class="stat">
            <div class="stat__label">Attempts</div>
            <div class="stat__value">{{ data.totalAttempts }}</div>
            <div class="stat__hint">
              {{ data.completedAttempts }} graded &middot; {{ data.inProgressAttempts }} live
            </div>
          </div>
          <div class="stat">
            <div class="stat__label">Average score</div>
            <div class="stat__value">{{ data.averagePercentage }}%</div>
            <div class="stat__hint">All graded attempts</div>
          </div>
        </section>

        <div class="layout">
          <section class="card">
            <div class="section-title">
              <h2>Exam performance</h2>
              <span class="small muted">Most attempted first</span>
            </div>

            @if (data.examPerformance.length === 0) {
              <app-empty-state
                title="No attempts yet"
                message="Once learners start sitting papers, per-exam averages and pass rates appear here."
              />
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">Average score and pass rate per exam</caption>
                  <thead>
                    <tr>
                      <th scope="col">Exam</th>
                      <th scope="col" class="num">Attempts</th>
                      <th scope="col" class="num">Average</th>
                      <th scope="col" class="num">Pass rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of data.examPerformance; track row.examId) {
                      <tr>
                        <td>
                          <a [routerLink]="['/admin/exams', row.examId]">{{ row.title }}</a>
                        </td>
                        <td class="num">{{ row.attempts }}</td>
                        <td class="num">{{ row.averagePercentage }}%</td>
                        <td class="num">{{ row.passRate }}%</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <section class="card">
            <div class="section-title">
              <h2>Hardest papers</h2>
              <span class="small muted">By average score</span>
            </div>
            @if (data.examPerformance.length === 0) {
              <p class="small muted">No data yet.</p>
            } @else {
              <app-topic-bars [rows]="difficultyRows()" sort="weakest" />
              <p class="xs muted mt-3">
                A paper with a very low average may be mis-keyed rather than hard - worth opening
                the question list to check.
              </p>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class AdminOverviewPage {
  private readonly dashboards = inject(DashboardService);

  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly difficultyRows = computed(() =>
    (this.stats()?.examPerformance ?? []).map((row) => ({
      label: row.title,
      value: row.averagePercentage,
      detail: `${row.attempts} ${row.attempts === 1 ? 'attempt' : 'attempts'}`,
    })),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.stats.set(await this.dashboards.getAdminStats());
    } catch (error) {
      this.error.set(
        ApiError.isApiError(error) ? error.message : 'Could not load the statistics.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
