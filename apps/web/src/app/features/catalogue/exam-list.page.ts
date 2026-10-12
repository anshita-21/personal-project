import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DIFFICULTIES,
  EXAM_SORT_FIELDS,
  type ExamQuery,
  type ExamSummary,
  type Paginated,
  type TopicView,
} from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { AttemptService } from '../../core/data/attempt.service';
import { ExamService } from '../../core/data/exam.service';
import { ToastService } from '../../core/notifications/toast.service';
import { PaginationComponent } from '../../shared/components/pagination.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { difficultyLabel } from '../../shared/util/format';

/**
 * The exam catalogue.
 *
 * Filters live in the URL query string, so a filtered view is linkable, back
 * and forward work as a user expects, and a refresh does not reset the search.
 * The search box is debounced: typing "javascript" should be one request, not
 * ten.
 */
@Component({
  selector: 'app-exam-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PaginationComponent,
    LoadingBlockComponent,
    ErrorStateComponent,
    EmptyStateComponent,
  ],
  styles: [
    `
      .exam-card {
        display: flex;
        flex-direction: column;
        gap: var(--s-3);
      }
      .exam-card__desc {
        color: var(--c-text-muted);
        font-size: var(--fs-sm);
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    `,
  ],
  template: `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1>Practice exams</h1>
          <p>
            Full-length timed papers. Answers save automatically, and every question comes with an
            explanation once you submit.
          </p>
        </div>
      </div>

      <!-- Filters ------------------------------------------------------- -->
      <form class="toolbar" [formGroup]="filters" role="search" (ngSubmit)="apply()">
        <div class="field field--grow">
          <label class="field__label" for="search">Search</label>
          <input
            id="search"
            class="input"
            type="search"
            formControlName="search"
            placeholder="Title, description or topic"
            data-testid="exam-search"
          />
        </div>

        <div class="field">
          <label class="field__label" for="topic">Topic</label>
          <select id="topic" class="select" formControlName="topicId">
            <option value="">All topics</option>
            @for (topic of topics(); track topic.id) {
              <option [value]="topic.id">{{ topic.name }}</option>
            }
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="difficulty">Difficulty</label>
          <select id="difficulty" class="select" formControlName="difficulty">
            <option value="">Any</option>
            @for (level of difficulties; track level) {
              <option [value]="level">{{ label(level) }}</option>
            }
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="sort">Sort by</label>
          <select id="sort" class="select" formControlName="sort">
            <option value="createdAt">Newest</option>
            <option value="title">Title</option>
            <option value="durationMinutes">Duration</option>
            <option value="difficulty">Difficulty</option>
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="order">Order</label>
          <select id="order" class="select" formControlName="order">
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        @if (hasFilters()) {
          <button type="button" class="btn btn--ghost" (click)="reset()">Clear</button>
        }
      </form>

      <!-- Results ------------------------------------------------------- -->
      @if (loading()) {
        <div class="grid">
          <app-loading-block [count]="6" [height]="190" label="Loading exams" />
        </div>
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (page(); as result) {
        @if (result.items.length === 0) {
          <app-empty-state
            title="No exams match those filters"
            message="Try a broader search, or clear the filters to see everything that is published."
          >
            <button type="button" class="btn btn--secondary" (click)="reset()">
              Clear filters
            </button>
          </app-empty-state>
        } @else {
          <div class="grid" data-testid="exam-grid">
            @for (exam of result.items; track exam.id) {
              <article class="card card--interactive exam-card">
                <div class="row">
                  <span class="badge badge--brand">{{ exam.topic.name }}</span>
                  <span class="badge">{{ label(exam.difficulty) }}</span>
                  @if (exam.activeAttemptId) {
                    <span class="badge badge--warning">In progress</span>
                  } @else if (exam.bestPercentage !== null && exam.bestPercentage !== undefined) {
                    <span class="badge badge--success">Best {{ exam.bestPercentage }}%</span>
                  }
                </div>

                <h2 class="card__title">
                  <a [routerLink]="['/exams', exam.slug]">{{ exam.title }}</a>
                </h2>
                <p class="exam-card__desc">{{ exam.description }}</p>

                <div class="card__meta">
                  <span>{{ exam.questionCount }} questions</span>
                  <span>{{ exam.durationMinutes }} min</span>
                  <span>Pass {{ exam.passPercentage }}%</span>
                </div>

                <div class="card__footer">
                  <a class="btn btn--secondary btn--sm" [routerLink]="['/exams', exam.slug]">
                    Details
                  </a>
                  @if (exam.activeAttemptId) {
                    <a
                      class="btn btn--primary btn--sm"
                      [routerLink]="['/attempts', exam.activeAttemptId, 'take']"
                    >
                      Resume
                    </a>
                  } @else {
                    <button
                      type="button"
                      class="btn btn--primary btn--sm"
                      [disabled]="startingId() === exam.id"
                      (click)="start(exam)"
                    >
                      {{ startingId() === exam.id ? 'Starting...' : 'Start' }}
                    </button>
                  }
                </div>
              </article>
            }
          </div>

          <app-pagination
            [page]="result.page"
            [pageSize]="result.pageSize"
            [total]="result.total"
            [totalPages]="result.totalPages"
            label="Exam pages"
            (pageChange)="goToPage($event)"
          />
        }
      }
    </div>
  `,
})
export class ExamListPage {
  private readonly exams = inject(ExamService);
  private readonly attempts = inject(AttemptService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly difficulties = DIFFICULTIES;
  protected readonly topics = signal<TopicView[]>([]);
  protected readonly page = signal<Paginated<ExamSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly startingId = signal<string | null>(null);

  private readonly currentPage = signal(1);

  protected readonly filters = inject(FormBuilder).nonNullable.group({
    search: '',
    topicId: '',
    difficulty: '',
    sort: 'createdAt',
    order: 'desc',
  });

  protected readonly hasFilters = computed(() => {
    const value = this.filters.getRawValue();
    return Boolean(value.search || value.topicId || value.difficulty);
  });

  constructor() {
    this.readFiltersFromUrl();

    // Debounce only the text input; a select change should feel immediate.
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.apply());

    for (const control of [
      this.filters.controls.topicId,
      this.filters.controls.difficulty,
      this.filters.controls.sort,
      this.filters.controls.order,
    ]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.apply());
    }

