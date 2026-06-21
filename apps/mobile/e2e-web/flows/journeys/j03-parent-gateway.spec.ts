import { expect, test, type Page } from '@playwright/test';

import { signIn } from '../../helpers/auth';
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
    landingPath: '/mentor',
    landingTestId: 'mentor-screen',
  });
}

test('J-03 seeded parent lands on the V2 mentor shell @smoke', async ({
  page,
}) => {
  await seedAndSignInParent(page, 'j03-parent-mentor-shell');

  await expect(page).toHaveURL(/\/mentor(?:\?.*)?$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('account-avatar-shell')).toBeVisible();
  await expect(page.getByTestId('tab-mentor')).toBeVisible();
  await expect(page.getByTestId('tab-subjects')).toBeVisible();
  await expect(page.getByTestId('tab-journal')).toBeVisible();
});

test('J-03 parent V2 shell does not render the retired mode switcher @smoke', async ({
  page,
}) => {
  await seedAndSignInParent(page, 'j03-parent-no-mode-switcher');

  await expect(page.getByTestId('mentor-screen')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId('mode-switcher')).toHaveCount(0);
  await expect(page.getByTestId('parent-home-screen')).toHaveCount(0);
});
