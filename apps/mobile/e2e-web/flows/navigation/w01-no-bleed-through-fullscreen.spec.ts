import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('W-01 full-screen routes hide the tab bar and prior scene content', async ({
  page,
}) => {
  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 60_000,
  });

  await pressableClick(page.getByTestId('home-action-practice'));
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('practice-quiz'));
  await expect(page.getByTestId('quiz-index-screen')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('tab-home')).toBeHidden();
  await expect(page.getByTestId('tab-library')).toBeHidden();
});
