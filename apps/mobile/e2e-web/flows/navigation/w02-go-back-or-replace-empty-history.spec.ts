import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('W-02 goBackOrReplace falls back when a direct URL has no browser history', async ({
  page,
}) => {
  await page.goto('/quiz', { waitUntil: 'commit' });
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('quiz-back').click();
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/practice(?:\?.*)?$/);
});
