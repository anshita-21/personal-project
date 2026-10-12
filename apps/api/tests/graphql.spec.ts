import request from 'supertest';
import { createExam, createTopic } from '../src/testing/fixtures';
import { app, anonymous, signedInAdmin, signedInStudent, type Agent } from './helpers';

const DASHBOARD_QUERY = /* GraphQL */ `
  query Dashboard {
    studentDashboard {
      stats {
        attemptsCompleted
        attemptsInProgress
        examsAvailable
        averagePercentage
        bestPercentage
        accuracy
        passRate
        totalQuestionsAnswered
        totalCorrect
      }
      recentAttempts {
        attemptId
        examTitle
        percentage
        passed
      }
      inProgressAttempts {
        attemptId
        examTitle
      }
      recommendedExams {
        id
        title
        questionCount
      }
      topicPerformance {
        topicName
        answered
        correct
        accuracy
      }
      progress {
        percentage
        examTitle
      }
      nextAction {
        kind
        label
        detail
        examId
        attemptId
      }
    }
  }
`;

function graphql(agent: Agent, query: string, operationName?: string) {
  return agent
    .post('/graphql')
    .set('Content-Type', 'application/json')
    .send({ query, ...(operationName ? { operationName } : {}) });
}

describe('POST /graphql - studentDashboard', () => {
  it('requires authentication', async () => {
    const response = await graphql(anonymous(), DASHBOARD_QUERY);

    expect(response.body.data).toBeNull();
    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('returns a complete, zeroed dashboard for a brand-new learner', async () => {
    await createExam({ questionCount: 2, title: 'Starter Paper' });
    const { agent } = await signedInStudent();

    const response = await graphql(agent, DASHBOARD_QUERY);
    const dashboard = response.body.data.studentDashboard;

    expect(response.body.errors).toBeUndefined();
    expect(dashboard.stats).toMatchObject({
      attemptsCompleted: 0,
      attemptsInProgress: 0,
      examsAvailable: 1,
      averagePercentage: 0,
      accuracy: 0,
      passRate: 0,
    });
    expect(dashboard.recentAttempts).toEqual([]);
    expect(dashboard.nextAction.kind).toBe('START_FIRST_EXAM');
    expect(dashboard.recommendedExams[0].title).toBe('Starter Paper');
  });

  it('aggregates real attempt data, including per-topic accuracy', async () => {
    const algebra = await createTopic('Algebra');
    const exam = await createExam({
      questionCount: 4,
      topicId: algebra.id,
      passPercentage: 50,
      title: 'Algebra Paper',
    });
    const { agent } = await signedInStudent();

    const started = await agent.post('/api/v1/attempts').send({ examId: exam.id });
    await agent.post(`/api/v1/attempts/${started.body.attemptId}/submit`).send({
      answers: [
        { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        { questionId: exam.questions[1]!.id, optionId: exam.questions[1]!.correctOptionId },
        { questionId: exam.questions[2]!.id, optionId: exam.questions[2]!.wrongOptionId },
        { questionId: exam.questions[3]!.id, optionId: exam.questions[3]!.wrongOptionId },
      ],
    });

    const dashboard = (await graphql(agent, DASHBOARD_QUERY)).body.data.studentDashboard;

    expect(dashboard.stats).toMatchObject({
      attemptsCompleted: 1,
      averagePercentage: 50,
      bestPercentage: 50,
      totalQuestionsAnswered: 4,
      totalCorrect: 2,
      accuracy: 50,
      passRate: 100,
    });
    expect(dashboard.recentAttempts).toHaveLength(1);
    expect(dashboard.recentAttempts[0]).toMatchObject({
      examTitle: 'Algebra Paper',
      percentage: 50,
      passed: true,
    });
    expect(dashboard.topicPerformance).toEqual([
      { topicName: 'Algebra', answered: 4, correct: 2, accuracy: 50 },
    ]);
    expect(dashboard.progress).toEqual([{ percentage: 50, examTitle: 'Algebra Paper' }]);
  });

  it('offers to resume an unfinished attempt', async () => {
    const exam = await createExam({ questionCount: 2, title: 'Unfinished Paper' });
    const { agent } = await signedInStudent();
    const started = await agent.post('/api/v1/attempts').send({ examId: exam.id });

    const dashboard = (await graphql(agent, DASHBOARD_QUERY)).body.data.studentDashboard;

    expect(dashboard.stats.attemptsInProgress).toBe(1);
    expect(dashboard.inProgressAttempts[0].attemptId).toBe(started.body.attemptId);
    expect(dashboard.nextAction).toMatchObject({
      kind: 'RESUME_ATTEMPT',
      attemptId: started.body.attemptId,
    });
  });

  it('is scoped to the caller - one learner never sees another\'s data', async () => {
    const exam = await createExam({ questionCount: 2, passPercentage: 50 });
    const other = await signedInStudent();
    const started = await other.agent.post('/api/v1/attempts').send({ examId: exam.id });
    await other.agent.post(`/api/v1/attempts/${started.body.attemptId}/submit`).send({
      answers: [
        { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
      ],
    });

    const mine = await signedInStudent();
    const dashboard = (await graphql(mine.agent, DASHBOARD_QUERY)).body.data.studentDashboard;

    expect(dashboard.stats.attemptsCompleted).toBe(0);
    expect(dashboard.recentAttempts).toEqual([]);
  });

  it('has no way to ask for another learner\'s dashboard', async () => {
    const { agent } = await signedInStudent();
    const response = await graphql(agent, '{ studentDashboard(userId: "someone-else") { stats { accuracy } } }');

    // The schema has no such argument, so this is a validation error, not a
    // permission check that could be forgotten.
    expect(response.body.errors[0].message).toMatch(/Unknown argument/i);
  });

  it('returns only the fields the client selected', async () => {
    await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();

    const response = await graphql(agent, '{ studentDashboard { stats { accuracy } } }');

    expect(response.body.data.studentDashboard).toEqual({ stats: { accuracy: 0 } });
  });

  it('rejects a query for a field that does not exist', async () => {
    const { agent } = await signedInStudent();
    const response = await graphql(agent, '{ studentDashboard { stats { secretKey } } }');

    expect(response.body.errors[0].message).toMatch(/Cannot query field/i);
  });
});

describe('POST /graphql - me', () => {
  it('returns null for an anonymous caller instead of erroring', async () => {
    const response = await graphql(anonymous(), '{ me { id email role } }');

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.me).toBeNull();
  });

  it('returns the signed-in account', async () => {
    const { agent, user } = await signedInStudent();
    const response = await graphql(agent, '{ me { id email role } }');

    expect(response.body.data.me).toEqual({
      id: user.id,
      email: user.email,
      role: 'STUDENT',
    });
  });

  it('never exposes a password field', async () => {
    const { agent } = await signedInStudent();
    const response = await graphql(agent, '{ me { passwordHash } }');

    expect(response.body.errors[0].message).toMatch(/Cannot query field/i);
  });
});

describe('POST /graphql - adminStats', () => {
  const QUERY = '{ adminStats { totalUsers totalExams publishedExams totalAttempts } }';

  it('requires the ADMIN role', async () => {
    const student = await signedInStudent();
    const response = await graphql(student.agent, QUERY);

    expect(response.body.errors[0].extensions.code).toBe('FORBIDDEN');
    expect(response.body.data).toBeNull();
  });

  it('requires authentication', async () => {
    const response = await graphql(anonymous(), QUERY);

    expect(response.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('serves statistics to an admin', async () => {
    const { agent } = await signedInAdmin();
    await createExam({ status: 'PUBLISHED', questionCount: 1 });

    const response = await graphql(agent, QUERY);

    expect(response.body.data.adminStats).toMatchObject({
      totalUsers: 1,
      totalExams: 1,
      publishedExams: 1,
      totalAttempts: 0,
    });
  });
});

describe('GraphQL transport', () => {
  it('exposes no mutations - writes stay on REST', async () => {
    const { agent } = await signedInStudent();
    const response = await graphql(agent, 'mutation { anything }');

    expect(response.body.errors[0].message).toMatch(/mutation/i);
  });

  it('serves the schema as SDL for documentation', async () => {
    const response = await request(app).get('/graphql/schema.graphql');

    expect(response.status).toBe(200);
    expect(response.text).toContain('type StudentDashboard');
    expect(response.text).toContain('studentDashboard: StudentDashboard!');
  });

  it('rejects a malformed query with a GraphQL error, not a 500', async () => {
    const { agent } = await signedInStudent();
    const response = await graphql(agent, '{ this is not graphql');

    expect(response.status).toBeLessThan(500);
    expect(response.body.errors).toBeDefined();
  });
});
