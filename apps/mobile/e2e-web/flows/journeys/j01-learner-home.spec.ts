import { expect, test } from '@playwright/test';
import { armJ01AccountReadiness } from '../../helpers/j01-account-readiness';

test('J-01 seeded learner lands on V2 mentor home @smoke', async ({ page }) => {
  await page.goto('/mentor', { waitUntil: 'commit' });

  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mentor-on-track-badge')).toBeVisible();
  await expect(page.getByTestId('mentor-input-bar')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-camera')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-input')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-homework-chip')).toBeVisible();
  await expect(page.getByTestId('tab-mentor')).toBeVisible();
  await expect(page.getByTestId('tab-subjects')).toBeVisible();
  await expect(page.getByTestId('tab-journal')).toBeVisible();
});

test('J-01 pushed V2 content clears fixed chrome at 360x760 @smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  const chrome = page.getByTestId('account-avatar-shell');
  const screenTitle = page.getByText('More', { exact: true }).first();
  const accountReadiness = armJ01AccountReadiness(page);
  try {
    await page.goto('/more', { waitUntil: 'commit' });
    try {
      await expect(chrome).toBeVisible({ timeout: 60_000 });
    } catch (cause) {
      throw new Error(await accountReadiness.failureMessage(60_000), {
        cause,
      });
    }
  } finally {
    accountReadiness.dispose();
  }
  await expect(screenTitle).toBeVisible({ timeout: 60_000 });

  const [chromeBox, titleBox] = await Promise.all([
    chrome.boundingBox(),
    screenTitle.boundingBox(),
  ]);
  expect(chromeBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.y).toBeGreaterThanOrEqual(
    chromeBox!.y + chromeBox!.height - 0.5,
  );
  await expect(page.getByTestId('account-avatar-button')).toBeEnabled();
});
