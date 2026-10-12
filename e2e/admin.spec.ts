import { expect, test } from '@playwright/test';
import { DEMO_ADMIN } from './env';
import { registerStudent, signIn, signOut } from './helpers';

/** Unique title per run so repeated runs do not collide on the slug. */
function examTitle(): string {
  return `E2E Authored Paper ${Date.now()}`;
}

test.describe('administrator authoring', () => {
  test('platform statistics are rendered from real data', async ({ page }) => {
    await signIn(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Platform overview');
    await expect(page.getByText('Published exams')).toBeVisible();
    await expect(page.getByText('Questions', { exact: true })).toBeVisible();
    await expect(page.getByText('Exam performance')).toBeVisible();
  });

  test('an exam is created as a draft, blocked from publishing, then published', async ({
    page,
  }) => {
    const title = examTitle();
    await signIn(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    // ---- create
    await page.goto('/admin/exams');
    await page.click('[data-testid="new-exam"]');
    await page.fill('[data-testid="exam-title"]', title);
    await page.fill(
      '[data-testid="exam-description"]',
      'An exam authored by the end-to-end suite to exercise the publishing workflow.',
    );
    await page.selectOption('[data-testid="exam-topic"]', { index: 1 });
    await page.fill('#durationMinutes', '12');
    await page.fill('#passPercentage', '50');
    await page.click('[data-testid="save-exam"]');

    await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/exams\/[^/]+$/);

    // ---- publish checks refuse an exam with no questions, and say why
    await expect(page.locator('[data-testid="publish-problems"]')).toContainText(
      'Add at least one question.',
    );

    // ---- add a question
    await page.click('[data-testid="add-question"]');
    await page.fill(
      '[data-testid="question-prompt-0"]',
      'Which HTTP status means the caller is authenticated but not allowed?',
    );
    await page.fill('[data-testid="option-text-0-0"]', '403 Forbidden');
    await page.fill('[data-testid="option-text-0-1"]', '401 Unauthorized');
    await page.fill('[data-testid="option-text-0-2"]', '404 Not Found');
    await page.fill('[data-testid="option-text-0-3"]', '500 Internal Server Error');
    await page.check('[data-testid="correct-0-0"]');
    await page.click('[data-testid="save-questions"]');

    await expect(page.getByText('Questions saved.')).toBeVisible();
    await expect(page.getByText('Ready to publish')).toBeVisible();

    // ---- preview shows the answer key to the author
    await page.getByRole('link', { name: 'Preview' }).first().click();
    await expect(page.getByText("Author's view")).toBeVisible();
    await expect(page.getByText('403 Forbidden')).toBeVisible();
    await expect(page.getByText('Correct', { exact: true }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Back to editor' }).click();

    // ---- publish
    await page.click('[data-testid="publish-exam"]');
    await page.click('[data-testid="confirm-accept"]');
    await expect(page.getByText('Exam published.')).toBeVisible();
    await expect(page.getByText('PUBLISHED', { exact: true })).toBeVisible();

    // ---- a learner can now find and start it
    await signOut(page);
    await registerStudent(page);
    await page.goto('/exams');
    await page.fill('[data-testid="exam-search"]', title);
    const card = page.locator('article.card', { hasText: title }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Start/ }).click();

    await expect(page).toHaveURL(/\/attempts\/[^/]+\/take/);
    await expect(
      page.getByText('Which HTTP status means the caller is authenticated but not allowed?'),
    ).toBeVisible();
  });

  test('a draft exam is invisible to learners until it is published', async ({ page }) => {
    const title = examTitle();
    await signIn(page, DEMO_ADMIN.email, DEMO_ADMIN.password);

    await page.goto('/admin/exams/new');
    await page.fill('[data-testid="exam-title"]', title);
    await page.fill(
      '[data-testid="exam-description"]',
      'A draft that must never appear in the learner catalogue.',
    );
    await page.selectOption('[data-testid="exam-topic"]', { index: 1 });
    await page.click('[data-testid="save-exam"]');
    await expect(page.getByText('DRAFT', { exact: true })).toBeVisible();

    await signOut(page);
    await page.goto('/exams');
    await page.fill('[data-testid="exam-search"]', title);
    await expect(page.getByText('No exams match those filters')).toBeVisible();
  });

  test('the editor rejects an incomplete exam before calling the API', async ({ page }) => {
    await signIn(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin/exams/new');

    await page.fill('[data-testid="exam-title"]', 'no');
    await page.fill('[data-testid="exam-description"]', 'short');
    await page.click('[data-testid="save-exam"]');

    await expect(page.getByText('Title must be at least 4 characters.')).toBeVisible();
    await expect(page.getByText('Description must be at least 10 characters.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/exams\/new/);
  });

  test('the seeded draft exam is listed for an administrator but not for learners', async ({
    page,
  }) => {
    await signIn(page, DEMO_ADMIN.email, DEMO_ADMIN.password);
    await page.goto('/admin/exams');
    await page.selectOption('#status', 'DRAFT');

    const table = page.locator('[data-testid="admin-exam-table"]');
    await expect(table).toContainText('Angular & RxJS Patterns');

    await signOut(page);
    await page.goto('/exams');
    await page.fill('[data-testid="exam-search"]', 'Angular & RxJS Patterns');
    await expect(page.getByText('No exams match those filters')).toBeVisible();
  });
});
