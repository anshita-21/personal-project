import { expect, test } from '@playwright/test';
import { DEMO_STUDENT } from './env';
import { newUser, registerStudent, signIn, signOut } from './helpers';

test.describe('authentication', () => {
  test('a visitor can register and lands on their dashboard', async ({ page }) => {
    const user = newUser();
    await registerStudent(page, user);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
    // A brand-new learner gets honest zeros, not invented statistics.
    await expect(page.getByText('No completed attempts yet.')).toBeVisible();
  });

  test('registration rejects a weak password before calling the API', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#name', 'Weak Password');
    await page.fill('#email', newUser().email);
    await page.fill('#password', 'short');
    await page.click('[data-testid="register-submit"]');

    await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });

  test('registration refuses a duplicate email', async ({ page }) => {
    const user = newUser();
    await registerStudent(page, user);
    await signOut(page);

    await page.goto('/register');
    await page.fill('#name', user.name);
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('[data-testid="register-submit"]');

    await expect(page.locator('[data-testid="register-error"]')).toContainText(
      'already exists',
    );
  });

  test('a wrong password shows a generic error and does not sign the user in', async ({
    page,
  }) => {
    await signIn(page, DEMO_STUDENT.email, 'DefinitelyNotThePassword1');

    await expect(page.locator('[data-testid="login-error"]')).toContainText(
      'Invalid email or password.',
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test('an unknown email gives exactly the same error as a wrong password', async ({ page }) => {
    await signIn(page, 'nobody-at-all@e2e.local', 'DefinitelyNotThePassword1');

    // Identical wording: the form must not reveal whether an account exists.
    await expect(page.locator('[data-testid="login-error"]')).toContainText(
      'Invalid email or password.',
    );
  });

  test('signing out ends the session and protected pages redirect to login', async ({ page }) => {
    await registerStudent(page);
    await signOut(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard/);
  });

  test('a protected page remembers where the visitor was going', async ({ page }) => {
    const user = newUser();
    await registerStudent(page, user);
    await signOut(page);

    await page.goto('/attempts');
    await expect(page).toHaveURL(/returnUrl=%2Fattempts/);

    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('[data-testid="login-submit"]');

    await expect(page).toHaveURL(/\/attempts$/);
  });

  test('a signed-in learner is kept off the login page', async ({ page }) => {
    await registerStudent(page);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
