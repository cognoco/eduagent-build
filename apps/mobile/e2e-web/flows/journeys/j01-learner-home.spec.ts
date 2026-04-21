import { expect, test } from '@playwright/test';

test('J-01 seeded learner lands on learner home @smoke', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('intent-learn')).toBeVisible();
  await expect(page.getByTestId('intent-ask')).toBeVisible();
  await expect(page.getByTestId('intent-practice')).toBeVisible();
  await expect(page.getByTestId('intent-homework')).toBeVisible();
  await expect(page.getByTestId('parent-gateway')).toHaveCount(0);
});
