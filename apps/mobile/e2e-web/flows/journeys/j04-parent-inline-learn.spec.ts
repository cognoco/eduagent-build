import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressFamilyHomeAction } from '../../helpers/parent-home';

test('J-04 parent opens child progress detail from child action', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });

  const progressAction = page.getByTestId(/^parent-home-check-child-/).first();
  await pressFamilyHomeAction(page, progressAction, { timeout: 60_000 });
  await waitForAppScreen(page, 'child-detail-scroll', {
    timeout: 30_000,
    familyRouteRecovery: async () => {
      await pressFamilyHomeAction(
        page,
        page.getByTestId(/^parent-home-check-child-/).first(),
        { timeout: 30_000 },
      );
    },
  });
  await expect(page).toHaveURL(/\/child\/[^/?]+(?:\?.*)?$/);
});
