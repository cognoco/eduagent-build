import { expect, test, type Page } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressFamilyHomeAction } from '../../helpers/parent-home';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

async function requestConsentAgain(page: Page): Promise<void> {
  const requestConsent = page.getByTestId('consent-withdrawn-request-cta');
  const withdrawConsent = page.getByTestId('withdraw-consent-button');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const restoreResponse = page
      .waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response.url().includes('/v1/consent/') &&
          response.url().includes('/restore'),
        { timeout: 15_000 },
      )
      .catch(() => null);

    await pressableClick(requestConsent);
    const response = await restoreResponse;
    if (response?.ok()) {
      await expect(withdrawConsent).toBeVisible({ timeout: 30_000 });
      return;
    }

    await page.waitForTimeout(1_000);
  }

  await expect(withdrawConsent).toBeVisible({ timeout: 1 });
}

test('J-21 parent manages child consent from child detail', async ({
  page,
}) => {
  const seed = await seedAndSignIn(page, {
    scenario: 'parent-multi-child',
    alias: 'j21',
    // [WI-879] Under V1 nav an adult owner with linked children resolves as a
    // guardian and lands directly on FamilyHome (`parent-home-screen`) — the
    // `seedParentMultiChild` parent is seeded with `defaultAppContext: 'family'`
    // (test-seed.ts), so there is no intermediate Study/learner-screen step.
    // The prior `learner-screen` readiness contract encoded the stale V0 flow
    // (land on learner-screen, switch to family). Mirrors the WI-801 fix to the
    // `ownerWithChildren` auth scenario (fixtures/scenarios.ts).
    landingTestId: 'parent-home-screen',
    landingPath: '/home',
  });
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
  const consentStatusError = page.getByTestId('consent-status-error');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await withdrawConsent.isVisible().catch(() => false)) {
      await pressableClick(withdrawConsent);

      if (await withdrawnState.isVisible().catch(() => false)) {
        break;
      }

      if (
        attempt < 2 &&
        (await consentStatusError.isVisible().catch(() => false))
      ) {
        await page.waitForTimeout(1_000);
        continue;
      }
    }

    const retry = page.getByTestId('consent-status-retry');
    if (await retry.isVisible().catch(() => false)) {
      await pressableClick(retry);
    }
    await page.waitForTimeout(1_000);
  }

  await expect(withdrawnState).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/sharing paused/i)).toBeVisible();
  await expect(page.getByText(/account closes in \d+ days/i)).toBeVisible();

  await requestConsentAgain(page);
});
