import path from 'node:path';
import { expect, test } from '@playwright/test';
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
