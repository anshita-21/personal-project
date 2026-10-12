import { prisma } from '../src/db/prisma';
import { createExam, createTopic } from '../src/testing/fixtures';
import { anonymous, signedInAdmin, signedInStudent } from './helpers';

const validExam = {
  title: 'Brand New Paper',
  description: 'A description that is comfortably long enough to pass validation.',
  difficulty: 'MEDIUM' as const,
  durationMinutes: 45,
  passPercentage: 70,
};

const question = (topicId: string, prompt: string) => ({
  prompt,
  explanation: 'Because the first option is the right one.',
  topicId,
  points: 1,
  options: [
    { text: 'Right', isCorrect: true },
    { text: 'Wrong', isCorrect: false },
    { text: 'Also wrong', isCorrect: false },
  ],
});

describe('admin authorization', () => {
  /**
   * Every privileged route is checked, not just a representative one: the role
   * gate lives on the router, and this is the test that proves a newly added
   * route inherits it.
   */
  const routes: [string, string][] = [
    ['get', '/api/v1/admin/stats'],
    ['get', '/api/v1/admin/exams'],
    ['post', '/api/v1/admin/exams'],
    ['get', '/api/v1/admin/exams/some-id'],
    ['patch', '/api/v1/admin/exams/some-id'],
    ['delete', '/api/v1/admin/exams/some-id'],
    ['get', '/api/v1/admin/exams/some-id/questions'],
    ['put', '/api/v1/admin/exams/some-id/questions'],
    ['get', '/api/v1/admin/exams/some-id/publish-check'],
    ['post', '/api/v1/admin/exams/some-id/publish'],
    ['post', '/api/v1/admin/exams/some-id/archive'],
    ['post', '/api/v1/admin/exams/some-id/unpublish'],
    ['post', '/api/v1/admin/topics'],
  ];

  it.each(routes)('rejects an anonymous %s %s with 401', async (method, path) => {
    const agent = anonymous();
    const response = await (agent[method as 'get'](path) as ReturnType<typeof agent.get>).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(routes)('rejects a STUDENT %s %s with 403', async (method, path) => {
    const { agent } = await signedInStudent();
    const response = await (agent[method as 'get'](path) as ReturnType<typeof agent.get>).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });
});

describe('exam authoring', () => {
  it('creates an exam as a DRAFT, never published straight away', async () => {
    const { agent } = await signedInAdmin();
    const topic = await createTopic();

    const response = await agent
      .post('/api/v1/admin/exams')
      .send({ ...validExam, topicId: topic.id });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: 'Brand New Paper',
      status: 'DRAFT',
      questionCount: 0,
    });
    expect(response.body.slug).toBe('brand-new-paper');
  });

  it('records the author', async () => {
    const { agent, user } = await signedInAdmin();
    const topic = await createTopic();

    const response = await agent
      .post('/api/v1/admin/exams')
      .send({ ...validExam, topicId: topic.id });

    const stored = await prisma.exam.findUniqueOrThrow({
      where: { id: response.body.id },
      select: { createdById: true },
    });
    expect(stored.createdById).toBe(user.id);
  });

  it('de-duplicates slugs', async () => {
    const { agent } = await signedInAdmin();
    const topic = await createTopic();

    const first = await agent.post('/api/v1/admin/exams').send({ ...validExam, topicId: topic.id });
    const second = await agent
      .post('/api/v1/admin/exams')
      .send({ ...validExam, topicId: topic.id });

    expect(first.body.slug).toBe('brand-new-paper');
    expect(second.body.slug).toBe('brand-new-paper-2');
  });

  it('rejects an unknown topic', async () => {
    const { agent } = await signedInAdmin();
    const response = await agent
      .post('/api/v1/admin/exams')
      .send({ ...validExam, topicId: 'no-such-topic' });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('topicId');
  });

  it('validates the exam metadata', async () => {
    const { agent } = await signedInAdmin();
    const topic = await createTopic();

    const response = await agent.post('/api/v1/admin/exams').send({
      title: 'no',
      description: 'short',
      topicId: topic.id,
      difficulty: 'EXTREME',
      durationMinutes: 9999,
    });

    expect(response.status).toBe(400);
    const paths = response.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'description', 'difficulty', 'durationMinutes']));
  });

  it('updates metadata and re-slugs only while still a draft', async () => {
    const { agent } = await signedInAdmin();
    const draft = await createExam({ status: 'DRAFT', questionCount: 1, title: 'Old Title' });
    const published = await createExam({ status: 'PUBLISHED', questionCount: 1 });
    const topic = await createTopic();

    const draftUpdate = await agent
      .patch(`/api/v1/admin/exams/${draft.id}`)
      .send({ ...validExam, title: 'Renamed Draft', topicId: topic.id });
    const publishedUpdate = await agent
      .patch(`/api/v1/admin/exams/${published.id}`)
      .send({ ...validExam, title: 'Renamed Published', topicId: topic.id });

    expect(draftUpdate.body.slug).toBe('renamed-draft');
    // A published exam's URL has been shared and past results link to it.
    expect(publishedUpdate.body.slug).toBe(published.slug);
    expect(publishedUpdate.body.title).toBe('Renamed Published');
  });

  it('404s for an unknown exam', async () => {
    const { agent } = await signedInAdmin();
    const topic = await createTopic();

    expect((await agent.get('/api/v1/admin/exams/nope')).status).toBe(404);
    expect(
      (await agent.patch('/api/v1/admin/exams/nope').send({ ...validExam, topicId: topic.id }))
        .status,
    ).toBe(404);
  });

  it('can open a draft exam, which students cannot', async () => {
    const { agent } = await signedInAdmin();
    const draft = await createExam({ status: 'DRAFT', questionCount: 2 });

    expect((await agent.get(`/api/v1/admin/exams/${draft.id}`)).status).toBe(200);
    expect((await anonymous().get(`/api/v1/exams/${draft.id}`)).status).toBe(404);
  });
});

