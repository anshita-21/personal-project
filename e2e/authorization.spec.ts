import { expect, test } from '@playwright/test';
import { API_URL, DEMO_ADMIN } from './env';
import {
  answerQuestions,
  attemptIdFrom,
  newUser,
  registerStudent,
  signIn,
  signOut,
  startExam,
  submitAttempt,
} from './helpers';

test.describe('authorization and data isolation', () => {
  test('a student cannot reach the admin area through the UI', async ({ page }) => {
    await registerStudent(page);

    await page.goto('/admin');

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText('administrators only')).toBeVisible();
    // The admin link is not even offered to a student.
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('a student cannot reach admin pages by typing a deeper URL', async ({ page }) => {
    await registerStudent(page);

    for (const url of ['/admin/exams', '/admin/exams/new']) {
      await page.goto(url);
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });

  /**
   * The route guard is UX. This is the test that proves the SERVER refuses the
   * same request, which is the only protection that actually matters.
   */
  test('the API refuses admin calls from a student session', async ({ page }) => {
    await registerStudent(page);

    const stats = await page.request.get(`${API_URL}/api/v1/admin/stats`);
    expect(stats.status()).toBe(403);
    expect((await stats.json()).error.code).toBe('FORBIDDEN');

    const create = await page.request.post(`${API_URL}/api/v1/admin/exams`, {
      data: {
        title: 'Smuggled Exam',
        description: 'Created by a student, which must not be possible.',
        topicId: 'whatever',
        difficulty: 'EASY',
        durationMinutes: 10,
      },
    });
    expect(create.status()).toBe(403);
  });

  test('the API refuses admin calls with no session at all', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/v1/admin/stats`);
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('one learner cannot open another learner\'s result', async ({ page }) => {
    // Learner A sits a paper.
    const learnerA = newUser('owner');
    await registerStudent(page, learnerA);
    await startExam(page, 'SQL Query Fundamentals');
    await answerQuestions(page, 2);
    await submitAttempt(page);
    const attemptId = attemptIdFrom(page.url());

    // Learner B signs in and tries the URL.
    await signOut(page);
    const learnerB = newUser('intruder');
    await registerStudent(page, learnerB);

    await page.goto(`/attempts/${attemptId}/result`);
    await expect(page.getByText(/belongs to someone else/i)).toBeVisible();
    // No part of learner A's result leaks onto the page.
    await expect(page.getByText('Answer review')).toHaveCount(0);

    // And the API itself answers 404 rather than confirming the id exists.
    const api = await page.request.get(`${API_URL}/api/v1/attempts/${attemptId}/result`);
    expect(api.status()).toBe(404);
    expect((await api.json()).error.code).toBe('NOT_FOUND');
  });

  test('one learner cannot submit or autosave into another learner\'s attempt', async ({
    page,
  }) => {
    await registerStudent(page, newUser('owner2'));
    const attemptId = await startExam(page, 'TypeScript Type System');

    await signOut(page);
    await registerStudent(page, newUser('intruder2'));

    const submit = await page.request.post(
      `${API_URL}/api/v1/attempts/${attemptId}/submit`,
      { data: {} },
    );
    expect(submit.status()).toBe(404);

    const save = await page.request.patch(
      `${API_URL}/api/v1/attempts/${attemptId}/answers`,
      { data: { answers: [{ questionId: 'q', optionId: null }] } },
    );
    expect(save.status()).toBe(404);
  });

  test('a learner sees only their own attempt history', async ({ page }) => {
    const learnerA = newUser('historyA');
    await registerStudent(page, learnerA);
    await startExam(page, 'JavaScript Essentials');
    await answerQuestions(page, 1);
    await submitAttempt(page);

    await signOut(page);
    await registerStudent(page, newUser('historyB'));

    await page.goto('/attempts');
    await expect(page.getByText('No attempts yet')).toBeVisible();
  });

  test('the exam-taking API never returns the answer key', async ({ page }) => {
    await registerStudent(page);
    const attemptId = await startExam(page, 'JavaScript Essentials');

    const response = await page.request.get(`${API_URL}/api/v1/attempts/${attemptId}`);
    const body = await response.text();

    expect(response.status()).toBe(200);
    expect(body).not.toContain('isCorrect');
    expect(body).not.toContain('explanation');
    expect(body).not.toContain('correctOptionId');
  });

  test('an administrator can reach the admin area', async ({ page }) => {
    await signIn(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('link', { name: 'Admin' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Platform overview');
  });
});
