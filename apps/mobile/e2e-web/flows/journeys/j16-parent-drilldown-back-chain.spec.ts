import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-16 parent drill-down reaches topic detail and unwinds cleanly', async ({
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

  await pressableClick(page.getByTestId('session-detail-continue-topic'));
  await expect(page.getByTestId('topic-status-card')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('session-metadata')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });
});
