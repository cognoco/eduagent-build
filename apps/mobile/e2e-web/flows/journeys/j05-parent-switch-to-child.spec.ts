import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressFamilyHomeAction } from '../../helpers/parent-home';
import { readSeedData } from '../../helpers/seed-data';

test('J-05 parent opens a linked child progress detail from home', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  await pressFamilyHomeAction(
    page,
    page.getByTestId(`parent-home-child-progress-${childProfileId}`),
    { timeout: 60_000 },
  );
  await waitForAppScreen(page, 'child-detail-scroll', {
    timeout: 30_000,
    familyRouteRecovery: async () => {
      await pressFamilyHomeAction(
        page,
        page.getByTestId(`parent-home-child-progress-${childProfileId}`),
        { timeout: 30_000 },
      );
    },
  });
  await expect(page).toHaveURL(
    new RegExp(`/child/${childProfileId}(?:\\?.*)?$`),
  );
});
