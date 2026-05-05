import { expect, test } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

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
    page.locator('[data-testid="sign-in-email"]').last()
  ).toBeVisible({
    timeout: 30_000,
  });
});
