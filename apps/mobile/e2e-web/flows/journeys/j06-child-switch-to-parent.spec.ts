import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-06 parent opens child progress and returns home', async ({ page }) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-check-child-${childProfileId}`),
  );
  await expect(page.getByTestId('progress-screen')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByTestId('tab-home'));

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 30_000,
  });
});
