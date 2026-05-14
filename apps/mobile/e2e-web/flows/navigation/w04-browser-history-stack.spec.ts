import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

// NOTE: Browser Back/Forward is not the supported return contract for hidden
// tab routes on Expo Router web; tab entries are replaced rather than pushed.
// Practice opens Quiz with returnTo=practice, and Quiz owns the contextual
// back action with router.replace('/practice').
test('W-04 practice to quiz keeps the contextual web stack coherent', async ({
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

  await pressableClick(page.getByTestId('quiz-back'));
  await expect(page.getByTestId('practice-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/practice(?:\?.*)?$/);
});
