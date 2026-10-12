import type { ComponentFixture} from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import type { AttemptStateView } from '@examprep/shared';
import { settle, testProviders } from '../../../testing/test-setup';
import { ExamRunnerPage } from './exam-runner.page';

function state(overrides: Partial<AttemptStateView> = {}): AttemptStateView {
  return {
    attemptId: 'attempt-1',
    status: 'IN_PROGRESS',
    exam: {
      id: 'exam-1',
      slug: 'fixture-exam',
      title: 'Fixture Exam',
      durationMinutes: 10,
      passPercentage: 60,
    },
    startedAt: '2026-03-12T10:00:00.000Z',
    expiresAt: '2026-03-12T10:10:00.000Z',
    remainingSeconds: 125,
    serverTime: '2026-03-12T10:00:00.000Z',
    questions: [
      {
        id: 'q1',
        prompt: 'What does typeof null return?',
        position: 1,
        points: 1,
        topic: { id: 't1', name: 'JavaScript' },
        options: [
          { id: 'q1a', text: "'null'", position: 1 },
          { id: 'q1b', text: "'object'", position: 2 },
        ],
      },
      {
        id: 'q2',
        prompt: 'Which join keeps unmatched left rows?',
        position: 2,
        points: 2,
        topic: { id: 't2', name: 'SQL' },
        options: [
          { id: 'q2a', text: 'INNER JOIN', position: 1 },
          { id: 'q2b', text: 'LEFT JOIN', position: 2 },
        ],
      },
    ],
    answers: {},
    ...overrides,
  };
}

