import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-12 new user → create profile → lands on learner home', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'pre-profile',
    alias: 'j12',
    landingTestId: 'create-profile-gate',
    landingPath: '/home',
  });

  await pressableClick(page.getByTestId('create-profile-cta'));
  await expect(page.getByTestId('create-profile-name')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('create-profile-name').fill('Casey');
  await page.getByTestId('create-profile-birthdate-input').fill('2000-05-01');
  await page.getByTestId('create-profile-submit').click();

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
});
