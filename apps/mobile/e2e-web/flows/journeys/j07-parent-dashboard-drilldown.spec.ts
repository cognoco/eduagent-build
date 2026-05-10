import { expect, test } from '@playwright/test';
import { readSeedData } from '../../helpers/seed-data';

test('J-07 parent → dashboard → child detail → back to dashboard', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  await page.goto('/home', { waitUntil: 'commit' });

  // Start on learner screen
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  // Navigate to dashboard
  await page.getByTestId('home-child-card').click();
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 30_000,
  });

  // Verify child card is visible and drill into child detail
  await page.getByTestId(`dashboard-child-${childProfileId}`).click();
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  // Back to dashboard (browser back — Expo Router stacks screens on web)
  await page.goBack();
  await expect(page.getByTestId('dashboard-scroll')).toBeVisible({
    timeout: 30_000,
  });
});
