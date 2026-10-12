import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type {
  AnswerDraft,
  AttemptQuestionView,
  AttemptResultSummary,
  AttemptStateView,
} from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AttemptService } from '../../core/data/attempt.service';
import { ToastService } from '../../core/notifications/toast.service';

export type RunnerStatus = 'loading' | 'ready' | 'error' | 'submitting' | 'finished';
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'retrying';

/** How long to wait after the last click before flushing the queue. */
const DEBOUNCE_MS = 700;
/** Retry backoff for a failed flush, capped so it keeps trying forever. */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
/** Flush unconditionally this often, so a long pause still persists work. */
const HEARTBEAT_MS = 20_000;

/**
 * All of the exam-taking state and behaviour, kept out of the component.
 *
 * Provided at the component level (not root), so each runner gets a fresh
 * instance and nothing leaks between attempts.
 *
 * The three things worth understanding here:
 *
 * 1. AUTOSAVE is a queue, not a request per click. Picking an option updates
 *    the local answer immediately (the UI must never feel laggy), adds it to a
 *    pending map, and schedules a debounced flush. Because the server upserts
 *    on (attempt, question), a replayed or duplicated flush is harmless - which
 *    is what makes retrying safe.
 *
 * 2. RETRY is indefinite with backoff. A failed flush keeps its answers in the
 *    pending map, so nothing is lost; the banner tells the learner their work
 *    is not yet saved, and the queue drains as soon as the network returns.
 *
 * 3. THE TIMER IS A DISPLAY. It counts down from the server's
 *    `remainingSeconds` and is re-anchored on every server response, so a
 *    wrong or tampered device clock changes what the learner sees but never
 *    what the server accepts.
 */
@Injectable()
export class ExamRunnerStore {
  private readonly attempts = inject(AttemptService);
  private readonly toasts = inject(ToastService);

  // ---- public state -------------------------------------------------------
  readonly status = signal<RunnerStatus>('loading');
  readonly errorMessage = signal<string | null>(null);
  readonly state = signal<AttemptStateView | null>(null);
  readonly answers = signal<Record<string, string | null>>({});
  readonly currentIndex = signal(0);
  readonly remainingSeconds = signal(0);
  readonly saveStatus = signal<SaveStatus>('idle');
  readonly lastSavedAt = signal<Date | null>(null);
  readonly result = signal<AttemptResultSummary | null>(null);
  /** True when time ran out and the attempt was auto-submitted. */
  readonly autoSubmitted = signal(false);

  readonly questions = computed<AttemptQuestionView[]>(() => this.state()?.questions ?? []);
  readonly currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  readonly totalQuestions = computed(() => this.questions().length);

  readonly answeredCount = computed(() => {
    const answers = this.answers();
    return this.questions().filter((question) => answers[question.id]).length;
  });

  readonly unansweredQuestions = computed(() => {
    const answers = this.answers();
    return this.questions().filter((question) => !answers[question.id]);
  });

  readonly progressPercentage = computed(() => {
    const total = this.totalQuestions();
    return total === 0 ? 0 : Math.round((this.answeredCount() / total) * 100);
  });

  readonly hasUnsavedWork = computed(() => this.pendingCount() > 0);
  readonly pendingCount = signal(0);

  readonly isLastQuestion = computed(() => this.currentIndex() >= this.totalQuestions() - 1);
  readonly isFirstQuestion = computed(() => this.currentIndex() === 0);

