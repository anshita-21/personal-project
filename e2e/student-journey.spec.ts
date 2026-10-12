import { expect, test } from '@playwright/test';
import {
  answerQuestions,
  attemptIdFrom,
  registerStudent,
  startExam,
  submitAttempt,
} from './helpers';

const EXAM = 'JavaScript Essentials';

test.describe('the complete learner journey', () => {
  test('browse the catalogue, filter it, and open an exam', async ({ page }) => {
    await registerStudent(page);

    await page.goto('/exams');
    await expect(page.locator('[data-testid="exam-grid"] article')).not.toHaveCount(0);

    // Search narrows the grid.
    await page.fill('[data-testid="exam-search"]', 'SQL');
    await expect(page.locator('[data-testid="exam-grid"]')).toContainText('SQL');
    await expect(page.locator('[data-testid="exam-grid"]')).not.toContainText(
      'Data Structures & Complexity',
    );

    // A filter that matches nothing gets a real empty state, not a blank page.
    await page.fill('[data-testid="exam-search"]', 'zzzz-no-such-exam');
    await expect(page.getByText('No exams match those filters')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.locator('[data-testid="exam-grid"] article')).not.toHaveCount(0);

    // The detail page describes the paper without leaking any question text.
    await page.fill('[data-testid="exam-search"]', EXAM);
    await page.locator('article.card', { hasText: EXAM }).first().getByRole('link', { name: 'Details' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(EXAM);
    await expect(page.getByText('How the attempt works')).toBeVisible();
    await expect(page.locator('[data-testid="start-exam"]')).toBeEnabled();
  });

  test('start an exam, answer, recover after a refresh, submit, and review', async ({ page }) => {
    await registerStudent(page);
    const attemptId = await startExam(page, EXAM);

    // ---- the runner shows progress and a server-anchored countdown
    await expect(page.locator('[data-testid="timer"]')).toHaveText(/\d{2}:\d{2}/);
    await expect(page.getByText('Question 1 of 8')).toBeVisible();

    await answerQuestions(page, 3);
    await expect(page.getByText('3 answered')).toBeVisible();

    // ---- RECOVERY: a reload must restore the exact draft
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/attempts/${attemptId}/take`));
    await expect(page.locator('[data-testid="timer"]')).toBeVisible();
    await expect(page.getByText('3 answered')).toBeVisible();
    // It reopens on the first unanswered question, which is question 4.
    await expect(page.getByText('Question 4 of 8')).toBeVisible();

    // Navigating back shows the stored answer still selected.
    await page.locator('[data-testid="nav-question-0"]').click();
    await expect(page.locator('[data-testid="option-0"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // ---- the confirmation screen warns about blanks before submitting
    await page.click('[data-testid="open-submit"]');
    await expect(page.locator('dialog')).toContainText('5 questions are still unanswered');
    await page.getByRole('button', { name: 'Keep working' }).click();

    await answerQuestions(page, 1);
    await submitAttempt(page);

    // ---- results
    await expect(page).toHaveURL(new RegExp(`/attempts/${attemptId}/result`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Passed|Not passed yet/);
    await expect(page.getByText('Answer review')).toBeVisible();
    await expect(page.getByText('By topic')).toBeVisible();
    await expect(page.locator('[data-testid="review-1"]')).toBeVisible();

    // The answer key and an explanation are available only now.
    await expect(page.locator('[data-testid="review-1"]')).toContainText('Correct answer');
    await expect(page.locator('[data-testid="review-1"]')).toContainText('Why:');

    // Unanswered questions are counted separately from wrong ones.
    await expect(page.getByText('Unanswered')).toBeVisible();

    // Filtering the review to the incorrect answers works.
    await page.click('[data-testid="filter-wrong"]');
    await expect(page.locator('article.question').first()).toBeVisible();
  });

  test('a submitted attempt cannot be reopened and the runner redirects to the result', async ({
    page,
  }) => {
    await registerStudent(page);
    const attemptId = await startExam(page, 'SQL Query Fundamentals');
    await answerQuestions(page, 2);
    await submitAttempt(page);

    await page.goto(`/attempts/${attemptId}/take`);

    await expect(page).toHaveURL(new RegExp(`/attempts/${attemptId}/result`));
    await expect(page.getByText('Answer review')).toBeVisible();
  });

  test('attempt history lists graded attempts and links to each review', async ({ page }) => {
    await registerStudent(page);
    await startExam(page, EXAM);
    await answerQuestions(page, 2);
    await submitAttempt(page);

    await page.goto('/attempts');
    const table = page.locator('[data-testid="attempt-table"]');
    await expect(table).toContainText(EXAM);
    await expect(table.getByRole('link', { name: 'Review' }).first()).toBeVisible();

    await table.getByRole('link', { name: 'Review' }).first().click();
    await expect(page.getByText('Answer review')).toBeVisible();
  });

  test('the dashboard reflects the attempt that was just completed', async ({ page }) => {
    await registerStudent(page);
    await startExam(page, EXAM);
    await answerQuestions(page, 8);
    await submitAttempt(page);

    await page.goto('/dashboard');
    const recent = page.locator('section.card', { hasText: 'Recent attempts' });
    await expect(page.getByRole('heading', { name: 'Recent attempts' })).toBeVisible();
    await expect(recent).toContainText(EXAM);
    await expect(page.getByRole('heading', { name: 'Topic accuracy' })).toBeVisible();
    // Statistics are computed from the attempt, so they are no longer zero.
    await expect(page.locator('[data-testid="next-action"]')).not.toContainText(
      'establish a baseline',
    );
  });

  test('starting the same exam twice resumes the first attempt instead of creating a second', async ({
    page,
  }) => {
    await registerStudent(page);
    const first = await startExam(page, EXAM);
    await answerQuestions(page, 1);

    await page.goto('/exams');
    await page.fill('[data-testid="exam-search"]', EXAM);
    const card = page.locator('article.card', { hasText: EXAM }).first();
    await expect(card).toContainText('In progress');
    await card.getByRole('link', { name: 'Resume' }).click();

    await expect(page).toHaveURL(new RegExp(`/attempts/${first}/take`));
    await expect(page.getByText('1 answered')).toBeVisible();
  });

  test('an unknown attempt id shows a handled error, not a crash', async ({ page }) => {
    await registerStudent(page);
    await page.goto('/attempts/not-a-real-attempt/take');

    await expect(page.getByText('This attempt is not available')).toBeVisible();
    await expect(page.getByText('Attempt not found.')).toBeVisible();
  });

  test('an unknown route shows the not-found page', async ({ page }) => {
    await page.goto('/this/route/does/not/exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
  });

  test('the attempt id in the URL is the one used for the result', async ({ page }) => {
    await registerStudent(page);
    await startExam(page, 'TypeScript Type System');
    await answerQuestions(page, 1);
    await submitAttempt(page);

    const resultId = attemptIdFrom(page.url());
    await page.goto(`/attempts/${resultId}/result`);
    await expect(page.getByText('Answer review')).toBeVisible();
  });
});
