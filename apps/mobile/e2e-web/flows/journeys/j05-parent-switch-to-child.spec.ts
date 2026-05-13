import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-05 parent opens a linked child detail from home', async ({ page }) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-check-child-${childProfileId}`),
  );
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(new RegExp(`/child/${childProfileId}`));
});
