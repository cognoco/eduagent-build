import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('W-05 tab URLs render the correct screen on web', async ({ page }) => {
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.goto('/library', { waitUntil: 'commit' });
  await expect(page.getByTestId(`subject-card-${subjectId}`)).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/progress', { waitUntil: 'commit' });
  await expect(page.getByText('My Learning Journey')).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/more', { waitUntil: 'commit' });
  await expect(page.getByRole('button', { name: 'Profile' })).toBeVisible({
    timeout: 30_000,
  });
});
