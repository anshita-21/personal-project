import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ExamDetail } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AdminService, type AdminQuestionView } from '../../core/data/admin.service';
import {
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { difficultyLabel } from '../../shared/util/format';

/**
 * Pre-publication preview.
 *
 * Shows the paper exactly as it is stored, including the answer key and
 * explanations - this is the screen an author uses to proof-read before
 * publishing. It is reachable only through the admin router, which the server
 * gates on the ADMIN role; there is no learner-facing route that returns this
 * data.
 */
@Component({
  selector: 'app-admin-exam-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LoadingBlockComponent, ErrorStateComponent],
  styles: [
    `
      .question {
        border: 1px solid var(--c-border);
        border-radius: var(--radius);
        padding: var(--s-4);
        background: var(--c-surface);
      }
      .question + .question {
        margin-top: var(--s-3);
      }
      .prompt {
        white-space: pre-wrap;
        line-height: 1.6;
        margin-top: var(--s-2);
      }
      .option {
        display: flex;
        gap: var(--s-3);
        padding: var(--s-2) var(--s-3);
        border: 1px solid var(--c-border);
        border-radius: var(--radius-sm);
        font-size: var(--fs-sm);
        margin-top: var(--s-2);
      }
      .option--correct {
        border-color: #bfe3cb;
        background: var(--c-success-soft);
      }
      .explanation {
        margin-top: var(--s-3);
        padding: var(--s-3);
        border-left: 3px solid var(--c-brand);
        background: var(--c-surface-alt);
        font-size: var(--fs-sm);
      }
    `,
  ],
  template: `
    <div class="container page">
      @if (loading()) {
        <app-loading-block [count]="2" [height]="200" label="Loading the preview" />
      } @else if (error()) {
        <app-error-state [message]="error()!" (retry)="load()" />
        <p class="mt-3"><a routerLink="/admin/exams">Back to exams</a></p>
      } @else if (exam(); as detail) {
        <div class="page-head">
          <div>
            <nav class="small muted mb-2" aria-label="Breadcrumb">
              <a routerLink="/admin/exams">Exams</a> /
              <a [routerLink]="['/admin/exams', detail.id]">{{ detail.title }}</a> /
              <span>Preview</span>
            </nav>
            <h1>{{ detail.title }}</h1>
            <p class="small muted mt-2">
              <span class="badge">{{ detail.status }}</span>
              &middot; {{ detail.topic.name }} &middot; {{ label(detail.difficulty) }} &middot;
              {{ detail.durationMinutes }} min &middot; {{ questions().length }} questions
              &middot; {{ detail.totalPoints }} marks &middot; pass {{ detail.passPercentage }}%
            </p>
          </div>
          <a class="btn btn--secondary" [routerLink]="['/admin/exams', detail.id]">
            Back to editor
          </a>
        </div>

        <div class="alert alert--info mb-4">
          <div>
            <span class="alert__title">Author's view</span>
            <div>
              Correct answers and explanations are shown here. Learners never receive them until
              after they submit.
            </div>
          </div>
        </div>

        <p class="mb-4">{{ detail.description }}</p>

        @if (questions().length === 0) {
          <div class="card">
            <p class="small muted">
              This exam has no questions yet, so it cannot be published.
              <a [routerLink]="['/admin/exams', detail.id]">Add some</a>.
            </p>
          </div>
        }

        @for (question of questions(); track question.id) {
          <article class="question">
            <div class="row-between">
              <strong class="small">Question {{ question.position }}</strong>
              <span class="row">
                <span class="badge">{{ question.topic.name }}</span>
                <span class="badge">
                  {{ question.points }} {{ question.points === 1 ? 'mark' : 'marks' }}
                </span>
              </span>
            </div>

            <p class="prompt">{{ question.prompt }}</p>

            @for (option of question.options; track option.id) {
              <div class="option" [class.option--correct]="option.isCorrect">
                <span>{{ option.text }}</span>
                @if (option.isCorrect) {
                  <span class="text-success strong" style="margin-left: auto">Correct</span>
                }
              </div>
            }

            @if (question.explanation) {
              <div class="explanation"><strong>Explanation:</strong> {{ question.explanation }}</div>
            } @else {
              <p class="xs muted mt-3">No explanation written for this question yet.</p>
            }
          </article>
        }
      }
    </div>
  `,
})
export class AdminExamPreviewPage {
  readonly id = input.required<string>();

  private readonly admin = inject(AdminService);

  protected readonly exam = signal<ExamDetail | null>(null);
  protected readonly questions = signal<AdminQuestionView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const examId = this.id();
      void this.load(examId);
    });
  }

  protected async load(examId = this.id()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [detail, questions] = await Promise.all([
        this.admin.getExam(examId),
        this.admin.getQuestions(examId),
      ]);
      this.exam.set(detail);
      this.questions.set(questions);
    } catch (error) {
      this.error.set(ApiError.isApiError(error) ? error.message : 'Could not load the preview.');
    } finally {
      this.loading.set(false);
    }
  }

  protected label(value: 'EASY' | 'MEDIUM' | 'HARD'): string {
    return difficultyLabel(value);
  }
}