  // ---- internals ----------------------------------------------------------
  private attemptId = '';
  private pending = new Map<string, string | null>();
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private retryAttempt = 0;
  private flushing = false;
  /** Wall-clock instant the attempt is due, re-anchored from each response. */
  private deadlineAt = 0;
  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.pending.size > 0) {
      event.preventDefault();
    }
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  async load(attemptId: string): Promise<void> {
    this.attemptId = attemptId;
    this.status.set('loading');
    this.errorMessage.set(null);

    try {
      const state = await this.attempts.getState(attemptId);
      this.state.set(state);
      this.answers.set({ ...state.answers });
      this.applyRemaining(state.remainingSeconds);
      this.jumpToFirstUnanswered();
      this.status.set('ready');
      this.startTimers();
      window.addEventListener('beforeunload', this.beforeUnload);
    } catch (error) {
      this.status.set('error');
      this.errorMessage.set(this.describe(error, 'Could not open that attempt.'));
      // A finished or expired attempt is not a failure - the page redirects to
      // the result instead, using the code the API returned.
      if (ApiError.isApiError(error)) {
        this.errorMessage.set(
          error.code === 'ATTEMPT_EXPIRED' || error.code === 'ATTEMPT_ALREADY_FINISHED'
            ? error.message
            : this.describe(error, 'Could not open that attempt.'),
        );
      }
      throw error;
    }
  }

  /** Records a selection locally and queues it for the server. */
  select(questionId: string, optionId: string | null): void {
    if (this.status() !== 'ready') {
      return;
    }

    this.answers.update((answers) => ({ ...answers, [questionId]: optionId }));
    this.pending.set(questionId, optionId);
    this.pendingCount.set(this.pending.size);
    this.saveStatus.set('pending');
    this.scheduleFlush();
  }

  /** Clears the selection for a question (the learner changed their mind). */
  clear(questionId: string): void {
    this.select(questionId, null);
  }

  goTo(index: number): void {
    const total = this.totalQuestions();
    if (index < 0 || index >= total) {
      return;
    }
    this.currentIndex.set(index);
  }

  next(): void {
    this.goTo(this.currentIndex() + 1);
  }

  previous(): void {
    this.goTo(this.currentIndex() - 1);
  }

  isAnswered(questionId: string): boolean {
    return Boolean(this.answers()[questionId]);
  }

  selectedOption(questionId: string): string | null {
    return this.answers()[questionId] ?? null;
  }

  /**
   * Submits the attempt. Any queued answers are sent in the same request, so
   * the last click before pressing Submit cannot be lost in a race with the
   * debounce timer.
   */
  async submit(reason: 'manual' | 'timeout' = 'manual'): Promise<void> {
    if (this.status() !== 'ready') {
      return;
    }

    this.cancelTimers();
    this.status.set('submitting');
    const finalAnswers = this.drainPending();

    try {
      const result = await this.attempts.submit(this.attemptId, finalAnswers);
      this.result.set(result);
      this.autoSubmitted.set(reason === 'timeout');
      this.status.set('finished');
      window.removeEventListener('beforeunload', this.beforeUnload);
    } catch (error) {
      if (
        ApiError.isApiError(error) &&
        (error.code === 'ATTEMPT_ALREADY_FINISHED' || error.code === 'ATTEMPT_EXPIRED')
      ) {
        // Someone (or the expiry sweep) already closed it. The result exists;
        // treat this as success and let the page show it.
        this.autoSubmitted.set(true);
        this.status.set('finished');
        return;
      }

      // Submission failed for a recoverable reason: put the answers back in the
      // queue and let the learner keep working rather than losing the attempt.
      for (const answer of finalAnswers) {
        this.pending.set(answer.questionId, answer.optionId);
      }
      this.pendingCount.set(this.pending.size);
      this.status.set('ready');
      this.startTimers();
      this.toasts.error(this.describe(error, 'Could not submit. Your answers are still saved.'));
    }
  }

  /** Used by the page's "retry now" affordance on the unsaved-work banner. */
  async flushNow(): Promise<void> {
    this.clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
    this.clearTimeout(this.retryHandle);
    this.retryHandle = null;
    await this.flush();
  }

  // ---- timers -------------------------------------------------------------

  private startTimers(): void {
    this.cancelTimers();

    this.tickHandle = setInterval(() => this.tick(), 1000);
    this.heartbeatHandle = setInterval(() => {
      if (this.pending.size > 0) {
        void this.flush();
      }
    }, HEARTBEAT_MS);
  }

  private tick(): void {
    const remaining = Math.max(0, Math.round((this.deadlineAt - Date.now()) / 1000));
    this.remainingSeconds.set(remaining);

    if (remaining === 0 && this.status() === 'ready') {
      // Time is up. The server would reject further writes anyway; submitting
      // immediately means the learner sees their result instead of a dead page.
      void this.submit('timeout');
    }
  }

  private applyRemaining(remainingSeconds: number): void {
    this.deadlineAt = Date.now() + remainingSeconds * 1000;
    this.remainingSeconds.set(remainingSeconds);
  }

  private cancelTimers(): void {
    this.clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.clearInterval(this.heartbeatHandle);
    this.heartbeatHandle = null;
  }

  // ---- autosave queue ------------------------------------------------------

  private scheduleFlush(): void {
    this.clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private drainPending(): AnswerDraft[] {
    const answers: AnswerDraft[] = [...this.pending.entries()].map(([questionId, optionId]) => ({
      questionId,
      optionId,
    }));
    this.pending.clear();
    this.pendingCount.set(0);
    return answers;
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.pending.size === 0) {
      return;
    }

    const batch = this.drainPending();
    this.flushing = true;
    this.saveStatus.set(this.retryAttempt > 0 ? 'retrying' : 'saving');

    try {
      const saved = await this.attempts.saveAnswers(this.attemptId, batch);
      this.retryAttempt = 0;
      this.lastSavedAt.set(new Date());
      // Re-anchor the countdown on the server's own number.
      this.applyRemaining(saved.remainingSeconds);
      this.saveStatus.set(this.pending.size > 0 ? 'pending' : 'saved');
      if (this.pending.size > 0) {
        this.scheduleFlush();
      }
    } catch (error) {
      // Terminal and non-retryable failures are handled FIRST, and without
      // re-queueing: a batch that can never succeed must leave the queue, or
      // the heartbeat would resend it forever.
      if (ApiError.isApiError(error) && error.code === 'ATTEMPT_EXPIRED') {
        this.discardQueue();
        void this.submit('timeout');
        return;
      }
      if (ApiError.isApiError(error) && error.code === 'ATTEMPT_ALREADY_FINISHED') {
        this.discardQueue();
        this.status.set('finished');
        return;
      }
      if (ApiError.isApiError(error) && error.status === 400) {
        // A payload the server rejects as invalid will never be accepted.
        // Retrying it would hide a bug; drop it and say so loudly instead.
        this.discardQueue();
        this.saveStatus.set('idle');
        this.toasts.error(error.message);
        return;
      }

      // Recoverable (offline, 5xx, timeout): put the batch back and retry.
      // Newest-wins - anything the learner changed while the request was in
      // flight must not be overwritten by the stale batch.
      for (const answer of batch) {
        if (!this.pending.has(answer.questionId)) {
          this.pending.set(answer.questionId, answer.optionId);
        }
      }
      this.pendingCount.set(this.pending.size);
      this.saveStatus.set('retrying');
      this.scheduleRetry();
    } finally {
      this.flushing = false;
    }
  }

  /** Empties the queue without sending it. Used for unrecoverable batches. */
  private discardQueue(): void {
    this.pending.clear();
    this.pendingCount.set(0);
    this.clearTimeout(this.retryHandle);
    this.retryHandle = null;
  }

  private scheduleRetry(): void {
    const delay =
      RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)] ?? 15000;
    this.retryAttempt += 1;
    this.clearTimeout(this.retryHandle);
    this.retryHandle = setTimeout(() => {
      this.retryHandle = null;
      void this.flush();
    }, delay);
  }

  // ---- misc ----------------------------------------------------------------

  /** Opens on the first unanswered question, which is where a resume belongs. */
  private jumpToFirstUnanswered(): void {
    const answers = this.answers();
    const index = this.questions().findIndex((question) => !answers[question.id]);
    this.currentIndex.set(index === -1 ? 0 : index);
  }

  private describe(error: unknown, fallback: string): string {
    return ApiError.isApiError(error) ? error.message : fallback;
  }

  private clearTimeout(handle: ReturnType<typeof setTimeout> | null): void {
    if (handle !== null) {
      clearTimeout(handle);
    }
  }

  private clearInterval(handle: ReturnType<typeof setInterval> | null): void {
    if (handle !== null) {
      clearInterval(handle);
    }
  }

  private teardown(): void {
    this.cancelTimers();
    this.clearTimeout(this.debounceHandle);
    this.clearTimeout(this.retryHandle);
    window.removeEventListener('beforeunload', this.beforeUnload);

    // Best-effort final save when navigating away mid-attempt. Fire and
    // forget: the component is already gone, and the next load re-reads the
    // authoritative state from the server anyway.
    if (this.pending.size > 0 && this.attemptId) {
      const batch = this.drainPending();
      // Promise.resolve wraps it so a transport that throws synchronously
      // cannot break component teardown.
      void Promise.resolve(this.attempts.saveAnswers(this.attemptId, batch)).catch(
        () => undefined,
      );
    }
  }
}
