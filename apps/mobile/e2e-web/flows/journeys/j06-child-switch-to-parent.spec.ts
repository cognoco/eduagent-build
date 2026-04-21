import { expect, test } from '@playwright/test';
import { readSeedData } from '../../helpers/seed-data';
import { waitForScreenDismissingPostApproval } from '../../helpers/post-approval';

test('J-06 child switches back to parent profile → parent gateway', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const parentProfileId = seed.ids.parentProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  // Start on parent gateway
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });

  // Switch to child first
  await page.getByTestId('profile-switcher-chip').click();
  await expect(page.getByTestId('profile-switcher-menu')).toBeVisible();
  await page.getByTestId(`profile-option-${childProfileId}`).click();
  await waitForScreenDismissingPostApproval(page, 'learner-screen');

  // Now switch back to parent
  await page.getByTestId('profile-switcher-chip').click();
  await expect(page.getByTestId('profile-switcher-menu')).toBeVisible();
  await page.getByTestId(`profile-option-${parentProfileId}`).click();

  // Parent gateway is back
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('learner-screen')).toHaveCount(0);
});
