import { expect, test } from '@playwright/test';

test('J-03 seeded parent lands on learner screen @smoke', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('home-child-card')).toBeVisible();
  await expect(page.getByTestId('home-action-study-new')).toBeVisible();
});
