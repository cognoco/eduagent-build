import { expect, test, type Page } from '@playwright/test';
import { waitForAppScreen } from '../../helpers/app-screen';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

async function waitForFamilySetupCta(page: Page): Promise<void> {
  const cta = page.getByTestId('home-family-setup-cta-button');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await cta.isVisible().catch(() => false)) {
      return;
    }

    if (
      await cta
        .waitFor({ state: 'visible', timeout: attempt === 0 ? 30_000 : 15_000 })
        .then(() => true)
        .catch(() => false)
    ) {
      return;
    }

    const subjectsRetry = page.getByTestId('home-subjects-load-retry');
    if (await subjectsRetry.isVisible().catch(() => false)) {
      await pressableClick(subjectsRetry);
      await page.waitForTimeout(1_000);
    }

    if (attempt < 2) {
      await page.reload({ waitUntil: 'commit' });
      await waitForAppScreen(page, 'learner-screen', { timeout: 30_000 });
    }
  }

  await expect(cta).toBeVisible({ timeout: 1 });
}

test('J-15 family-plan parent with no children sees Family setup CTA from Study home', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'parent-solo',
    alias: 'j15',
    landingTestId: 'learner-screen',
    landingPath: '/home',
  });

  await waitForFamilySetupCta(page);
  await pressableClick(page.getByTestId('home-family-setup-cta-button'));
  await expect(page.getByTestId('add-child-link')).toBeVisible({
    timeout: 30_000,
  });
  await pressableClick(page.getByTestId('add-child-link'));
  await expect(page.getByTestId('create-profile-name')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/create-profile(?:\?.*for=child.*)?$/);
});
