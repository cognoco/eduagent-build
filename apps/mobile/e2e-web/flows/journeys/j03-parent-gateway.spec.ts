import { expect, test } from '@playwright/test';

test('J-03 seeded parent lands on parent home @smoke', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByTestId(/^parent-home-check-child-/).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId(/^parent-home-weekly-report-/).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId(/^parent-home-send-nudge-/).first(),
  ).toBeVisible();
  await expect(page.getByTestId('tab-my-learning')).toBeVisible();
});
