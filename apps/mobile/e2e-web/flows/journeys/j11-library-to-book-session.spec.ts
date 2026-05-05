import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-11 learner → Library → shelf → book → start learning', async ({
  page,
}) => {
  const seed = await readSeedData('solo-learner');
  const subjectId = seed.ids.subjectId;

  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('tab-library').click();
  await expect(page.getByTestId(`shelf-row-header-${subjectId}`)).toBeVisible({
    timeout: 30_000,
  });

  await page.locator('[data-testid^="book-row-"]').first().click();
  await expect(page.getByTestId('book-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('book-start-learning').click();
  await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/session(?:\?.*)?$/);
});
