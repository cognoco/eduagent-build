import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test('J-15 family-plan parent with no children sees add-first-child CTA', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'parent-solo',
    alias: 'j15',
    landingTestId: 'add-first-child-screen',
    landingPath: '/home',
  });

  await expect(page.getByTestId('add-first-child-cta')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('add-first-child-cta'));
  await expect(page.getByTestId('create-profile-name')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/create-profile(?:\?.*)?$/);
});
