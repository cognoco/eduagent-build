import { expect, test, type Page } from '@playwright/test';

import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

async function allowOnlyFlowApi(
  page: Page,
  allowedPathPrefixes: ReadonlyArray<string>,
) {
  await page.context().route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (!url.hostname.startsWith('127.') && url.hostname !== 'localhost') {
      await route.continue();
      return;
    }

    if (allowedPathPrefixes.some((prefix) => url.pathname.startsWith(prefix))) {
      await route.continue();
      return;
    }

    await route.abort('blockedbyclient');
  });
}

test('ACCOUNT-12 scheduled account deletion opens keep-account state and sends cancel request', async ({
  page,
}) => {
  await allowOnlyFlowApi(page, [
    '/v1/profiles',
    '/v1/account/deletion-status',
    '/v1/account/cancel-deletion',
  ]);

  await seedAndSignIn(page, {
    scenario: 'account-deletion-scheduled',
    alias: 'account-12',
    landingPath: '/delete-account',
    landingTestId: 'delete-account-scheduled',
  });

  await expect(page.getByTestId('delete-account-scheduled')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('delete-account-confirm')).toHaveCount(0);
  await expect(page.getByTestId('delete-account-keep')).toBeVisible();
  await expect(page.getByText('Sign out now')).toBeVisible();

  let cancelRequested = false;
  await page.route('**/v1/account/cancel-deletion', async (route) => {
    cancelRequested = true;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Deletion cancelled' }),
    });
  });

  await pressableClick(page.getByTestId('delete-account-keep'));
  await expect.poll(() => cancelRequested, { timeout: 10_000 }).toBe(true);
});

test('BILLING-05 active trial shows manage billing surface on web', async ({
  page,
}) => {
  await allowOnlyFlowApi(page, [
    '/v1/profiles',
    '/v1/subscription',
    '/v1/usage',
  ]);

  await seedAndSignIn(page, {
    scenario: 'trial-active',
    alias: 'billing-05',
    landingPath: '/subscription',
    landingTestId: 'subscription-screen',
  });

  await expect(page.getByTestId('subscription-screen')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('trial-banner')).toBeVisible();
  await expect(page.getByTestId('manage-billing-web-info')).toBeVisible();
  await expect(page.getByTestId('manage-billing-web-info')).toContainText(
    'Manage billing',
  );
});
