import { expect, test } from '@playwright/test';

import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test.use({ storageState: { cookies: [], origins: [] } });

test('V2 zero-state Mentor renders one enabled free-form composer with secondary starters and capture actions', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'onboarding-no-subject',
    alias: 'wi-2129-single-composer',
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  });

  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mentor-cold-start-card')).toBeVisible();

  const composer = page.getByRole('textbox', { name: 'Ask anything' });
  await expect(composer).toBeEnabled();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByTestId('cold-start-input')).toHaveCount(0);
  await expect(page.getByTestId('cold-start-send')).toHaveCount(0);

  await expect(page.getByTestId('cold-start-chip-homework')).toBeVisible();
  await expect(page.getByTestId('cold-start-chip-learn')).toBeVisible();
  await expect(page.getByTestId('cold-start-chip-ask')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-camera')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-mic')).toBeVisible();
  await expect(page.getByTestId('mentor-bar-homework-chip')).toBeVisible();

  await pressableClick(page.getByTestId('cold-start-chip-homework'));

  await expect(page.getByTestId('cold-start-homework-reply')).toBeVisible();
  await expect(page.getByTestId('cold-start-homework-camera')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Camera' })).toHaveCount(1);

  await pressableClick(page.getByTestId('cold-start-chip-learn'));

  await expect(composer).toHaveValue('Teach me something new');
  await expect(composer).toBeFocused();
  await expect(page.getByTestId('mentor-bar-send')).toBeEnabled();
  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
});
