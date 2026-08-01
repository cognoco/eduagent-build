import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test.use({ storageState: { cookies: [], origins: [] } });

test('family-intent signup can reach the existing-account invitation without a supportership edge', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const visibilityLinkWrites: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      new URL(request.url()).pathname.includes('/visibility/links')
    ) {
      visibilityLinkWrites.push(request.url());
    }
  });

  await seedAndSignIn(page, {
    scenario: 'pre-profile',
    alias: 'v2-family-intent',
    landingTestId: 'create-profile-gate',
  });

  // The pre-profile scenario has no Person and therefore cannot hold a
  // supportership edge. Carry the signed-up adult's family intent into the
  // ordinary profile-creation form through the production pre-auth carrier.
  await page.evaluate(() => {
    localStorage.setItem(
      'preAuthAudience.v1',
      JSON.stringify({
        audience: 'parent',
        savedAt: Date.now(),
      }),
    );
  });

  await pressableClick(page.getByTestId('create-profile-cta'));
  await expect(page.getByTestId('create-profile-name')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId('create-profile-name').fill('Casey');
  await page.getByTestId('create-profile-birthdate-input').fill('2000-05-01');
  await pressableClick(page.getByTestId('create-profile-submit'));

  await expect(page.getByTestId('family-intent-onboarding-gate')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('family-intent-target-someone-else'));
  await expect(page.getByTestId('family-intent-login-yes')).toBeVisible();
  await pressableClick(page.getByTestId('family-intent-login-yes'));

  await expect(
    page.getByTestId('visibility-link-initiate-existing-teen-invite'),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('visibility-link-initiate-picker')).toHaveCount(
    0,
  );
  expect(visibilityLinkWrites).toEqual([]);
});
