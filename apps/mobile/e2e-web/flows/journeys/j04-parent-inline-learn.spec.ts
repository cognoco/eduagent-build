import { expect, test } from '@playwright/test';

test('J-04 parent can use learner actions from Home', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('home-child-card')).toBeVisible();
  await expect(page.getByTestId('home-action-study-new')).toBeVisible();

  await page.getByTestId('home-action-study-new').click();
  await expect(page.getByTestId('create-subject-name')).toBeVisible({
    timeout: 30_000,
  });

  await page.goBack();
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
});
