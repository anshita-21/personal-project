import { TestBed } from '@angular/core/testing';
import type {
  AttemptResultSummary,
  AttemptStateView,
  SaveAnswersResult,
} from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AttemptService } from '../../core/data/attempt.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ExamRunnerStore } from './exam-runner.store';

/**
 * The autosave engine is the riskiest code in the application: it has timers,
 * retries, a queue and a deadline. These tests drive it with fake timers and a
 * stubbed transport so every branch - debounce, coalescing, retry, expiry,
 * auto-submit, failed submit - is exercised deterministically.
 */

function stateFixture(overrides: Partial<AttemptStateView> = {}): AttemptStateView {
  return {
    attemptId: 'attempt-1',
    status: 'IN_PROGRESS',
    exam: { id: 'exam-1', slug: 'exam-1', title: 'Fixture Exam', durationMinutes: 10, passPercentage: 60 },
    startedAt: '2026-03-12T10:00:00.000Z',
    expiresAt: '2026-03-12T10:10:00.000Z',
    remainingSeconds: 600,
    serverTime: '2026-03-12T10:00:00.000Z',
    questions: [
      {
        id: 'q1',
        prompt: 'First?',
        position: 1,
        points: 1,
        topic: { id: 't1', name: 'Topic' },
        options: [
          { id: 'q1a', text: 'A', position: 1 },
          { id: 'q1b', text: 'B', position: 2 },
        ],
      },
      {
        id: 'q2',
        prompt: 'Second?',
        position: 2,
        points: 1,
        topic: { id: 't1', name: 'Topic' },
        options: [
          { id: 'q2a', text: 'A', position: 1 },
          { id: 'q2b', text: 'B', position: 2 },
        ],
      },
      {
        id: 'q3',
        prompt: 'Third?',
        position: 3,
        points: 2,
        topic: { id: 't2', name: 'Other' },
        options: [
          { id: 'q3a', text: 'A', position: 1 },
          { id: 'q3b', text: 'B', position: 2 },
        ],
      },
    ],
    answers: {},
    ...overrides,
  };
}

function saveResult(overrides: Partial<SaveAnswersResult> = {}): SaveAnswersResult {
  return {
    attemptId: 'attempt-1',
    saved: 1,
    answeredCount: 1,
    remainingSeconds: 590,
    serverTime: '2026-03-12T10:00:10.000Z',
    ...overrides,
  };
}

const resultFixture: AttemptResultSummary = {
  attemptId: 'attempt-1',
  examId: 'exam-1',
  examTitle: 'Fixture Exam',
  examSlug: 'exam-1',
  status: 'SUBMITTED',
  startedAt: '2026-03-12T10:00:00.000Z',
  submittedAt: '2026-03-12T10:05:00.000Z',
  durationMinutes: 10,
  timeSpentSeconds: 300,
  score: 1,
  maxScore: 4,
  percentage: 25,
  passed: false,
  passPercentage: 60,
  correctCount: 1,
  incorrectCount: 1,
  unansweredCount: 1,
  questionCount: 3,
};

