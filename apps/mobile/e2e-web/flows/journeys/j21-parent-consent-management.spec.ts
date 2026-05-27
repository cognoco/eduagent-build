import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressFamilyHomeAction } from '../../helpers/parent-home';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';
import { readSeedData } from '../../helpers/seed-data';

test.use({ storageState: path.join(authStateDir, 'owner-with-children.json') });

test('J-21 parent manages child consent from child detail', async ({
  page,
}) => {
  const seed = await readSeedData('owner-with-children');
  const childProfileId = seed.ids.child1ProfileId;

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await page.goto('/home', { waitUntil: 'commit' });
  await pressFamilyHomeAction(
    page,
    page.getByTestId(`parent-home-child-profile-${childProfileId}`),
    { timeout: 60_000 },
  );
  await waitForAppScreen(page, 'consent-section', {
    timeout: 60_000,
    familyRouteRecovery: async () => {
      await pressFamilyHomeAction(
        page,
        page.getByTestId(`parent-home-child-profile-${childProfileId}`),
        { timeout: 30_000 },
      );
    },
  });

  await expect(page.getByTestId('consent-section')).toBeVisible({
    timeout: 30_000,
  });
  const withdrawConsent = page.getByTestId('withdraw-consent-button');
  const withdrawnState = page.getByTestId('consent-withdrawn-empty-state');
  const requestConsentAgain = page.getByTestId('consent-withdrawn-request-cta');
  const consentStatusError = page.getByTestId('consent-status-error');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await pressableClick(withdrawConsent);

    if (await withdrawnState.isVisible().catch(() => false)) {
      break;
    }

    if (
      attempt < 2 &&
      ((await consentStatusError.isVisible().catch(() => false)) ||
        (await withdrawConsent.isVisible().catch(() => false)))
    ) {
      await page.waitForTimeout(1_000);
      continue;
    }
  }

  await expect(withdrawnState).toBeVisible({ timeout: 30_000 });
  await expect(requestConsentAgain).toBeVisible({ timeout: 30_000 });
});
