import { expect, test } from '@playwright/test';

test('J-04 parent taps Learn → sees learner view → back to parent gateway', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });

  // Start on parent gateway
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });

  // Tap "Learn something" — renders inline learner view (no route change)
  await page.getByTestId('gateway-learn').click();
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('home-action-study-new')).toBeVisible();

  // Tap back — returns to parent gateway
  await page.getByTestId('learner-back').click();
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 30_000,
  });
});
