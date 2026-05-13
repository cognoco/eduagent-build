import path from 'node:path';
import { expect, test } from '@playwright/test';
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
  await expect(page.getByTestId('parent-home-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(
    page.getByTestId(`parent-home-child-progress-${childProfileId}`),
  );
  await expect(page.getByTestId('progress-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId(`progress-pill-${childProfileId}`)).toBeVisible(
    {
      timeout: 30_000,
    },
  );

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

  await pressableClick(page.getByTestId('session-detail-continue-topic'));
  await expect(page.getByTestId('topic-status-card')).toBeVisible({
    timeout: 30_000,
  });

  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('session-metadata')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByRole('button', { name: /go back/i }));
  await expect(page.getByTestId('progress-screen')).toBeVisible({
    timeout: 30_000,
  });
});
