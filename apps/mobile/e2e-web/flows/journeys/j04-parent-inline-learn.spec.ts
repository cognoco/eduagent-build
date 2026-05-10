import { expect, test } from '@playwright/test';

test('J-04 parent taps child card to navigate to Family', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('home-child-card')).toBeVisible();

  await page.getByTestId('home-child-card').click();
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 30_000,
  });
});
