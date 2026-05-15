import { expect, test, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

import { pressableClick } from '../../helpers/pressable';
import { buildSeedEmail } from '../../helpers/runtime';
import { seedScenario } from '../../helpers/test-seed';

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

async function seedSignInAndOpen(options: {
  page: Page;
  scenario: string;
  alias: string;
  path: string;
}) {
  const suffix = randomBytes(2).toString('hex');
  const seeded = await seedScenario({
    scenario: options.scenario,
    email: buildSeedEmail(`${options.alias}-${suffix}`),
  });

  await setupClerkTestingToken({ page: options.page });
  await options.page.goto('/sign-in', { waitUntil: 'commit' });
  await expect(options.page.getByTestId('sign-in-email')).toBeVisible({
    timeout: 60_000,
  });

  await options.page.getByTestId('sign-in-email').fill(seeded.email);
  await options.page.getByTestId('sign-in-password').fill(seeded.password);
  await pressableClick(options.page.getByTestId('sign-in-button'));

  await expect
    .poll(() => new URL(options.page.url()).pathname, { timeout: 60_000 })
    .not.toBe('/sign-in');

  const postApproval = options.page.getByTestId('post-approval-continue');
  if (await postApproval.isVisible().catch(() => false)) {
    await pressableClick(postApproval);
  }

  await options.page.goto(options.path, { waitUntil: 'commit' });
}

test('ACCOUNT-12 scheduled account deletion opens keep-account state and sends cancel request', async ({
  page,
}) => {
  await allowOnlyFlowApi(page, [
    '/v1/profiles',
    '/v1/account/deletion-status',
    '/v1/account/cancel-deletion',
  ]);

  await seedSignInAndOpen({
    page,
    scenario: 'account-deletion-scheduled',
    alias: 'account-12',
    path: '/delete-account',
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

  await seedSignInAndOpen({
    page,
    scenario: 'trial-active',
    alias: 'billing-05',
    path: '/subscription',
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
