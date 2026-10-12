import { expect, type Page } from '@playwright/test';

/**
 * Shared steps for the end-to-end specs.
 *
 * Each spec creates its OWN account rather than sharing one: tests that share a
 * learner also share attempt history, and then a failure in one becomes a
 * mysterious failure in another.
 */

let counter = 0;

export function uniqueEmail(prefix = 'student'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@e2e.local`;
}

export interface E2eUser {
  name: string;
  email: string;
  password: string;
}

export function newUser(prefix = 'student'): E2eUser {
  return {
    name: 'E2E Learner',
    email: uniqueEmail(prefix),
    password: 'E2ePassword123',
  };
}

export async function registerStudent(page: Page, user = newUser()): Promise<E2eUser> {
  await page.goto('/register');
  await page.fill('#name', user.name);
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('[data-testid="register-submit"]');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
  return user;
}

/**
 * Signs in and waits for the login response to land.
 *
 * Waiting matters: without it the next statement can navigate away while the
 * POST is still in flight, which cancels it and leaves the browser signed out -
 * a flake that looks exactly like an authorization bug.
 *
 * Deliberately does not assert success, so the negative tests can use it too.
 */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);

  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes('/api/v1/auth/login') && candidate.request().method() === 'POST',
  );
  await page.click('[data-testid="login-submit"]');
  await response;
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Starts the named exam from the catalogue and lands on the runner. */
export async function startExam(page: Page, title: string): Promise<string> {
  await page.goto('/exams');
  await page.fill('[data-testid="exam-search"]', title);
  const card = page.locator('article.card', { hasText: title }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Start/ }).click();

  await expect(page).toHaveURL(/\/attempts\/[^/]+\/take/);
  const attemptId = attemptIdFrom(page.url());
  await expect(page.locator('[data-testid="timer"]')).toBeVisible();
  return attemptId;
}

export function attemptIdFrom(url: string): string {
  const match = /\/attempts\/([^/]+)\//.exec(new URL(url).pathname);
  if (!match?.[1]) {
    throw new Error(`No attempt id in URL: ${url}`);
  }
  return match[1];
}

/**
 * Answers the first `count` questions by picking the given option index, then
 * waits for the autosave indicator to confirm the work reached the server.
 */
export async function answerQuestions(
  page: Page,
  count: number,
  optionIndex = 0,
): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.click(`[data-testid="option-${optionIndex}"]`);
    const next = page.locator('[data-testid="next-question"]');
    if (index < count - 1 && (await next.count()) > 0) {
      await next.click();
    }
  }
  await expect(page.locator('[data-testid="save-status"]')).toContainText('All answers saved', {
    timeout: 15_000,
  });
}

export async function submitAttempt(page: Page): Promise<void> {
  await page.click('[data-testid="open-submit"]');
  await page.click('[data-testid="confirm-accept"]');
  await expect(page).toHaveURL(/\/attempts\/[^/]+\/result/);
}
