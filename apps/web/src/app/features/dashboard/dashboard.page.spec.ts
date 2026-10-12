import type { ComponentFixture} from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import type { StudentDashboard, UserView } from '@examprep/shared';
import { settle, testProviders } from '../../../testing/test-setup';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardPage } from './dashboard.page';

const user: UserView = {
  id: 'u1',
  name: 'Priya Raman',
  email: 'priya@example.com',
  role: 'STUDENT',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function dashboard(overrides: Partial<StudentDashboard> = {}): StudentDashboard {
  return {
    stats: {
      attemptsCompleted: 3,
      attemptsInProgress: 1,
      examsAvailable: 6,
      averagePercentage: 72.5,
      bestPercentage: 90,
      totalQuestionsAnswered: 40,
      totalCorrect: 29,
      accuracy: 72.5,
      passRate: 66.67,
    },
    recentAttempts: [
      {
        attemptId: 'a1',
        examId: 'e1',
        examTitle: 'JavaScript Essentials',
        status: 'SUBMITTED',
        startedAt: '2026-03-01T10:00:00.000Z',
        submittedAt: '2026-03-01T10:12:00.000Z',
        percentage: 90,
        passed: true,
      },
    ],
    inProgressAttempts: [
      {
        attemptId: 'a2',
        examId: 'e2',
        examTitle: 'SQL Query Fundamentals',
        status: 'IN_PROGRESS',
        startedAt: '2026-03-12T09:00:00.000Z',
        submittedAt: null,
        percentage: null,
        passed: null,
      },
    ],
    recommendedExams: [
      {
        id: 'e2',
        slug: 'sql-query-fundamentals',
        title: 'SQL Query Fundamentals',
        description: 'Joins and indexes.',
        difficulty: 'EASY',
        durationMinutes: 20,
        passPercentage: 60,
        questionCount: 8,
        totalPoints: 9,
        topic: { id: 't2', name: 'Databases & SQL', slug: 'sql', description: null },
        bestPercentage: 55,
        attemptCount: 2,
        activeAttemptId: null,
      },
    ],
    topicPerformance: [
      { topicId: 't2', topicName: 'Databases & SQL', answered: 16, correct: 9, accuracy: 56.25 },
      { topicId: 't1', topicName: 'JavaScript', answered: 24, correct: 20, accuracy: 83.33 },
    ],
    progress: [
      { attemptId: 'a0', submittedAt: '2026-02-01T10:00:00.000Z', percentage: 50, examTitle: 'JavaScript Essentials' },
      { attemptId: 'a1', submittedAt: '2026-03-01T10:12:00.000Z', percentage: 90, examTitle: 'JavaScript Essentials' },
    ],
    nextAction: {
      kind: 'RESUME_ATTEMPT',
      label: 'Resume your exam',
      detail: 'You have an unfinished attempt at "SQL Query Fundamentals".',
      examId: 'e2',
      attemptId: 'a2',
    },
    ...overrides,
  };
}

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  let http: HttpTestingController;

  async function render(payload?: StudentDashboard | 'error'): Promise<void> {
    TestBed.configureTestingModule({ providers: testProviders() });
    http = TestBed.inject(HttpTestingController);

    // Put a signed-in user in place so the greeting has a name to use.
    const auth = TestBed.inject(AuthService);
    const login = auth.login({ email: user.email, password: 'Password123' });
    http.expectOne('/api/v1/auth/login').flush({ user });
    await login;

    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();

    if (payload === undefined) {
      return; // leave the request pending to assert the loading state
    }

    const request = http.expectOne('/graphql');
    if (payload === 'error') {
      request.flush({
        errors: [{ message: 'Sign in to continue.', extensions: { code: 'UNAUTHENTICATED' } }],
      });
    } else {
      request.flush({ data: { studentDashboard: payload } });
    }
    await settle(fixture);
  }

  afterEach(() => http.verify({ ignoreCancelled: true }));

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('shows a loading state while the dashboard query is in flight', async () => {
    await render();

    expect((fixture.nativeElement as HTMLElement).querySelector('.skeleton')).toBeTruthy();
    http.expectOne('/graphql').flush({ data: { studentDashboard: dashboard() } });
    await settle(fixture);
  });

  it('asks for the dashboard over GraphQL, in one request', async () => {
    TestBed.configureTestingModule({ providers: testProviders() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();

    const request = http.expectOne('/graphql');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.operationName).toBe('StudentDashboard');
    request.flush({ data: { studentDashboard: dashboard() } });
    await settle(fixture);
  });

  it('renders the statistics returned by the API, not hardcoded numbers', async () => {
    await render(dashboard());

    expect(text()).toContain('72.5%');
    expect(text()).toContain('Best 90%');
    expect(text()).toContain('66.67%');
    expect(text()).toContain('6 available');
  });

  it('greets the signed-in learner by first name', async () => {
    await render(dashboard());
    expect(text()).toContain('Welcome back, Priya');
  });

  it('renders the next action with a resume link', async () => {
    await render(dashboard());
    const action = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="next-action"]',
    );

    expect(action?.textContent).toContain('Resume your exam');
    expect(action?.querySelector('a')?.getAttribute('href')).toBe('/attempts/a2/take');
  });

  it('lists recent attempts with their score and outcome', async () => {
    await render(dashboard());

    expect(text()).toContain('JavaScript Essentials');
    expect(text()).toContain('90%');
    expect(text()).toContain('Passed');
  });

  it('renders per-topic accuracy, weakest first', async () => {
    await render(dashboard());
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.row-head .truncate'),
    ).map((node) => node.textContent?.trim());

    expect(labels[0]).toBe('Databases & SQL');
    expect(text()).toContain('56.25%');
  });

  it('draws the progress chart once there are at least two graded attempts', async () => {
    await render(dashboard());
    expect((fixture.nativeElement as HTMLElement).querySelector('svg[role="img"]')).toBeTruthy();
  });

  it('explains rather than drawing an empty chart with a single attempt', async () => {
    await render(
      dashboard({
        progress: [
          {
            attemptId: 'a1',
            submittedAt: '2026-03-01T10:12:00.000Z',
            percentage: 90,
            examTitle: 'JavaScript Essentials',
          },
        ],
      }),
    );

    expect(text()).toContain('Complete at least two exams');
  });

  it('renders honest zeros for a brand-new learner', async () => {
    await render(
      dashboard({
        stats: {
          attemptsCompleted: 0,
          attemptsInProgress: 0,
          examsAvailable: 2,
          averagePercentage: 0,
          bestPercentage: 0,
          totalQuestionsAnswered: 0,
          totalCorrect: 0,
          accuracy: 0,
          passRate: 0,
        },
        recentAttempts: [],
        inProgressAttempts: [],
        topicPerformance: [],
        progress: [],
        nextAction: {
          kind: 'START_FIRST_EXAM',
          label: 'Start "SQL Query Fundamentals"',
          detail: 'Take your first practice exam to establish a baseline.',
          examId: 'e2',
          attemptId: null,
        },
      }),
    );

    expect(text()).toContain('No completed attempts yet.');
    expect(text()).toContain('Start "SQL Query Fundamentals"');
    expect(text()).toContain('your per-topic accuracy will show up here');
  });

  it('shows an error state with a retry when the query fails', async () => {
    await render('error');

    expect(text()).toContain('Sign in to continue.');
    const retry = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((button) => button.textContent?.includes('Try again'));
    expect(retry).toBeTruthy();

    retry?.click();
    http.expectOne('/graphql').flush({ data: { studentDashboard: dashboard() } });
    await settle(fixture);

    expect(text()).toContain('Welcome back');
  });

  it('starts an exam from the next-action button when there is nothing to resume', async () => {
    await render(
      dashboard({
        inProgressAttempts: [],
        nextAction: {
          kind: 'PRACTISE_WEAK_TOPIC',
          label: 'Practise Databases & SQL',
          detail: 'Databases & SQL is your weakest topic at 56.25% accuracy.',
          examId: 'e2',
          attemptId: null,
        },
      }),
    );

    const router = TestBed.inject(Router);
    jest.spyOn(router, 'navigate').mockResolvedValue(true);

    const start = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="next-action"] button',
    );
    start?.click();

    const request = http.expectOne('/api/v1/attempts');
    expect(request.request.body).toEqual({ examId: 'e2' });
    request.flush({ attemptId: 'a9', questions: [], answers: {} });
    await settle(fixture);

    expect(router.navigate).toHaveBeenCalledWith(['/attempts', 'a9', 'take']);
  });
});
