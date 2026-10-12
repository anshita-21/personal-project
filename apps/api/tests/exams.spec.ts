import request from 'supertest';
import { prisma } from '../src/db/prisma';
import { createExam, createTopic } from '../src/testing/fixtures';
import { app, signedInStudent } from './helpers';

describe('GET /api/v1/exams', () => {
  it('returns an empty, well-formed page when there is no content', async () => {
    const response = await request(app).get('/api/v1/exams');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 9,
      total: 0,
      totalPages: 1,
    });
  });

  it('lists published exams with their question count and total points', async () => {
    await createExam({ questionCount: 4, pointsPerQuestion: 2, title: 'Published Paper' });
    const response = await request(app).get('/api/v1/exams');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      title: 'Published Paper',
      questionCount: 4,
      totalPoints: 8,
    });
  });

  it('hides DRAFT and ARCHIVED exams from students', async () => {
    await createExam({ status: 'PUBLISHED', title: 'Visible' });
    await createExam({ status: 'DRAFT', title: 'Hidden Draft' });
    await createExam({ status: 'ARCHIVED', title: 'Hidden Archive' });

    const response = await request(app).get('/api/v1/exams');
    const titles = response.body.items.map((item: { title: string }) => item.title);

    expect(titles).toEqual(['Visible']);
    expect(response.body.total).toBe(1);
  });

  it('paginates with a stable ordering across pages', async () => {
    const topic = await createTopic('Shared');
    for (let index = 0; index < 5; index += 1) {
      await createExam({ topicId: topic.id, title: `Paper ${index}` });
    }

    const first = await request(app).get('/api/v1/exams?page=1&pageSize=2');
    const second = await request(app).get('/api/v1/exams?page=2&pageSize=2');
    const third = await request(app).get('/api/v1/exams?page=3&pageSize=2');

    expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(first.body.items).toHaveLength(2);
    expect(third.body.items).toHaveLength(1);

    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map(
      (item: { id: string }) => item.id,
    );
    // No row appears twice and none is missed - the ordering is total.
    expect(new Set(ids).size).toBe(5);
  });

  it('searches title, description and topic name', async () => {
    const algebra = await createTopic('Algebra');
    await createExam({ title: 'Linear Equations', topicId: algebra.id });
    await createExam({ title: 'Unrelated Paper' });

    const byTitle = await request(app).get('/api/v1/exams?search=linear');
    const byTopic = await request(app).get('/api/v1/exams?search=algebra');

    expect(byTitle.body.items.map((i: { title: string }) => i.title)).toEqual(['Linear Equations']);
    expect(byTopic.body.items.map((i: { title: string }) => i.title)).toEqual(['Linear Equations']);
  });

  it('treats SQL metacharacters in the search term as data', async () => {
    await createExam({ title: 'Safe Paper' });
    const response = await request(app).get(
      `/api/v1/exams?search=${encodeURIComponent("' OR 1=1; --")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
    // The table is still there.
    expect(await prisma.exam.count()).toBe(1);
  });

  it('filters by topic and difficulty', async () => {
    const topic = await createTopic('Targeted');
    await createExam({ topicId: topic.id, difficulty: 'HARD', title: 'Hard Targeted' });
    await createExam({ topicId: topic.id, difficulty: 'EASY', title: 'Easy Targeted' });
    await createExam({ difficulty: 'HARD', title: 'Hard Elsewhere' });

    const response = await request(app).get(
      `/api/v1/exams?topicId=${topic.id}&difficulty=HARD`,
    );

    expect(response.body.items.map((i: { title: string }) => i.title)).toEqual(['Hard Targeted']);
  });

  it('sorts by the requested column and direction', async () => {
    await createExam({ title: 'Beta Paper', durationMinutes: 10 });
    await createExam({ title: 'Alpha Paper', durationMinutes: 90 });

    const byTitle = await request(app).get('/api/v1/exams?sort=title&order=asc');
    const byDuration = await request(app).get('/api/v1/exams?sort=durationMinutes&order=desc');

    expect(byTitle.body.items.map((i: { title: string }) => i.title)).toEqual([
      'Alpha Paper',
      'Beta Paper',
    ]);
    expect(byDuration.body.items[0].durationMinutes).toBe(90);
  });

  it('rejects an invalid sort column, page and page size', async () => {
    for (const query of ['sort=passPercentage', 'page=0', 'pageSize=999', 'difficulty=EXTREME']) {
      const response = await request(app).get(`/api/v1/exams?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('does not expose per-learner fields to an anonymous caller', async () => {
    await createExam();
    const response = await request(app).get('/api/v1/exams');

    expect(response.body.items[0].bestPercentage).toBeUndefined();
    expect(response.body.items[0].activeAttemptId).toBeUndefined();
  });

  it('enriches rows for a signed-in learner', async () => {
    const exam = await createExam({ questionCount: 2 });
    const { agent } = await signedInStudent();

    await agent.post('/api/v1/attempts').send({ examId: exam.id });
    const response = await agent.get('/api/v1/exams');

    expect(response.body.items[0]).toMatchObject({
      attemptCount: 0,
      bestPercentage: null,
    });
    expect(response.body.items[0].activeAttemptId).toEqual(expect.any(String));
  });

  it('never includes the answer key in a catalogue response', async () => {
    await createExam({ questionCount: 3 });
    const response = await request(app).get('/api/v1/exams');

    expect(JSON.stringify(response.body)).not.toContain('isCorrect');
    expect(JSON.stringify(response.body)).not.toContain('explanation');
  });
});

describe('GET /api/v1/exams/:idOrSlug', () => {
  it('resolves by id and by slug', async () => {
    const exam = await createExam({ questionCount: 2, title: 'Findable' });

    const byId = await request(app).get(`/api/v1/exams/${exam.id}`);
    const bySlug = await request(app).get(`/api/v1/exams/${exam.slug}`);

    expect(byId.status).toBe(200);
    expect(bySlug.status).toBe(200);
    expect(byId.body.id).toBe(bySlug.body.id);
  });

  it('includes a topic breakdown so a learner knows what the paper covers', async () => {
    const exam = await createExam({ questionCount: 3 });
    const response = await request(app).get(`/api/v1/exams/${exam.id}`);

    expect(response.body.topicBreakdown).toHaveLength(1);
    expect(response.body.topicBreakdown[0].questionCount).toBe(3);
  });

  it('404s for a draft exam, an archived exam and an unknown id', async () => {
    const draft = await createExam({ status: 'DRAFT' });
    const archived = await createExam({ status: 'ARCHIVED' });

    expect((await request(app).get(`/api/v1/exams/${draft.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/v1/exams/${archived.id}`)).status).toBe(404);
    expect((await request(app).get('/api/v1/exams/does-not-exist')).status).toBe(404);
  });
});

describe('GET /api/v1/topics', () => {
  it('lists topics alphabetically for the catalogue filters', async () => {
    await createTopic('Zebra');
    await createTopic('Apple');

    const response = await request(app).get('/api/v1/topics');

    expect(response.status).toBe(200);
    expect(response.body.map((topic: { name: string }) => topic.name)).toEqual([
      'Apple',
      'Zebra',
    ]);
  });
});
