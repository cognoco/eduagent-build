import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-05 parent opens a linked child progress view from home', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const sessionId = seed.ids.session1Id;

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
  await expect(page.getByTestId(`progress-pill-${childProfileId}`)).toBeVisible(
    {
      timeout: 30_000,
    },
  );
  await expect(
    page
      .getByTestId('progress-screen')
      .getByTestId(`session-card-${sessionId}`),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/progress(?:\?.*)?$/);
});
