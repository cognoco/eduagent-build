import path from 'node:path';
import { expect, test } from '@playwright/test';
import { authStateDir } from '../../helpers/runtime';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('W-04 browser back and forward keep the web stack coherent', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await page.getByTestId('intent-practice').click();
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('practice-quiz').click();
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 30_000,
  });

  await page.goBack();
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await page.goForward();
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 30_000,
  });
});
