import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

async function enterWelcomeBridge(
  page: Page,
  audience: 'learner' | 'parent',
): Promise<void> {
  await page.goto('/welcome', { waitUntil: 'commit' });
  await expect(page.getByTestId('welcome-chooser')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId(`welcome-chooser-${audience}`).click();
  await expect(page.getByTestId('welcome-card-1')).toBeVisible();
  await page.getByTestId('welcome-next-button').click();
  await expect(page.getByTestId('welcome-card-2')).toBeVisible();
  await page.getByTestId('welcome-next-button').click();
  await expect(page.getByTestId('welcome-card-3')).toBeVisible();
  await page.getByTestId('welcome-start-button').click();
  await expect(page.getByTestId('pre-auth-bridge')).toBeVisible();
}

test('J-02 auth screen navigation works on web @smoke', async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto('/sign-in', { waitUntil: 'commit' });

  await expect(page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('sign-in-password')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('sign-up-link').click();
  await expect(page).toHaveURL(/\/sign-up(?:\?.*)?$/);
  await expect(page.getByTestId('sign-up-email')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('sign-up-password')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('sign-in-link').click();
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
  const forgotPasswordLink = page
    .locator('[data-testid="forgot-password-link"]')
    .last();
  await expect(forgotPasswordLink).toBeVisible({
    timeout: 30_000,
  });

  await forgotPasswordLink.click();
  await expect(page).toHaveURL(/\/forgot-password(?:\?.*)?$/);
  await expect(page.getByTestId('forgot-password-email')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('back-to-sign-in').click();
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
  await expect(
    page.locator('[data-testid="sign-in-email"]').last(),
  ).toBeVisible({
    timeout: 30_000,
  });
});

test('learner welcome bridge retains mentor-memory copy and routes to sign in @smoke', async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await enterWelcomeBridge(page, 'learner');

  await expect(
    page.getByText('Turn "I don\'t get it" into "I\'ve got this."'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Create a free account so your mentor can remember your subjects, notes, and progress.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText('Continue with your account to support your learner.'),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('preAuthAudience.v1')))
    .toContain('"audience":"learner"');

  await page.getByTestId('pre-auth-bridge-secondary').click();

  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('preAuthAudience.v1')))
    .toContain('"audience":"learner"');
});

test('parent welcome bridge uses supporter copy, preserves intent, and routes to sign up @smoke', async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await enterWelcomeBridge(page, 'parent');

  await expect(
    page.getByText('Continue with your account to support your learner.'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Sign in or sign up to accept the invitation and set up support. Your account does not grant access to learning activity unless the learner authorizes it.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Create a free account so your mentor can remember your subjects, notes, and progress.',
    ),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('preAuthAudience.v1')))
    .toContain('"audience":"parent"');

  await page.getByTestId('pre-auth-bridge-primary').click();

  await expect(page).toHaveURL(/\/sign-up(?:\?.*)?$/);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('preAuthAudience.v1')))
    .toContain('"audience":"parent"');
});