describe('question authoring', () => {
  it('replaces the whole question set and renumbers positions', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'DRAFT', questionCount: 3 });
    const topic = await createTopic();

    const response = await agent.put(`/api/v1/admin/exams/${exam.id}/questions`).send({
      questions: [question(topic.id, 'First replacement?'), question(topic.id, 'Second replacement?')],
    });

    expect(response.status).toBe(200);
    expect(response.body.questionCount).toBe(2);

    const stored = await prisma.question.findMany({
      where: { examId: exam.id },
      orderBy: { position: 'asc' },
      select: { prompt: true, position: true },
    });
    expect(stored.map((row) => row.position)).toEqual([1, 2]);
    expect(stored[0]?.prompt).toBe('First replacement?');
  });

  it('returns the answer key to an admin for the editor', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'DRAFT', questionCount: 2 });

    const response = await agent.get(`/api/v1/admin/exams/${exam.id}/questions`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].options.filter((o: { isCorrect: boolean }) => o.isCorrect)).toHaveLength(1);
    expect(response.body[0].explanation).toBeTruthy();
  });

  it('refuses a question without exactly one correct option', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'DRAFT', questionCount: 1 });
    const topic = await createTopic();

    const noCorrect = await agent.put(`/api/v1/admin/exams/${exam.id}/questions`).send({
      questions: [
        {
          ...question(topic.id, 'Nothing is right?'),
          options: [
            { text: 'a', isCorrect: false },
            { text: 'b', isCorrect: false },
          ],
        },
      ],
    });
    const twoCorrect = await agent.put(`/api/v1/admin/exams/${exam.id}/questions`).send({
      questions: [
        {
          ...question(topic.id, 'Both are right?'),
          options: [
            { text: 'a', isCorrect: true },
            { text: 'b', isCorrect: true },
          ],
        },
      ],
    });

    expect(noCorrect.status).toBe(400);
    expect(twoCorrect.status).toBe(400);
    // The original question set is untouched by a rejected save.
    expect(await prisma.question.count({ where: { examId: exam.id } })).toBe(1);
  });

  it('rejects the whole batch when one question references an unknown topic', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'DRAFT', questionCount: 1 });
    const topic = await createTopic();

    const response = await agent.put(`/api/v1/admin/exams/${exam.id}/questions`).send({
      questions: [question(topic.id, 'Fine question?'), question('ghost-topic', 'Bad question?')],
    });

    expect(response.status).toBe(400);
    expect(await prisma.question.count({ where: { examId: exam.id } })).toBe(1);
  });

  it('requires at least one question', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'DRAFT', questionCount: 1 });

    const response = await agent
      .put(`/api/v1/admin/exams/${exam.id}/questions`)
      .send({ questions: [] });

    expect(response.status).toBe(400);
  });
});

