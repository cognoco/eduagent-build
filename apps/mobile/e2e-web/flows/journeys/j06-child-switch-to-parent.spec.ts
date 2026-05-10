import { expect, test } from '@playwright/test';
import { readSeedData } from '../../helpers/seed-data';
import { waitForScreenDismissingPostApproval } from '../../helpers/post-approval';

test('J-06 child switches back to parent profile → learner screen', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/family', { waitUntil: 'commit' });

  // Start on Family, where the profile switcher lives.
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 60_000,
  });

  // Switch to child first
  await page.getByTestId('profile-switcher-chip').click();
  await expect(page.getByTestId('profile-switcher-menu')).toBeVisible();
  await page.getByTestId(`profile-option-${childProfileId}`).click();
  await waitForScreenDismissingPostApproval(page, 'learner-screen');

  // Child proxy mode exposes the dedicated switch-back affordance.
  await expect(page.getByTestId('proxy-banner')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('proxy-banner-switch-back').click();

  // Learner screen is back
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
});