describe('ExamRunnerStore', () => {
  let store: ExamRunnerStore;
  let attempts: jest.Mocked<Pick<AttemptService, 'getState' | 'saveAnswers' | 'submit'>>;
  let toasts: ToastService;

  beforeEach(() => {
    jest.useFakeTimers();

    attempts = {
      getState: jest.fn(),
      saveAnswers: jest.fn(),
      submit: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [ExamRunnerStore, { provide: AttemptService, useValue: attempts }],
    });

    store = TestBed.inject(ExamRunnerStore);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function load(state = stateFixture()): Promise<void> {
    attempts.getState.mockResolvedValue(state);
    await store.load('attempt-1');
  }

  describe('load', () => {
    it('populates the questions, answers and countdown', async () => {
      await load();

      expect(store.status()).toBe('ready');
      expect(store.totalQuestions()).toBe(3);
      expect(store.remainingSeconds()).toBe(600);
      expect(store.answeredCount()).toBe(0);
    });

    it('restores previously saved answers', async () => {
      await load(stateFixture({ answers: { q1: 'q1b', q2: null } }));

      expect(store.selectedOption('q1')).toBe('q1b');
      expect(store.selectedOption('q2')).toBeNull();
      expect(store.answeredCount()).toBe(1);
      expect(store.isAnswered('q1')).toBe(true);
      expect(store.isAnswered('q2')).toBe(false);
    });

    it('opens on the first UNANSWERED question when resuming', async () => {
      await load(stateFixture({ answers: { q1: 'q1a' } }));

      expect(store.currentIndex()).toBe(1);
      expect(store.currentQuestion()?.id).toBe('q2');
    });

    it('opens on the first question when everything is answered', async () => {
      await load(stateFixture({ answers: { q1: 'q1a', q2: 'q2a', q3: 'q3a' } }));

      expect(store.currentIndex()).toBe(0);
    });

    it('surfaces a load failure and rethrows so the page can redirect', async () => {
      attempts.getState.mockRejectedValue(
        new ApiError(409, 'ATTEMPT_ALREADY_FINISHED', 'Already submitted.'),
      );

      await expect(store.load('attempt-1')).rejects.toMatchObject({
        code: 'ATTEMPT_ALREADY_FINISHED',
      });
      expect(store.status()).toBe('error');
      expect(store.errorMessage()).toBe('Already submitted.');
    });
  });

  describe('autosave', () => {
    it('updates the answer immediately and queues it', async () => {
      await load();
      store.select('q1', 'q1a');

      // The UI must not wait for the network.
      expect(store.selectedOption('q1')).toBe('q1a');
      expect(store.answeredCount()).toBe(1);
      expect(store.saveStatus()).toBe('pending');
      expect(attempts.saveAnswers).not.toHaveBeenCalled();
    });

    it('flushes once after the debounce window', async () => {
      await load();
      attempts.saveAnswers.mockResolvedValue(saveResult());

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      expect(attempts.saveAnswers).toHaveBeenCalledTimes(1);
      expect(attempts.saveAnswers).toHaveBeenCalledWith('attempt-1', [
        { questionId: 'q1', optionId: 'q1a' },
      ]);
      expect(store.saveStatus()).toBe('saved');
      expect(store.hasUnsavedWork()).toBe(false);
    });

    it('batches a burst of clicks into a single request', async () => {
      await load();
      attempts.saveAnswers.mockResolvedValue(saveResult({ answeredCount: 3 }));

      store.select('q1', 'q1a');
      store.select('q2', 'q2b');
      store.select('q3', 'q3a');
      await jest.advanceTimersByTimeAsync(700);

      expect(attempts.saveAnswers).toHaveBeenCalledTimes(1);
      expect(attempts.saveAnswers.mock.calls[0]?.[1]).toHaveLength(3);
    });

    it('coalesces repeated changes to one question, keeping the last', async () => {
      await load();
      attempts.saveAnswers.mockResolvedValue(saveResult());

      store.select('q1', 'q1a');
      store.select('q1', 'q1b');
      await jest.advanceTimersByTimeAsync(700);

      expect(attempts.saveAnswers).toHaveBeenCalledWith('attempt-1', [
        { questionId: 'q1', optionId: 'q1b' },
      ]);
    });

    it('sends a cleared answer as null', async () => {
      await load(stateFixture({ answers: { q1: 'q1a' } }));
      attempts.saveAnswers.mockResolvedValue(saveResult({ answeredCount: 0 }));

      store.clear('q1');
      await jest.advanceTimersByTimeAsync(700);

      expect(attempts.saveAnswers).toHaveBeenCalledWith('attempt-1', [
        { questionId: 'q1', optionId: null },
      ]);
      expect(store.answeredCount()).toBe(0);
    });

    it('re-anchors the countdown to the server value on every save', async () => {
      await load();
      attempts.saveAnswers.mockResolvedValue(saveResult({ remainingSeconds: 120 }));

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      // The browser clock is never the source of truth for the deadline.
      expect(store.remainingSeconds()).toBe(120);
    });

    it('retries a failed flush with backoff and keeps the answers queued', async () => {
      await load();
      attempts.saveAnswers
        .mockRejectedValueOnce(new ApiError(0, 'INTERNAL_ERROR', 'offline'))
        .mockResolvedValueOnce(saveResult());

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      expect(store.saveStatus()).toBe('retrying');
      expect(store.hasUnsavedWork()).toBe(true);
      // The answer is still on screen - nothing was lost.
      expect(store.selectedOption('q1')).toBe('q1a');

      await jest.advanceTimersByTimeAsync(1000);

      expect(attempts.saveAnswers).toHaveBeenCalledTimes(2);
      expect(store.saveStatus()).toBe('saved');
      expect(store.hasUnsavedWork()).toBe(false);
    });

    it('does not let a stale retry overwrite a newer answer', async () => {
      await load();
      attempts.saveAnswers
        .mockRejectedValueOnce(new ApiError(0, 'INTERNAL_ERROR', 'offline'))
        .mockResolvedValueOnce(saveResult());

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      // The learner changes their mind while the retry is pending.
      store.select('q1', 'q1b');
      await jest.advanceTimersByTimeAsync(1000);

      const lastBatch = attempts.saveAnswers.mock.calls.at(-1)?.[1];
      expect(lastBatch).toEqual([{ questionId: 'q1', optionId: 'q1b' }]);
    });

    it('stops retrying a request the server will never accept (400)', async () => {
      await load();
      attempts.saveAnswers.mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Unknown question for this exam.'),
      );

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      expect(toasts.toasts()[0]?.message).toContain('Unknown question');
      expect(store.hasUnsavedWork()).toBe(false);

      // Nothing is resent, not by the retry timer and not by the heartbeat:
      // retrying forever would hide a bug instead of reporting it.
      await jest.advanceTimersByTimeAsync(60_000);
      expect(attempts.saveAnswers).toHaveBeenCalledTimes(1);
    });

    it('flushes pending work on the heartbeat even without new clicks', async () => {
      await load();
      attempts.saveAnswers
        .mockRejectedValueOnce(new ApiError(0, 'INTERNAL_ERROR', 'offline'))
        .mockResolvedValue(saveResult());

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);
      expect(store.saveStatus()).toBe('retrying');

      await jest.advanceTimersByTimeAsync(21_000);
      expect(attempts.saveAnswers.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(store.hasUnsavedWork()).toBe(false);
    });

    it('auto-submits when the server says the attempt has expired', async () => {
      await load();
      attempts.saveAnswers.mockRejectedValue(
        new ApiError(409, 'ATTEMPT_EXPIRED', 'Time ran out.'),
      );
      attempts.submit.mockResolvedValue({ ...resultFixture, status: 'EXPIRED' });

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      expect(attempts.submit).toHaveBeenCalled();
      expect(store.status()).toBe('finished');
      expect(store.autoSubmitted()).toBe(true);
    });

    it('marks the attempt finished when a save hits an already-closed attempt', async () => {
      await load();
      attempts.saveAnswers.mockRejectedValue(
        new ApiError(409, 'ATTEMPT_ALREADY_FINISHED', 'Already submitted.'),
      );

      store.select('q1', 'q1a');
      await jest.advanceTimersByTimeAsync(700);

      expect(store.status()).toBe('finished');
      expect(attempts.submit).not.toHaveBeenCalled();
    });
  });

  describe('timer', () => {
    it('counts down once per second', async () => {
      await load();

      await jest.advanceTimersByTimeAsync(5000);
      expect(store.remainingSeconds()).toBe(595);
    });

    it('submits automatically when the clock reaches zero', async () => {
      await load(stateFixture({ remainingSeconds: 3 }));
      attempts.submit.mockResolvedValue({ ...resultFixture, status: 'EXPIRED' });

      await jest.advanceTimersByTimeAsync(4000);

      expect(attempts.submit).toHaveBeenCalledTimes(1);
      expect(store.status()).toBe('finished');
      expect(store.autoSubmitted()).toBe(true);
    });

    it('never reports a negative remaining time', async () => {
      await load(stateFixture({ remainingSeconds: 1 }));
      attempts.submit.mockResolvedValue(resultFixture);

      await jest.advanceTimersByTimeAsync(10_000);

      expect(store.remainingSeconds()).toBe(0);
    });

    it('ignores answer selections once the attempt is no longer running', async () => {
      await load(stateFixture({ remainingSeconds: 1 }));
      attempts.submit.mockResolvedValue(resultFixture);
      await jest.advanceTimersByTimeAsync(2000);

      store.select('q1', 'q1a');

      expect(store.selectedOption('q1')).toBeNull();
      expect(attempts.saveAnswers).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('sends queued answers with the submission, so no click is lost to the debounce', async () => {
      await load();
      attempts.submit.mockResolvedValue(resultFixture);

      store.select('q1', 'q1a');
      // Submit immediately - before the debounce timer would have fired.
      await store.submit('manual');

      expect(attempts.saveAnswers).not.toHaveBeenCalled();
      expect(attempts.submit).toHaveBeenCalledWith('attempt-1', [
        { questionId: 'q1', optionId: 'q1a' },
      ]);
      expect(store.status()).toBe('finished');
      expect(store.result()).toEqual(resultFixture);
      expect(store.autoSubmitted()).toBe(false);
    });

    it('treats an already-finished attempt as success', async () => {
      await load();
      attempts.submit.mockRejectedValue(
        new ApiError(409, 'ATTEMPT_ALREADY_FINISHED', 'Already submitted.'),
      );

      await store.submit('manual');

      expect(store.status()).toBe('finished');
    });

    it('returns to the paper and keeps the answers when submission fails', async () => {
      await load();
      attempts.submit.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));

      store.select('q1', 'q1a');
      await store.submit('manual');

      expect(store.status()).toBe('ready');
      expect(store.hasUnsavedWork()).toBe(true);
      expect(store.selectedOption('q1')).toBe('q1a');
      expect(toasts.toasts()[0]?.kind).toBe('error');
    });

    it('does nothing when called twice - the second call is a no-op', async () => {
      await load();
      attempts.submit.mockResolvedValue(resultFixture);

      await store.submit('manual');
      await store.submit('manual');

      expect(attempts.submit).toHaveBeenCalledTimes(1);
    });
  });

  describe('navigation and progress', () => {
    it('moves between questions and clamps at the ends', async () => {
      await load();

      expect(store.isFirstQuestion()).toBe(true);
      store.previous();
      expect(store.currentIndex()).toBe(0);

      store.next();
      expect(store.currentIndex()).toBe(1);
      store.next();
      expect(store.isLastQuestion()).toBe(true);
      store.next();
      expect(store.currentIndex()).toBe(2);
    });

    it('jumps straight to a question by index, ignoring out-of-range values', async () => {
      await load();

      store.goTo(2);
      expect(store.currentQuestion()?.id).toBe('q3');

      store.goTo(99);
      expect(store.currentIndex()).toBe(2);
      store.goTo(-1);
      expect(store.currentIndex()).toBe(2);
    });

    it('reports progress and the list of unanswered questions', async () => {
      await load(stateFixture({ answers: { q1: 'q1a' } }));

      expect(store.progressPercentage()).toBe(33);
      expect(store.unansweredQuestions().map((q) => q.id)).toEqual(['q2', 'q3']);
    });
  });
});
