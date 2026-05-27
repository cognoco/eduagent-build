import { expect, test, type Page } from '@playwright/test';
import { ensureFamilyHome } from '../../helpers/app-screen';
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
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });
  const childProfileId = seed.ids.child1ProfileId;

  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await ensureFamilyHome(page, {
    timeout: 90_000,
    screenRetries: 5,
  });

  await pressableClick(
    page.getByTestId(`parent-home-child-profile-${childProfileId}`),
  );
  await expect(page.getByTestId('child-detail-scroll')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('consent-section')).toBeVisible({
    timeout: 30_000,
  });

  const withdrawConsent = page.getByTestId('withdraw-consent-button');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await withdrawConsent.isVisible().catch(() => false)) {
      break;
    }

    const retry = page.getByTestId('consent-status-retry');
    if (await retry.isVisible().catch(() => false)) {
      await pressableClick(retry);
    }
    await page.waitForTimeout(1_000);
  }

  await expect(withdrawConsent).toBeVisible({ timeout: 30_000 });
  await pressableClick(withdrawConsent);

  await expect(page.getByTestId('consent-withdrawn-empty-state')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/sharing paused/i)).toBeVisible();
  await expect(page.getByText(/account closes in \d+ days/i)).toBeVisible();

  await requestConsentAgain(page);
});
