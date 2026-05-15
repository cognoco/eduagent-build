import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-17 parent opens a session recap and copies the conversation prompt', async ({
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
  const copyConversation = page.getByRole('button', {
    name: /copy conversation/i,
  });
  await expect(copyConversation).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('narrative-unavailable')).toHaveCount(0);

  await pressableClick(copyConversation);
  await expect(page.getByTestId('session-recap-copy-prompt-toast')).toBeVisible(
    { timeout: 30_000 },
  );
});
