import { expect, test } from '@playwright/test';

import { pressableClick } from '../../helpers/pressable';

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
  await expect(
    page.getByTestId('parent-home-study-activation-action'),
  ).toBeVisible();
  await expect(page.getByTestId('tab-my-learning')).toBeHidden();
});

test('J-03 parent can switch between Family and My Learning @smoke', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('home-mode-chip')).toBeVisible();

  await pressableClick(page.getByTestId('parent-home-study-activation-action'));

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('parent-home-screen')).toHaveCount(0);

  await pressableClick(page.getByTestId('home-mode-chip'));

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 30_000,
  });
});
