import { prisma } from '../src/db/prisma';
import { createExam, createStudent } from '../src/testing/fixtures';
import { anonymous, signIn, signedInStudent, type Agent } from './helpers';

/** Shifts an attempt's window into the past so the deadline has already passed. */
async function expireWindow(attemptId: string): Promise<void> {
  const startedAt = new Date(Date.now() - 60 * 60 * 1000);
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { startedAt, expiresAt: new Date(startedAt.getTime() + 60 * 1000) },
  });
}

async function startAttempt(agent: Agent, examId: string) {
  const response = await agent.post('/api/v1/attempts').send({ examId });
  expect(response.status).toBe(200);
  return response.body as {
    attemptId: string;
    remainingSeconds: number;
    questions: { id: string; options: { id: string }[] }[];
    answers: Record<string, string | null>;
  };
}

describe('POST /api/v1/attempts (start)', () => {
  it('creates an attempt with a server-derived deadline', async () => {
    const exam = await createExam({ questionCount: 3, durationMinutes: 30 });
    const { agent } = await signedInStudent();

    const state = await startAttempt(agent, exam.id);

    expect(state.questions).toHaveLength(3);
    expect(state.remainingSeconds).toBeGreaterThan(1790);
    expect(state.remainingSeconds).toBeLessThanOrEqual(1800);

    const stored = await prisma.attempt.findUniqueOrThrow({ where: { id: state.attemptId } });
    expect(stored.expiresAt.getTime() - stored.startedAt.getTime()).toBe(30 * 60 * 1000);
    expect(stored.questionCount).toBe(3);
    expect(stored.maxScore).toBe(3);
  });

  it('is idempotent: starting twice resumes the same attempt', async () => {
    const exam = await createExam();
    const { agent } = await signedInStudent();

    const first = await startAttempt(agent, exam.id);
    const second = await startAttempt(agent, exam.id);

    expect(second.attemptId).toBe(first.attemptId);
    expect(await prisma.attempt.count()).toBe(1);
  });

  it('survives concurrent start requests without creating two live attempts', async () => {
    const exam = await createExam();
    const { agent } = await signedInStudent();

    const responses = await Promise.all([
      agent.post('/api/v1/attempts').send({ examId: exam.id }),
      agent.post('/api/v1/attempts').send({ examId: exam.id }),
      agent.post('/api/v1/attempts').send({ examId: exam.id }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
    }
    expect(await prisma.attempt.count({ where: { status: 'IN_PROGRESS' } })).toBe(1);
  });

  it('closes an abandoned expired attempt and starts a fresh one', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();

    const abandoned = await startAttempt(agent, exam.id);
    await expireWindow(abandoned.attemptId);

    const fresh = await startAttempt(agent, exam.id);

    expect(fresh.attemptId).not.toBe(abandoned.attemptId);
    const old = await prisma.attempt.findUniqueOrThrow({ where: { id: abandoned.attemptId } });
    expect(old.status).toBe('EXPIRED');
    expect(old.percentage).toBe(0);
  });

  it('refuses an unpublished exam', async () => {
    const draft = await createExam({ status: 'DRAFT' });
    const { agent } = await signedInStudent();

    const response = await agent.post('/api/v1/attempts').send({ examId: draft.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EXAM_NOT_PUBLISHED');
  });

  it('refuses an exam with no questions', async () => {
    const empty = await createExam({ questionCount: 0 });
    const { agent } = await signedInStudent();

    const response = await agent.post('/api/v1/attempts').send({ examId: empty.id });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EXAM_NOT_PUBLISHED');
  });

  it('404s for an unknown exam id and 400s for a missing one', async () => {
    const { agent } = await signedInStudent();

    expect((await agent.post('/api/v1/attempts').send({ examId: 'nope' })).status).toBe(404);
    expect((await agent.post('/api/v1/attempts').send({})).status).toBe(400);
  });

  it('requires authentication', async () => {
    const exam = await createExam();
    const response = await anonymous().post('/api/v1/attempts').send({ examId: exam.id });

    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/attempts/:id (resume)', () => {
  it('never exposes the answer key or explanations', async () => {
    const exam = await createExam({ questionCount: 3 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent.get(`/api/v1/attempts/${state.attemptId}`);
    const serialised = JSON.stringify(response.body);

    expect(response.status).toBe(200);
    expect(serialised).not.toContain('isCorrect');
    expect(serialised).not.toContain('explanation');
    expect(serialised).not.toContain('correctOptionId');
  });

  it('restores saved answers after a refresh', async () => {
    const exam = await createExam({ questionCount: 3 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    const [first, second] = exam.questions;

    await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({
        answers: [
          { questionId: first!.id, optionId: first!.correctOptionId },
          { questionId: second!.id, optionId: second!.wrongOptionId },
        ],
      });

    // A refresh is just another GET - there is no client-side state to lose.
    const resumed = await agent.get(`/api/v1/attempts/${state.attemptId}`);

    expect(resumed.body.answers[first!.id]).toBe(first!.correctOptionId);
    expect(resumed.body.answers[second!.id]).toBe(second!.wrongOptionId);
    expect(resumed.body.remainingSeconds).toBeLessThanOrEqual(state.remainingSeconds);
  });

  it('404s for another learner\'s attempt, without revealing that it exists', async () => {
    const exam = await createExam();
    const owner = await signedInStudent();
    const state = await startAttempt(owner.agent, exam.id);

    const intruder = await signedInStudent();
    const response = await intruder.agent.get(`/api/v1/attempts/${state.attemptId}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('closes and reports an attempt whose time ran out', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    await expireWindow(state.attemptId);

    const response = await agent.get(`/api/v1/attempts/${state.attemptId}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ATTEMPT_EXPIRED');
    const stored = await prisma.attempt.findUniqueOrThrow({ where: { id: state.attemptId } });
    expect(stored.status).toBe('EXPIRED');
  });

  it('409s for an attempt that has already been submitted', async () => {
    const exam = await createExam();
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    await agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({});

    const response = await agent.get(`/api/v1/attempts/${state.attemptId}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ATTEMPT_ALREADY_FINISHED');
  });
});

describe('PATCH /api/v1/attempts/:id/answers (autosave)', () => {
  it('upserts, so a replayed flush does not duplicate rows', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    const question = exam.questions[0]!;
    const payload = { answers: [{ questionId: question.id, optionId: question.correctOptionId }] };

    const first = await agent.patch(`/api/v1/attempts/${state.attemptId}/answers`).send(payload);
    const replay = await agent.patch(`/api/v1/attempts/${state.attemptId}/answers`).send(payload);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.answeredCount).toBe(1);
    expect(await prisma.attemptAnswer.count({ where: { attemptId: state.attemptId } })).toBe(1);
  });

  it('lets a learner change and clear an answer', async () => {
    const exam = await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    const question = exam.questions[0]!;

    await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({ answers: [{ questionId: question.id, optionId: question.correctOptionId }] });
    await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({ answers: [{ questionId: question.id, optionId: question.wrongOptionId }] });
    const cleared = await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({ answers: [{ questionId: question.id, optionId: null }] });

    expect(cleared.body.answeredCount).toBe(0);
    const resumed = await agent.get(`/api/v1/attempts/${state.attemptId}`);
    expect(resumed.body.answers[question.id]).toBeNull();
  });

  it('rejects a question that is not part of this exam', async () => {
    const exam = await createExam({ questionCount: 1 });
    const other = await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({
        answers: [
          { questionId: other.questions[0]!.id, optionId: other.questions[0]!.correctOptionId },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('answers.0.questionId');
  });

  it('rejects an option that belongs to a different question', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({
        answers: [
          {
            questionId: exam.questions[0]!.id,
            optionId: exam.questions[1]!.correctOptionId,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('answers.0.optionId');
  });

  it('refuses to save after the deadline', async () => {
    const exam = await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    await expireWindow(state.attemptId);

    const response = await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({
        answers: [
          { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ATTEMPT_EXPIRED');
  });

  it('cannot be used against another learner\'s attempt', async () => {
    const exam = await createExam({ questionCount: 1 });
    const owner = await signedInStudent();
    const state = await startAttempt(owner.agent, exam.id);
    const intruder = await signedInStudent();

    const response = await intruder.agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({
        answers: [
          { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        ],
      });

    expect(response.status).toBe(404);
  });

  it('rejects an empty batch', async () => {
    const exam = await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({ answers: [] });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/attempts/:id/submit', () => {
  it('grades on the server and ignores any score the client sends', async () => {
    const exam = await createExam({ questionCount: 4, passPercentage: 50 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent
      .post(`/api/v1/attempts/${state.attemptId}/submit`)
      .send({
        // A hostile client trying to dictate its own result.
        score: 999,
        percentage: 100,
        answers: [
          { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
          { questionId: exam.questions[1]!.id, optionId: exam.questions[1]!.correctOptionId },
          { questionId: exam.questions[2]!.id, optionId: exam.questions[2]!.wrongOptionId },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'SUBMITTED',
      score: 2,
      maxScore: 4,
      percentage: 50,
      passed: true,
      correctCount: 2,
      incorrectCount: 1,
      unansweredCount: 1,
    });
  });

  it('is idempotent: a duplicate submit returns the stored result', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const first = await agent
      .post(`/api/v1/attempts/${state.attemptId}/submit`)
      .send({
        answers: [
          { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        ],
      });
    const second = await agent
      .post(`/api/v1/attempts/${state.attemptId}/submit`)
      .send({
        // A different payload must not change an already-graded attempt.
        answers: [
          { questionId: exam.questions[1]!.id, optionId: exam.questions[1]!.correctOptionId },
        ],
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await prisma.attempt.count()).toBe(1);
  });

  it('survives concurrent submissions without double-grading', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const responses = await Promise.all([
      agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({}),
      agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('SUBMITTED');
    }
    const stored = await prisma.attempt.findUniqueOrThrow({ where: { id: state.attemptId } });
    expect(stored.status).toBe('SUBMITTED');
    expect(stored.submittedAt).not.toBeNull();
  });

  it('grades an untouched attempt as all-unanswered rather than failing', async () => {
    const exam = await createExam({ questionCount: 3 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({});

    expect(response.body).toMatchObject({
      score: 0,
      percentage: 0,
      passed: false,
      unansweredCount: 3,
      correctCount: 0,
      incorrectCount: 0,
    });
  });

  it('discards answers that arrive after the deadline and marks the attempt EXPIRED', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    await expireWindow(state.attemptId);

    const response = await agent
      .post(`/api/v1/attempts/${state.attemptId}/submit`)
      .send({
        answers: [
          { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('EXPIRED');
    expect(response.body.score).toBe(0);
    expect(response.body.unansweredCount).toBe(2);
  });

  it('keeps answers autosaved BEFORE the deadline when the attempt expires', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    await agent
      .patch(`/api/v1/attempts/${state.attemptId}/answers`)
      .send({
        answers: [
          { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        ],
      });
    await expireWindow(state.attemptId);

    const response = await agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({});

    expect(response.body.status).toBe('EXPIRED');
    expect(response.body.correctCount).toBe(1);
    expect(response.body.score).toBe(1);
  });

  it('cannot submit another learner\'s attempt', async () => {
    const exam = await createExam();
    const owner = await signedInStudent();
    const state = await startAttempt(owner.agent, exam.id);
    const intruder = await signedInStudent();

    const response = await intruder.agent
      .post(`/api/v1/attempts/${state.attemptId}/submit`)
      .send({});

    expect(response.status).toBe(404);
    const stored = await prisma.attempt.findUniqueOrThrow({ where: { id: state.attemptId } });
    expect(stored.status).toBe('IN_PROGRESS');
  });
});

describe('GET /api/v1/attempts/:id/result', () => {
  it('returns the answer key, explanations and topic breakdown after submission', async () => {
    const exam = await createExam({ questionCount: 3 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    await agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({
      answers: [
        { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
        { questionId: exam.questions[1]!.id, optionId: exam.questions[1]!.wrongOptionId },
      ],
    });

    const response = await agent.get(`/api/v1/attempts/${state.attemptId}/result`);

    expect(response.status).toBe(200);
    expect(response.body.questions).toHaveLength(3);
    expect(response.body.questions[0]).toMatchObject({
      isCorrect: true,
      correctOptionId: exam.questions[0]!.correctOptionId,
    });
    expect(response.body.questions[0].explanation).toContain('option 1 is correct');
    expect(response.body.questions[2].selectedOptionId).toBeNull();
    expect(response.body.topicScores).toHaveLength(1);
    expect(response.body.topicScores[0]).toMatchObject({ correct: 1, total: 3 });
  });

  it('refuses to reveal the key while the attempt is still running', async () => {
    const exam = await createExam();
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);

    const response = await agent.get(`/api/v1/attempts/${state.attemptId}/result`);

    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).not.toContain('correctOptionId');
  });

  it('auto-closes and returns the result for an attempt whose time ran out', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    await expireWindow(state.attemptId);

    const response = await agent.get(`/api/v1/attempts/${state.attemptId}/result`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('EXPIRED');
  });

  it('cannot read another learner\'s result', async () => {
    const exam = await createExam();
    const owner = await signedInStudent();
    const state = await startAttempt(owner.agent, exam.id);
    await owner.agent.post(`/api/v1/attempts/${state.attemptId}/submit`).send({});

    const intruder = await signedInStudent();
    const response = await intruder.agent.get(`/api/v1/attempts/${state.attemptId}/result`);

    expect(response.status).toBe(404);
  });

  it('includes the learner\'s history for the same exam, oldest first', async () => {
    const exam = await createExam({ questionCount: 2 });
    const user = await createStudent();
    const agent = await signIn(user);

    const first = await startAttempt(agent, exam.id);
    await agent.post(`/api/v1/attempts/${first.attemptId}/submit`).send({});
    const second = await startAttempt(agent, exam.id);
    await agent.post(`/api/v1/attempts/${second.attemptId}/submit`).send({
      answers: [
        { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
      ],
    });

    const response = await agent.get(`/api/v1/attempts/${second.attemptId}/result`);

    expect(response.body.history).toHaveLength(2);
    expect(response.body.history[0].percentage).toBe(0);
    expect(response.body.history[1].percentage).toBe(50);
  });
});

describe('GET /api/v1/attempts (history)', () => {
  it('lists only the caller\'s own attempts, newest first', async () => {
    const exam = await createExam({ questionCount: 1 });
    const mine = await signedInStudent();
    const theirs = await signedInStudent();

    const a = await startAttempt(mine.agent, exam.id);
    await mine.agent.post(`/api/v1/attempts/${a.attemptId}/submit`).send({});
    const b = await startAttempt(mine.agent, exam.id);
    await mine.agent.post(`/api/v1/attempts/${b.attemptId}/submit`).send({});
    const other = await startAttempt(theirs.agent, exam.id);
    await theirs.agent.post(`/api/v1/attempts/${other.attemptId}/submit`).send({});

    const response = await mine.agent.get('/api/v1/attempts');

    expect(response.body.total).toBe(2);
    const ids = response.body.items.map((item: { attemptId: string }) => item.attemptId);
    expect(ids).toEqual([b.attemptId, a.attemptId]);
    expect(ids).not.toContain(other.attemptId);
  });

  it('filters by exam and paginates', async () => {
    const examA = await createExam({ questionCount: 1 });
    const examB = await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();

    const a = await startAttempt(agent, examA.id);
    await agent.post(`/api/v1/attempts/${a.attemptId}/submit`).send({});
    const b = await startAttempt(agent, examB.id);
    await agent.post(`/api/v1/attempts/${b.attemptId}/submit`).send({});

    const filtered = await agent.get(`/api/v1/attempts?examId=${examA.id}`);
    const paged = await agent.get('/api/v1/attempts?pageSize=1');

    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].attemptId).toBe(a.attemptId);
    expect(paged.body.items).toHaveLength(1);
    expect(paged.body.totalPages).toBe(2);
  });

  it('closes attempts whose time has run out when the history is read', async () => {
    const exam = await createExam({ questionCount: 1 });
    const { agent } = await signedInStudent();
    const state = await startAttempt(agent, exam.id);
    await expireWindow(state.attemptId);

    const response = await agent.get('/api/v1/attempts');

    expect(response.body.items[0].status).toBe('EXPIRED');
  });

  it('requires authentication', async () => {
    expect((await anonymous().get('/api/v1/attempts')).status).toBe(401);
  });
});
