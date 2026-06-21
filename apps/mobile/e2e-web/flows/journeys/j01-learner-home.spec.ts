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
