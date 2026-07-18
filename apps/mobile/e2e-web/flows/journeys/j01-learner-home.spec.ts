import { expect, test } from '@playwright/test';

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
  await page.goto('/more', { waitUntil: 'commit' });

  const chrome = page.getByTestId('account-avatar-shell');
  const screenTitle = page.getByText('More', { exact: true }).first();
  await expect(chrome).toBeVisible({ timeout: 60_000 });
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