describe('ExamRunnerPage', () => {
  let fixture: ComponentFixture<ExamRunnerPage>;
  let http: HttpTestingController;
  let router: Router;

  // The failure case is keyed on `httpStatus`, not `status`: AttemptStateView
  // has a `status` field of its own, so `'status' in payload` would always be
  // true and every render would take the error branch.
  async function render(
    payload: AttemptStateView | { httpStatus: number; body: unknown },
  ): Promise<void> {
    TestBed.configureTestingModule({ providers: testProviders() });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ExamRunnerPage);
    fixture.componentRef.setInput('id', 'attempt-1');
    fixture.detectChanges();

    const request = http.expectOne('/api/v1/attempts/attempt-1');
    if ('httpStatus' in payload) {
      request.flush(payload.body, { status: payload.httpStatus, statusText: 'Error' });
    } else {
      request.flush(payload);
    }
    await settle(fixture);
  }

  /**
   * Selecting an option schedules a debounced autosave, and `settle` waits for
   * zone stability - which includes that timer. Tests that are not about
   * autosave therefore drain whatever flush it produced instead of failing on
   * an "unexpected" request.
   */
  function drainAutosave(): void {
    for (const request of http.match((candidate) => candidate.url.includes('/answers'))) {
      request.flush({
        attemptId: 'attempt-1',
        saved: 1,
        answeredCount: 1,
        remainingSeconds: 120,
        serverTime: '2026-03-12T10:00:05.000Z',
      });
    }
  }

  afterEach(() => {
    drainAutosave();
    http.verify({ ignoreCancelled: true });
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const option = (index: number) =>
    el().querySelector<HTMLButtonElement>(`[data-testid="option-${index}"]`)!;
  const timer = () => el().querySelector('[data-testid="timer"]')?.textContent?.trim();

  it('renders the first question with its options', async () => {
    await render(state());

    expect(text()).toContain('What does typeof null return?');
    expect(option(0).textContent).toContain("'null'");
    expect(text()).toContain('Question 1 of 2');
  });

  it('never renders the answer key', async () => {
    await render(state());

    expect(el().innerHTML).not.toContain('isCorrect');
    expect(text()).not.toContain('Correct answer');
  });

  it('shows the server-provided remaining time as a clock', async () => {
    await render(state({ remainingSeconds: 125 }));
    expect(timer()).toBe('02:05');
  });

  it('marks the timer as urgent in the final two minutes', async () => {
    await render(state({ remainingSeconds: 90 }));
    expect(el().querySelector('[data-testid="timer"]')?.classList).toContain('clock--danger');
  });

  it('marks the selected option and reflects it in the question navigator', async () => {
    await render(state());

    option(1).click();
    await settle(fixture);

    expect(option(1).getAttribute('aria-checked')).toBe('true');
    expect(option(0).getAttribute('aria-checked')).toBe('false');
    expect(
      el().querySelector('[data-testid="nav-question-0"]')?.classList.contains('answered'),
    ).toBe(true);
    expect(text()).toContain('1 answered');
  });

  it('reports autosave progress to the learner', async () => {
    await render(state());

    option(1).click();
    fixture.detectChanges();
    expect(el().querySelector('[data-testid="save-status"]')?.textContent).toContain(
      'Unsaved changes',
    );

    // `settle` waits for zone stability, which includes the debounce timer, so
    // by the time it returns the flush has been issued.
    await settle(fixture);
    const save = http.expectOne('/api/v1/attempts/attempt-1/answers');
    expect(save.request.method).toBe('PATCH');
    expect(save.request.body).toEqual({ answers: [{ questionId: 'q1', optionId: 'q1b' }] });
    save.flush({
      attemptId: 'attempt-1',
      saved: 1,
      answeredCount: 1,
      remainingSeconds: 120,
      serverTime: '2026-03-12T10:00:05.000Z',
    });
    await settle(fixture);

    expect(el().querySelector('[data-testid="save-status"]')?.textContent).toContain(
      'All answers saved',
    );
  });

  it('navigates between questions with the Next and Previous buttons', async () => {
    await render(state());

    el().querySelector<HTMLButtonElement>('[data-testid="next-question"]')!.click();
    await settle(fixture);
    expect(text()).toContain('Which join keeps unmatched left rows?');
    expect(text()).toContain('2 marks');

    el().querySelector<HTMLButtonElement>('[data-testid="prev-question"]')!.click();
    await settle(fixture);
    expect(text()).toContain('What does typeof null return?');
  });

  it('jumps to a question from the navigator grid', async () => {
    await render(state());

    el().querySelector<HTMLButtonElement>('[data-testid="nav-question-1"]')!.click();
    await settle(fixture);

    expect(text()).toContain('Which join keeps unmatched left rows?');
  });

  it('supports keyboard shortcuts for selecting and moving', async () => {
    await render(state());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    await settle(fixture);
    expect(option(1).getAttribute('aria-checked')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await settle(fixture);
    expect(text()).toContain('Which join keeps unmatched left rows?');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await settle(fixture);
    expect(text()).toContain('What does typeof null return?');
  });

  it('resumes on the first unanswered question', async () => {
    await render(state({ answers: { q1: 'q1b' } }));

    expect(text()).toContain('Which join keeps unmatched left rows?');
    expect(text()).toContain('Question 2 of 2');
  });

  it('warns about unanswered questions before submitting', async () => {
    await render(state());

    el().querySelector<HTMLButtonElement>('[data-testid="open-submit"]')!.click();
    await settle(fixture);

    const dialog = el().querySelector('dialog');
    expect(dialog?.textContent).toContain('2 questions are still unanswered');
  });

  it('submits and redirects to the result', async () => {
    await render(state());

    el().querySelector<HTMLButtonElement>('[data-testid="open-submit"]')!.click();
    await settle(fixture);
    el().querySelector<HTMLButtonElement>('[data-testid="confirm-accept"]')!.click();

    const submit = http.expectOne('/api/v1/attempts/attempt-1/submit');
    expect(submit.request.method).toBe('POST');
    submit.flush({
      attemptId: 'attempt-1',
      examId: 'exam-1',
      examTitle: 'Fixture Exam',
      examSlug: 'fixture-exam',
      status: 'SUBMITTED',
      startedAt: '2026-03-12T10:00:00.000Z',
      submittedAt: '2026-03-12T10:05:00.000Z',
      durationMinutes: 10,
      timeSpentSeconds: 300,
      score: 0,
      maxScore: 3,
      percentage: 0,
      passed: false,
      passPercentage: 60,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 2,
      questionCount: 2,
    });
    await settle(fixture);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/attempts', 'attempt-1', 'result'],
      expect.objectContaining({ replaceUrl: true }),
    );
  });

  it('redirects to the result when the attempt is already finished', async () => {
    await render({
      httpStatus: 409,
      body: {
        error: { code: 'ATTEMPT_ALREADY_FINISHED', message: 'This attempt has been submitted.' },
      },
    });

    expect(router.navigate).toHaveBeenCalledWith(['/attempts', 'attempt-1', 'result'], {
      replaceUrl: true,
    });
  });

  it('shows a recoverable error when the attempt cannot be opened', async () => {
    await render({
      httpStatus: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Attempt not found.' } },
    });

    expect(text()).toContain('This attempt is not available');
    expect(text()).toContain('Attempt not found.');
  });
});
