import { expect, test } from '@playwright/test';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';
import { pressableClick } from '../../helpers/pressable';

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

  // [DIAG] Localize whether router.push reached /create-profile at all
  await page.waitForTimeout(2_000);
  const diag = {
    url: page.url(),
    gateVisible: await page
      .getByTestId('create-profile-gate')
      .isVisible()
      .catch(() => 'err'),
    formVisible: await page
      .getByTestId('create-profile-name')
      .isVisible()
      .catch(() => 'err'),
    bodyText: await page
      .locator('body')
      .innerText()
      .then((t) => t.slice(0, 200))
      .catch(() => 'err'),
  };
  // Throw the diag so it appears in the failure trace
  if (diag.formVisible !== true) {
    throw new Error(`[J-12 DIAG] ${JSON.stringify(diag, null, 2)}`);
  }

  await expect(page.getByTestId('create-profile-name')).toBeVisible({
    timeout: 30_000,
  });

  await page.getByTestId('create-profile-name').fill('Casey');
  await page.getByTestId('create-profile-birthdate-input').fill('2000-05-01');
  await pressableClick(page.getByTestId('create-profile-submit'));

  await expect(page.getByTestId('learner-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
});