describe('publishing lifecycle', () => {
  it('explains exactly why an exam is not publishable', async () => {
    const { agent } = await signedInAdmin();
    const empty = await createExam({ status: 'DRAFT', questionCount: 0 });

    const check = await agent.get(`/api/v1/admin/exams/${empty.id}/publish-check`);

    expect(check.status).toBe(200);
    expect(check.body.publishable).toBe(false);
    expect(check.body.problems).toContain('Add at least one question.');
  });

  it('refuses to publish an exam that fails its checks', async () => {
    const { agent } = await signedInAdmin();
    const empty = await createExam({ status: 'DRAFT', questionCount: 0 });

    const response = await agent.post(`/api/v1/admin/exams/${empty.id}/publish`).send({});

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('EXAM_NOT_PUBLISHABLE');
    expect(response.body.error.details[0].message).toContain('at least one question');

    const stored = await prisma.exam.findUniqueOrThrow({ where: { id: empty.id } });
    expect(stored.status).toBe('DRAFT');
  });

  it('publishes a complete exam and makes it visible to students', async () => {
    const { agent } = await signedInAdmin();
    const draft = await createExam({ status: 'DRAFT', questionCount: 2 });

    expect((await anonymous().get(`/api/v1/exams/${draft.id}`)).status).toBe(404);

    const response = await agent.post(`/api/v1/admin/exams/${draft.id}/publish`).send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('PUBLISHED');
    expect((await anonymous().get(`/api/v1/exams/${draft.id}`)).status).toBe(200);

    const stored = await prisma.exam.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.publishedAt).not.toBeNull();
  });

  it('archives an exam, hiding it without destroying results', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'PUBLISHED', questionCount: 2 });
    const student = await signedInStudent();
    const attempt = await student.agent.post('/api/v1/attempts').send({ examId: exam.id });
    await student.agent.post(`/api/v1/attempts/${attempt.body.attemptId}/submit`).send({});

    const response = await agent.post(`/api/v1/admin/exams/${exam.id}/archive`).send({});

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ARCHIVED');
    expect((await anonymous().get(`/api/v1/exams/${exam.id}`)).status).toBe(404);
    // The learner can still read their past result.
    expect(
      (await student.agent.get(`/api/v1/attempts/${attempt.body.attemptId}/result`)).status,
    ).toBe(200);
  });

  it('returns a published exam to draft', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'PUBLISHED', questionCount: 1 });

    const response = await agent.post(`/api/v1/admin/exams/${exam.id}/unpublish`).send({});

    expect(response.body.status).toBe('DRAFT');
    expect((await anonymous().get(`/api/v1/exams/${exam.id}`)).status).toBe(404);
  });

  it('deletes an exam nobody has attempted', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'DRAFT', questionCount: 2 });

    const response = await agent.delete(`/api/v1/admin/exams/${exam.id}`);

    expect(response.status).toBe(204);
    expect(await prisma.exam.count({ where: { id: exam.id } })).toBe(0);
    // Cascade removed the questions and options too.
    expect(await prisma.question.count()).toBe(0);
  });

  it('refuses to delete an exam with learner attempts', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'PUBLISHED', questionCount: 1 });
    const student = await signedInStudent();
    await student.agent.post('/api/v1/attempts').send({ examId: exam.id });

    const response = await agent.delete(`/api/v1/admin/exams/${exam.id}`);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('Archive it instead');
    expect(await prisma.exam.count({ where: { id: exam.id } })).toBe(1);
  });
});

describe('admin catalogue and statistics', () => {
  it('lists exams in every status and can filter by one', async () => {
    const { agent } = await signedInAdmin();
    await createExam({ status: 'PUBLISHED', title: 'Live' });
    await createExam({ status: 'DRAFT', title: 'Draft' });
    await createExam({ status: 'ARCHIVED', title: 'Retired' });

    const all = await agent.get('/api/v1/admin/exams');
    const drafts = await agent.get('/api/v1/admin/exams?status=DRAFT');

    expect(all.body.total).toBe(3);
    expect(drafts.body.items.map((i: { title: string }) => i.title)).toEqual(['Draft']);
    expect(all.body.items[0]).toHaveProperty('attemptTotal');
  });

  it('reports platform statistics computed from real rows', async () => {
    const { agent } = await signedInAdmin();
    const exam = await createExam({ status: 'PUBLISHED', questionCount: 2, passPercentage: 50 });
    await createExam({ status: 'DRAFT', questionCount: 1 });

    const student = await signedInStudent();
    const started = await student.agent.post('/api/v1/attempts').send({ examId: exam.id });
    await student.agent.post(`/api/v1/attempts/${started.body.attemptId}/submit`).send({
      answers: [
        { questionId: exam.questions[0]!.id, optionId: exam.questions[0]!.correctOptionId },
      ],
    });

    const response = await agent.get('/api/v1/admin/stats');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      totalExams: 2,
      publishedExams: 1,
      draftExams: 1,
      totalQuestions: 3,
      totalAttempts: 1,
      completedAttempts: 1,
      inProgressAttempts: 0,
      averagePercentage: 50,
    });
    expect(response.body.examPerformance[0]).toMatchObject({
      examId: exam.id,
      attempts: 1,
      averagePercentage: 50,
      passRate: 100,
    });
  });

  it('creates a topic and rejects a duplicate name', async () => {
    const { agent } = await signedInAdmin();

    const created = await agent
      .post('/api/v1/admin/topics')
      .send({ name: 'Linear Algebra', description: 'Vectors and matrices.' });
    const duplicate = await agent.post('/api/v1/admin/topics').send({ name: 'Linear Algebra' });

    expect(created.status).toBe(201);
    expect(created.body.slug).toBe('linear-algebra');
    expect(duplicate.status).toBe(409);
  });
});
