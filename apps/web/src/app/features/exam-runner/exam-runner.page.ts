import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import {
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { formatClock } from '../../shared/util/format';
import { ExamRunnerStore } from './exam-runner.store';

/**
 * The exam-taking screen.
 *
 * Layout is deliberately plain: one question at a time, large tap targets, a
 * question grid for navigation, and a timer that is visible without being the
 * loudest thing on screen (it only turns red in the last two minutes).
 *
 * Keyboard support matters here - a learner should not need a mouse:
 *   1-6        select that option
 *   ArrowLeft  previous question
 *   ArrowRight next question
 */
@Component({
  selector: 'app-exam-runner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ExamRunnerStore],
  imports: [LoadingBlockComponent, ErrorStateComponent, ConfirmDialogComponent],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [
    `
      .runner {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: 1fr 260px;
        align-items: start;
      }
      .timer-bar {
        position: sticky;
        top: var(--header-h);
        z-index: 10;
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-3);
        align-items: center;
        justify-content: space-between;
        padding: var(--s-3) var(--s-4);
        margin-bottom: var(--s-4);
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-sm);
      }
      .clock {
        font-variant-numeric: tabular-nums;
        font-size: var(--fs-xl);
        font-weight: 680;
        letter-spacing: -0.02em;
      }
      .clock--warning {
        color: var(--c-warning);
      }
      .clock--danger {
        color: var(--c-danger);
      }
      .save-chip {
        font-size: var(--fs-xs);
        color: var(--c-text-muted);
        display: inline-flex;
        align-items: center;
        gap: var(--s-1);
      }
      .save-chip__dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--c-success);
      }
      .save-chip__dot--busy {
        background: var(--c-warning);
      }
      .save-chip__dot--error {
        background: var(--c-danger);
      }

      .prompt {
        font-size: var(--fs-md);
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .options {
        display: grid;
        gap: var(--s-2);
        margin-top: var(--s-4);
      }
      .option {
        display: flex;
        gap: var(--s-3);
        align-items: flex-start;
        padding: var(--s-3) var(--s-4);
        border: 1px solid var(--c-border-strong);
        border-radius: var(--radius);
        background: var(--c-surface);
        cursor: pointer;
        text-align: left;
        font: inherit;
        width: 100%;
        transition: border-color 0.12s ease, background 0.12s ease;
      }
      .option:hover {
        border-color: var(--c-brand);
        background: var(--c-brand-soft);
      }
      .option[aria-checked='true'] {
        border-color: var(--c-brand);
        background: var(--c-brand-soft);
        box-shadow: inset 0 0 0 1px var(--c-brand);
      }
      .option__key {
        display: grid;
        place-items: center;
        flex: 0 0 auto;
        width: 24px;
        height: 24px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--c-border-strong);
        background: var(--c-surface);
        font-size: var(--fs-xs);
        font-weight: 700;
      }
      .option[aria-checked='true'] .option__key {
        background: var(--c-brand);
        border-color: var(--c-brand);
        color: #fff;
      }

      .grid-nav {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
        gap: var(--s-2);
      }
      .grid-nav button {
        aspect-ratio: 1;
        border-radius: var(--radius-sm);
        border: 1px solid var(--c-border-strong);
        background: var(--c-surface);
        font: inherit;
        font-size: var(--fs-sm);
        font-weight: 650;
        cursor: pointer;
        font-variant-numeric: tabular-nums;
      }
      .grid-nav button.answered {
        background: var(--c-brand-soft);
        border-color: var(--c-brand);
        color: var(--c-brand-text);
      }
      .grid-nav button.current {
        outline: 2px solid var(--c-brand);
        outline-offset: 1px;
      }
      .legend {
        display: grid;
        gap: var(--s-1);
        margin-top: var(--s-3);
        font-size: var(--fs-xs);
        color: var(--c-text-muted);
      }
      .legend span {
        display: inline-flex;
        gap: var(--s-2);
        align-items: center;
      }
      .swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        border: 1px solid var(--c-border-strong);
      }
      .swatch--answered {
        background: var(--c-brand-soft);
        border-color: var(--c-brand);
      }

      .nav-buttons {
        display: flex;
        gap: var(--s-2);
        justify-content: space-between;
        margin-top: var(--s-5);
      }

      @media (max-width: 900px) {
        .runner {
          grid-template-columns: 1fr;
        }
        aside {
          order: -1;
        }
      }
    `,
  ],
  template: `
    <div class="container page">
      @if (store.status() === 'loading') {
        <app-loading-block [count]="1" [height]="420" label="Opening your attempt" />
      } @else if (store.status() === 'error') {
        <app-error-state
          title="This attempt is not available"
          [message]="store.errorMessage() ?? 'Something went wrong.'"
          [retryable]="false"
        />
        <div class="row mt-4">
          <button type="button" class="btn btn--secondary" (click)="goToResult()">
            View the result
          </button>
          <button type="button" class="btn btn--ghost" (click)="goToCatalogue()">
            Back to exams
          </button>
        </div>
      } @else if (store.state(); as state) {
        <!-- Timer / status bar ----------------------------------------- -->
        <div class="timer-bar">
          <div>
            <h1 style="font-size: var(--fs-md)">{{ state.exam.title }}</h1>
            <p class="xs muted">
              Question {{ store.currentIndex() + 1 }} of {{ store.totalQuestions() }} &middot;
              {{ store.answeredCount() }} answered &middot; pass mark
              {{ state.exam.passPercentage }}%
            </p>
          </div>

          <div class="row">
            <span class="save-chip" aria-live="polite" data-testid="save-status">
              <span class="save-chip__dot" [class]="saveDotClass()"></span>
              {{ saveLabel() }}
            </span>

            <div class="text-right">
              <div
                class="clock"
                [class.clock--warning]="store.remainingSeconds() <= 300"
                [class.clock--danger]="store.remainingSeconds() <= 120"
                role="timer"
                aria-live="off"
                data-testid="timer"
              >
                {{ clock() }}
              </div>
              <div class="xs muted">time remaining</div>
            </div>

            <button
              type="button"
              class="btn btn--primary"
              data-testid="open-submit"
              (click)="confirming.set(true)"
            >
              Submit
            </button>
          </div>
        </div>

        @if (store.saveStatus() === 'retrying') {
          <div class="alert alert--warning mb-4" role="status">
            <div class="stack-sm">
              <span class="alert__title">Your last answers have not been saved yet</span>
              <span>
                We will keep retrying automatically. Do not close this tab - the answers are still
                on screen and will be sent as soon as the connection returns.
              </span>
              <button type="button" class="btn btn--secondary btn--sm" (click)="retrySave()">
                Retry now
              </button>
            </div>
          </div>
        }

        <div class="runner">
          <!-- Question -------------------------------------------------- -->
          <section class="card">
            @if (store.currentQuestion(); as question) {
              <div class="row-between mb-3">
                <span class="badge badge--brand">{{ question.topic.name }}</span>
                <span class="xs muted">
                  {{ question.points }} {{ question.points === 1 ? 'mark' : 'marks' }}
                </span>
              </div>

              <h2 class="prompt" [id]="'prompt-' + question.id">{{ question.prompt }}</h2>

              <div
                class="options"
                role="radiogroup"
                [attr.aria-labelledby]="'prompt-' + question.id"
              >
                @for (option of question.options; track option.id; let i = $index) {
                  <button
                    type="button"
                    class="option"
                    role="radio"
                    [attr.aria-checked]="store.selectedOption(question.id) === option.id"
                    [attr.data-testid]="'option-' + i"
                    (click)="store.select(question.id, option.id)"
                  >
                    <span class="option__key" aria-hidden="true">{{ letter(i) }}</span>
                    <span>{{ option.text }}</span>
                  </button>
                }
              </div>

              @if (store.selectedOption(question.id)) {
                <button
                  type="button"
                  class="btn btn--ghost btn--sm mt-3"
                  (click)="store.clear(question.id)"
                >
                  Clear my answer
                </button>
              }

              <div class="nav-buttons">
                <button
                  type="button"
                  class="btn btn--secondary"
                  [disabled]="store.isFirstQuestion()"
                  data-testid="prev-question"
                  (click)="store.previous()"
                >
                  Previous
                </button>
                @if (store.isLastQuestion()) {
                  <button
                    type="button"
                    class="btn btn--primary"
                    (click)="confirming.set(true)"
                  >
                    Review and submit
                  </button>
                } @else {
                  <button
                    type="button"
                    class="btn btn--primary"
                    data-testid="next-question"
                    (click)="store.next()"
                  >
                    Next
                  </button>
                }
              </div>
            }
          </section>

          <!-- Question navigator -------------------------------------- -->
          <aside class="card">
            <div class="section-title"><h2>Questions</h2></div>
            <div class="meter mb-3" aria-hidden="true">
              <div class="meter__fill" [style.width.%]="store.progressPercentage()"></div>
            </div>

            <div class="grid-nav" role="group" aria-label="Jump to question">
              @for (question of store.questions(); track question.id; let i = $index) {
                <button
                  type="button"
                  [class.answered]="store.isAnswered(question.id)"
                  [class.current]="store.currentIndex() === i"
                  [attr.aria-current]="store.currentIndex() === i ? 'true' : null"
                  [attr.aria-label]="
                    'Question ' +
                    (i + 1) +
                    (store.isAnswered(question.id) ? ', answered' : ', not answered')
                  "
                  [attr.data-testid]="'nav-question-' + i"
                  (click)="store.goTo(i)"
                >
                  {{ i + 1 }}
                </button>
              }
            </div>

            <div class="legend">
              <span><span class="swatch swatch--answered"></span> Answered</span>
              <span><span class="swatch"></span> Not answered</span>
            </div>

            <p class="xs muted mt-3">
              Shortcuts: 1-6 pick an option, arrow keys move between questions.
            </p>
          </aside>
        </div>

        <!-- Submit confirmation ------------------------------------- -->
        <app-confirm-dialog
          [open]="confirming()"
          title="Submit this attempt?"
          [message]="confirmMessage()"
          confirmLabel="Submit now"
          cancelLabel="Keep working"
          [destructive]="false"
          (confirmed)="submit()"
          (cancelled)="confirming.set(false)"
        />
      }
    </div>
  `,
})
export class ExamRunnerPage {
  readonly id = input.required<string>();

  protected readonly store = inject(ExamRunnerStore);
  private readonly router = inject(Router);

  protected readonly confirming = signal(false);

  protected readonly clock = computed(() => formatClock(this.store.remainingSeconds()));

  protected readonly confirmMessage = computed(() => {
    const unanswered = this.store.unansweredQuestions().length;
    const base =
      unanswered === 0
        ? 'You have answered every question.'
        : `${unanswered} ${unanswered === 1 ? 'question is' : 'questions are'} still unanswered and will score zero.`;
    return `${base} Once submitted you cannot change your answers, but you will see the correct answers and explanations.`;
  });

  constructor() {
    effect(() => {
      const attemptId = this.id();
      void this.open(attemptId);
    });

    // Submission (manual or on timeout) ends on the result screen.
    effect(() => {
      if (this.store.status() === 'finished') {
        void this.router.navigate(['/attempts', this.id(), 'result'], {
          queryParams: this.store.autoSubmitted() ? { timeUp: 1 } : {},
          replaceUrl: true,
        });
      }
    });
  }

  protected async submit(): Promise<void> {
    this.confirming.set(false);
    await this.store.submit('manual');
  }

  protected async retrySave(): Promise<void> {
    await this.store.flushNow();
  }

  protected letter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  protected saveLabel(): string {
    switch (this.store.saveStatus()) {
      case 'saving':
        return 'Saving...';
      case 'retrying':
        return 'Not saved - retrying';
      case 'pending':
        return 'Unsaved changes';
      case 'saved':
        return 'All answers saved';
      default:
        return 'Answers save automatically';
    }
  }

  protected saveDotClass(): string {
    switch (this.store.saveStatus()) {
      case 'retrying':
        return 'save-chip__dot--error';
      case 'saving':
      case 'pending':
        return 'save-chip__dot--busy';
      default:
        return '';
    }
  }

  protected goToResult(): void {
    void this.router.navigate(['/attempts', this.id(), 'result']);
  }

  protected goToCatalogue(): void {
    void this.router.navigate(['/exams']);
  }

  /**
   * Keyboard shortcuts. Ignored while focus is in a text field so they cannot
   * hijack typing, and while the confirmation dialog is open.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (this.store.status() !== 'ready' || this.confirming()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
      return;
    }

    const question = this.store.currentQuestion();
    if (!question) {
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.store.next();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.store.previous();
      return;
    }

    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= question.options.length) {
      event.preventDefault();
      const option = question.options[digit - 1];
      if (option) {
        this.store.select(question.id, option.id);
      }
    }
  }

  private async open(attemptId: string): Promise<void> {
    try {
      await this.store.load(attemptId);
    } catch (error) {
      // A finished or expired attempt belongs on the result screen, not on an
      // error page - the learner's work is safe and already graded.
      if (
        ApiError.isApiError(error) &&
        (error.code === 'ATTEMPT_ALREADY_FINISHED' || error.code === 'ATTEMPT_EXPIRED')
      ) {
        await this.router.navigate(['/attempts', attemptId, 'result'], { replaceUrl: true });
      }
    }
  }
}
