import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import type { AdminExamSummary, Paginated } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AdminService } from '../../core/data/admin.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import { PaginationComponent } from '../../shared/components/pagination.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { difficultyLabel, formatRelative } from '../../shared/util/format';

type PendingAction =
  | { kind: 'publish'; exam: AdminExamSummary }
  | { kind: 'archive'; exam: AdminExamSummary }
  | { kind: 'unpublish'; exam: AdminExamSummary }
  | { kind: 'delete'; exam: AdminExamSummary };

/**
 * Exam management.
 *
 * Publishing, archiving and deleting all go through a confirmation dialog -
 * publishing exposes a paper to every learner, and deleting is irreversible.
 * The API refuses to delete an exam that has attempts, and the UI says so
 * rather than offering an action that will fail.
 */
@Component({
  selector: 'app-admin-exam-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PaginationComponent,
    LoadingBlockComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <div class="container page">
      <div class="page-head">
        <div>
          <span class="badge badge--brand">Administration</span>
          <h1 class="mt-2">Exams</h1>
          <p>Every paper in every state. Drafts are invisible to learners until published.</p>
        </div>
        <a class="btn btn--primary" routerLink="/admin/exams/new" data-testid="new-exam">
          New exam
        </a>
      </div>

      <form class="toolbar" [formGroup]="filters">
        <div class="field field--grow">
          <label class="field__label" for="search">Search</label>
          <input
            id="search"
            class="input"
            type="search"
            formControlName="search"
            placeholder="Title, description or topic"
          />
        </div>
        <div class="field">
          <label class="field__label" for="status">Status</label>
          <select id="status" class="select" formControlName="status">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="sort">Sort</label>
          <select id="sort" class="select" formControlName="sort">
            <option value="createdAt">Newest</option>
            <option value="title">Title</option>
          </select>
        </div>
      </form>

      @if (loading()) {
        <app-loading-block [count]="1" [height]="320" label="Loading exams" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
      } @else if (page(); as result) {
        @if (result.items.length === 0) {
          <app-empty-state
            title="No exams match"
            message="Create your first exam, or clear the filters."
          >
            <a class="btn btn--primary" routerLink="/admin/exams/new">New exam</a>
          </app-empty-state>
        } @else {
          <div class="table-wrap">
            <table class="table" data-testid="admin-exam-table">
              <caption class="sr-only">All exams</caption>
              <thead>
                <tr>
                  <th scope="col">Exam</th>
                  <th scope="col">Status</th>
                  <th scope="col" class="num">Questions</th>
                  <th scope="col" class="num">Attempts</th>
                  <th scope="col">Updated</th>
                  <th scope="col"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (exam of result.items; track exam.id) {
                  <tr>
                    <td>
                      <a [routerLink]="['/admin/exams', exam.id]" class="strong">
                        {{ exam.title }}
                      </a>
                      <div class="xs muted">
                        {{ exam.topic.name }} &middot; {{ label(exam.difficulty) }} &middot;
                        {{ exam.durationMinutes }} min &middot; pass {{ exam.passPercentage }}%
                      </div>
                    </td>
                    <td>
                      <span class="badge" [class]="statusClass(exam.status)">
                        {{ exam.status }}
                      </span>
                    </td>
                    <td class="num">{{ exam.questionCount }}</td>
                    <td class="num">{{ exam.attemptTotal }}</td>
                    <td class="small muted">{{ relative(exam.updatedAt) }}</td>
                    <td class="text-right">
                      <div class="row" style="justify-content: flex-end">
                        <a
                          class="btn btn--secondary btn--sm"
                          [routerLink]="['/admin/exams', exam.id, 'preview']"
                        >
                          Preview
                        </a>
                        @if (exam.status !== 'PUBLISHED') {
                          <button
                            type="button"
                            class="btn btn--primary btn--sm"
                            [attr.data-testid]="'publish-' + exam.id"
                            (click)="ask({ kind: 'publish', exam })"
                          >
                            Publish
                          </button>
                        } @else {
                          <button
                            type="button"
                            class="btn btn--secondary btn--sm"
                            (click)="ask({ kind: 'unpublish', exam })"
                          >
                            Unpublish
                          </button>
                        }
                        @if (exam.status !== 'ARCHIVED') {
                          <button
                            type="button"
                            class="btn btn--ghost btn--sm"
                            (click)="ask({ kind: 'archive', exam })"
                          >
                            Archive
                          </button>
                        }
                        @if (exam.attemptTotal === 0) {
                          <button
                            type="button"
                            class="btn btn--ghost btn--sm"
                            (click)="ask({ kind: 'delete', exam })"
                          >
                            Delete
                          </button>
                        }
                      </div>
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
            label="Exam pages"
            (pageChange)="goToPage($event)"
          />
        }
      }

      <app-confirm-dialog
        [open]="pending() !== null"
        [title]="confirmTitle()"
        [message]="confirmMessage()"
        [confirmLabel]="confirmLabel()"
        [destructive]="pending()?.kind === 'delete'"
        (confirmed)="runPending()"
        (cancelled)="pending.set(null)"
      />
    </div>
  `,
})
export class AdminExamListPage {
  private readonly admin = inject(AdminService);
  private readonly toasts = inject(ToastService);

  protected readonly page = signal<Paginated<AdminExamSummary> | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal<PendingAction | null>(null);
  private readonly currentPage = signal(1);

  protected readonly filters = inject(FormBuilder).nonNullable.group({
    search: '',
    status: '',
    sort: 'createdAt',
  });

  protected readonly confirmTitle = computed(() => {
    const action = this.pending();
    if (!action) {
      return '';
    }
    return {
      publish: 'Publish this exam?',
      unpublish: 'Return this exam to draft?',
      archive: 'Archive this exam?',
      delete: 'Delete this exam permanently?',
    }[action.kind];
  });

  protected readonly confirmMessage = computed(() => {
    const action = this.pending();
    if (!action) {
      return '';
    }
    switch (action.kind) {
      case 'publish':
        return `"${action.exam.title}" becomes visible to every learner and can be attempted immediately. The exam must pass its publish checks.`;
      case 'unpublish':
        return `"${action.exam.title}" is hidden from the catalogue. Existing results are kept, and learners with an attempt in progress can still finish it.`;
      case 'archive':
        return `"${action.exam.title}" is retired from the catalogue. All past results stay intact - this is the safe way to withdraw a paper that has been attempted.`;
      case 'delete':
        return `"${action.exam.title}" and all of its questions are deleted. This cannot be undone. Only exams with no attempts can be deleted.`;
    }
  });

  protected readonly confirmLabel = computed(() => {
    const action = this.pending();
    if (!action) {
      return 'Confirm';
    }
    return { publish: 'Publish', unpublish: 'Unpublish', archive: 'Archive', delete: 'Delete' }[
      action.kind
    ];
  });

  constructor() {
    this.filters.controls.search.valueChanges
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload());

    this.filters.controls.status.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.reload());
    this.filters.controls.sort.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.reload());

    void this.load();
  }

  protected ask(action: PendingAction): void {
    this.pending.set(action);
  }

  protected async runPending(): Promise<void> {
    const action = this.pending();
    this.pending.set(null);
    if (!action) {
      return;
    }

    try {
      switch (action.kind) {
        case 'publish':
          await this.admin.publish(action.exam.id);
          this.toasts.success(`"${action.exam.title}" is now live.`);
          break;
        case 'unpublish':
          await this.admin.unpublish(action.exam.id);
          this.toasts.success(`"${action.exam.title}" is back to draft.`);
          break;
        case 'archive':
          await this.admin.archive(action.exam.id);
          this.toasts.success(`"${action.exam.title}" has been archived.`);
          break;
        case 'delete':
          await this.admin.deleteExam(action.exam.id);
          this.toasts.success(`"${action.exam.title}" has been deleted.`);
          break;
      }
      await this.load();
    } catch (error) {
      if (ApiError.isApiError(error) && error.code === 'EXAM_NOT_PUBLISHABLE') {
        // The publish checks failed; list the actual problems rather than a
        // generic failure, and point at the editor where they can be fixed.
        const problems = error.details.map((issue) => issue.message).join(' ');
        this.toasts.error(`Cannot publish yet. ${problems}`);
        return;
      }
      this.toasts.error(
        ApiError.isApiError(error) ? error.message : 'That action could not be completed.',
      );
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const value = this.filters.getRawValue();
    try {
      this.page.set(
        await this.admin.listExams({
          page: this.currentPage(),
          pageSize: 10,
          sort: value.sort === 'title' ? 'title' : 'createdAt',
          order: value.sort === 'title' ? 'asc' : 'desc',
          ...(value.search ? { search: value.search } : {}),
          ...(value.status ? { status: value.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' } : {}),
        }),
      );
    } catch (error) {
      this.error.set(ApiError.isApiError(error) ? error.message : 'Could not load the exams.');
    } finally {
      this.loading.set(false);
    }
  }

  protected goToPage(page: number): void {
    this.currentPage.set(page);
    void this.load();
  }

  protected label(value: 'EASY' | 'MEDIUM' | 'HARD'): string {
    return difficultyLabel(value);
  }

  protected relative(iso: string): string {
    return formatRelative(iso);
  }

  protected statusClass(status: string): string {
    return {
      PUBLISHED: 'badge--success',
      DRAFT: 'badge--warning',
      ARCHIVED: 'badge--danger',
    }[status] ?? '';
  }

  private reload(): void {
    this.currentPage.set(1);
    void this.load();
  }
}
