import { expect, test } from '@playwright/test';

test('J-03 seeded parent lands on parent gateway @smoke', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('gateway-check-progress')).toBeVisible();
  await expect(page.getByTestId('gateway-learn')).toBeVisible();
  await expect(page.getByTestId('learner-screen')).toHaveCount(0);
});
