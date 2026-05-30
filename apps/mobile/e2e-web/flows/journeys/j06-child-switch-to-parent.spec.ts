import { test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import {
  enterFamilyHome,
  pressFamilyHomeAction,
} from '../../helpers/parent-home';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-06 parent opens child progress and returns home', async ({ page }) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  await pressFamilyHomeAction(
    page,
    page.getByTestId(`parent-home-check-child-${childProfileId}`),
    { timeout: 60_000 },
  );
  await waitForAppScreen(page, 'child-detail-scroll', {
    timeout: 30_000,
    familyRouteRecovery: async () => {
      await pressFamilyHomeAction(
        page,
        page.getByTestId(`parent-home-check-child-${childProfileId}`),
        { timeout: 30_000 },
      );
    },
  });

  await pressableClick(page.getByTestId('tab-home'));

  await enterFamilyHome(page, { timeout: 30_000 });
});
