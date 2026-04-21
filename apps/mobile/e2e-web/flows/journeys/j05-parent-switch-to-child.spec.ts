import { expect, test } from '@playwright/test';
import { readSeedData } from '../../helpers/seed-data';
import { waitForScreenDismissingPostApproval } from '../../helpers/post-approval';

test('J-05 parent switches to child profile → child learner home', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  // Start on parent gateway
  await expect(page.getByTestId('parent-gateway')).toBeVisible({
    timeout: 60_000,
  });

  // Open profile switcher and switch to child
  await page.getByTestId('profile-switcher-chip').click();
  await expect(page.getByTestId('profile-switcher-menu')).toBeVisible();
  await page.getByTestId(`profile-option-${childProfileId}`).click();

  // Wait for menu to close and child's learner screen (or post-approval first)
  await waitForScreenDismissingPostApproval(page, 'learner-screen');
  await expect(page.getByTestId('parent-gateway')).toHaveCount(0);
  await expect(page.getByTestId('intent-learn')).toBeVisible();
});
