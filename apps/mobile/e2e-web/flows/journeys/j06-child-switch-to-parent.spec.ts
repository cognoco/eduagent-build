import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-06 parent opens child progress and returns home', async ({ page }) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  await waitForAppScreen(page, 'parent-home-screen', {
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-child-progress-${childProfileId}`),
  );
  await expect(page.getByTestId('progress-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId('tab-home'));

  await waitForAppScreen(page, 'parent-home-screen', {
    timeout: 30_000,
  });
});
