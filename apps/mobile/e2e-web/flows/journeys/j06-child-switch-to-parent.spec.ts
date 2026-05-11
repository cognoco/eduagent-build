import { expect, test } from '@playwright/test';
import { readSeedData } from '../../helpers/seed-data';

test('J-06 child switches back to parent profile → parent home screen', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId(`parent-home-check-child-${childProfileId}`).click();
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('proxy-banner')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('proxy-banner-switch-back').click();

  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 30_000,
  });
});
