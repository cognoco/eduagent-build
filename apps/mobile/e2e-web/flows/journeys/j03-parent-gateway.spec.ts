import { expect, test, type Page } from '@playwright/test';

import { signIn } from '../../helpers/auth';
import { expectAppMode, switchAppMode } from '../../helpers/mode-switcher';
import { enterFamilyHome } from '../../helpers/parent-home';
import { buildSeedEmail } from '../../helpers/runtime';
import { seedScenario } from '../../helpers/test-seed';

test.describe.configure({ mode: 'serial' });
test.use({ storageState: { cookies: [], origins: [] } });

async function seedAndSignInParent(page: Page, alias: string): Promise<void> {
  const seeded = await seedScenario({
    scenario: 'parent-multi-child',
    email: buildSeedEmail(alias),
  });

  await signIn(page, {
    email: seeded.email,
    password: seeded.password,
    landingPath: '/home',
    landingTestId: 'parent-home-screen',
  });
}

test('J-03 seeded parent lands on parent home @smoke', async ({ page }) => {
  await seedAndSignInParent(page, 'j03-parent-home');

  await expect(page).toHaveURL(/\/home(?:\?.*)?$/);
  await enterFamilyHome(page, { timeout: 60_000 });
  await expect(
    page.getByTestId(/^parent-home-check-child-/).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId(/^parent-home-weekly-report-/).first(),
  ).toBeVisible();
  await expect(
    page.getByTestId(/^parent-home-send-nudge-/).first(),
  ).toBeVisible();
  await expect(page.getByTestId('mode-switcher-study')).toBeVisible();
  await expect(page.getByTestId('tab-my-learning')).toBeHidden();
});

test('J-03 parent can switch between Family and My Learning @smoke', async ({
  page,
}) => {
  await seedAndSignInParent(page, 'j03-parent-mode-switch');

  await enterFamilyHome(page, { timeout: 60_000 });
  await expect(page.getByTestId('mode-switcher')).toBeVisible();
  await expect(page.getByTestId('mode-switcher-family')).toBeVisible();

  await switchAppMode(page, 'study');

  await expectAppMode(page, 'study', 30_000);
  await expect(page.getByTestId('parent-home-screen')).toHaveCount(0);

  await switchAppMode(page, 'family');

  await expectAppMode(page, 'family', 30_000);
});
