import { expect, test } from '@playwright/test';

import { ensureFamilyHome } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';

test('J-03 seeded parent lands on parent home @smoke', async ({ page }) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
  await ensureFamilyHome(page, {
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
  await expect(page.getByTestId('mode-switcher-study')).toBeVisible();
  await expect(page.getByTestId('tab-my-learning')).toBeHidden();
});

test('J-03 parent can switch between Family and My Learning @smoke', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });

  await ensureFamilyHome(page, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('mode-switcher')).toBeVisible();
  await expect(page.getByTestId('mode-switcher-family')).toBeVisible();

  await pressableClick(page.getByTestId('mode-switcher-study'));

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('parent-home-screen')).toHaveCount(0);

  await ensureFamilyHome(page, {
    timeout: 60_000,
  });
});