    void this.loadTopics();
    void this.load();
  }

  protected apply(): void {
    this.currentPage.set(1);
    void this.syncUrl();
    void this.load();
  }

  protected reset(): void {
    this.filters.setValue({
      search: '',
      topicId: '',
      difficulty: '',
      sort: 'createdAt',
      order: 'desc',
    });
  }

  protected goToPage(page: number): void {
    this.currentPage.set(page);
    void this.syncUrl();
    void this.load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.page.set(await this.exams.listExams(this.queryFromForm()));
    } catch (error) {
      this.error.set(
        ApiError.isApiError(error) ? error.message : 'Could not load the exam catalogue.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected label(value: 'EASY' | 'MEDIUM' | 'HARD'): string {
    return difficultyLabel(value);
  }

  /**
   * Starting from a card requires a session. An anonymous visitor is sent to
   * sign in with a returnUrl so they land back on this exam, not on a generic
   * dashboard.
   */
  protected async start(exam: ExamSummary): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      await this.router.navigate(['/login'], {
        queryParams: { returnUrl: `/exams/${exam.slug}` },
      });
      return;
    }

    this.startingId.set(exam.id);
    try {
      const state = await this.attempts.start(exam.id);
      await this.router.navigate(['/attempts', state.attemptId, 'take']);
    } catch (error) {
      this.toasts.error(
        ApiError.isApiError(error) ? error.message : 'Could not start that exam.',
      );
    } finally {
      this.startingId.set(null);
    }
  }

  private queryFromForm(): Partial<ExamQuery> {
    const value = this.filters.getRawValue();
    const sort = (EXAM_SORT_FIELDS as readonly string[]).includes(value.sort)
      ? (value.sort as ExamQuery['sort'])
      : 'createdAt';

    return {
      page: this.currentPage(),
      sort,
      order: value.order === 'asc' ? 'asc' : 'desc',
      ...(value.search ? { search: value.search } : {}),
      ...(value.topicId ? { topicId: value.topicId } : {}),
      ...(value.difficulty ? { difficulty: value.difficulty as ExamQuery['difficulty'] } : {}),
    };
  }

  private readFiltersFromUrl(): void {
    const params = this.router.parseUrl(this.router.url).queryParams;
    const read = (key: string, fallback: string): string =>
      typeof params[key] === 'string' ? (params[key] as string) : fallback;

    this.filters.setValue(
      {
        search: read('search', ''),
        topicId: read('topicId', ''),
        difficulty: read('difficulty', ''),
        sort: read('sort', 'createdAt'),
        order: read('order', 'desc'),
      },
      { emitEvent: false },
    );
    this.currentPage.set(Number(read('page', '1')) || 1);
  }

  private async syncUrl(): Promise<void> {
    const value = this.filters.getRawValue();
    await this.router.navigate([], {
      queryParams: {
        search: value.search || null,
        topicId: value.topicId || null,
        difficulty: value.difficulty || null,
        sort: value.sort === 'createdAt' ? null : value.sort,
        order: value.order === 'desc' ? null : value.order,
        page: this.currentPage() === 1 ? null : this.currentPage(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private async loadTopics(): Promise<void> {
    try {
      this.topics.set(await this.exams.listTopics());
    } catch {
      // A missing topic list degrades the filter, not the page: the catalogue
      // still renders and the other filters still work.
      this.topics.set([]);
    }
  }
}
