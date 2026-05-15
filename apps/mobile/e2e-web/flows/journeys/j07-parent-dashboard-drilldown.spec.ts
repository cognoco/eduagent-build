import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-07 parent → child progress → session recap → back to parent home', async ({
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
    page.getByTestId(`parent-home-child-progress-${childProfileId}`),
  );
  await expect(page.getByTestId('progress-screen')).toBeVisible({
    timeout: 30_000,
  });

  const sessionCard = page
    .getByTestId('progress-screen')
    .getByTestId(`session-card-${sessionId}`);
  await expect(sessionCard).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(sessionCard);
  await expect(page.getByTestId('session-detail-ctas')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('progress-screen')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('tab-home'));
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 30_000,
  });
});
