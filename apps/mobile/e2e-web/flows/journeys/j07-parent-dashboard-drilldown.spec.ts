import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { readSeedData } from '../../helpers/seed-data';

test('J-07 parent → child progress → session recap → back to parent home', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;
  const sessionId = seed.ids.session1Id;

  await page.goto('/home', { waitUntil: 'commit' });

  await waitForAppScreen(page, 'parent-home-screen', {
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-child-progress-${childProfileId}`),
  );
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await page.goto(`/child/${childProfileId}/session/${sessionId}`, {
    waitUntil: 'commit',
  });
  await waitForAppScreen(page, 'session-detail-ctas', {
    timeout: 90_000,
    screenRetryTestId: 'retry-session',
  });

  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('tab-home'));
  await waitForAppScreen(page, 'parent-home-screen', {
    timeout: 30_000,
  });
});
