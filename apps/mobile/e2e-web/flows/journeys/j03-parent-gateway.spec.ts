import { expect, test, type Page } from '@playwright/test';

import { signIn } from '../../helpers/auth';
import { buildSeedEmail } from '../../helpers/runtime';
import { seedScenario } from '../../helpers/test-seed';
import { emulateNativeTopSafeArea } from '../../helpers/native-safe-area';

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

async function installLongSupporterScopes(page: Page): Promise<void> {
  await page.route('**/v1/scopes*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        shape: 'supporter',
        scopes: [
          { kind: 'supporter-hub' },
          {
            kind: 'person',
            personId: '00000000-0000-7000-a000-000000000201',
            edgeId: '00000000-0000-7000-a000-000000000301',
            displayName: 'Alexandria-Cassandra',
          },
          {
            kind: 'person',
            personId: '00000000-0000-7000-a000-000000000202',
            edgeId: '00000000-0000-7000-a000-000000000302',
            displayName: 'Maximilian-Theodore',
          },
          {
            kind: 'person',
            personId: '00000000-0000-7000-a000-000000000203',
            edgeId: '00000000-0000-7000-a000-000000000303',
            displayName: 'Christopher-Jonathan',
          },
          { kind: 'me' },
        ],
        defaultScopeIndex: 4,
      }),
    });
  });
}

async function applyScopeTextScale(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      [data-testid^="scope-chip-option-"] * {
        font-size: 32px !important;
        line-height: 52px !important;
      }
    `,
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

test('J-03 360px long supporter scopes remain operable and clear pushed content @smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await emulateNativeTopSafeArea(page, 47);
  await installLongSupporterScopes(page);
  await seedAndSignInParent(page, 'j03-long-supporter-scopes');
  await applyScopeTextScale(page);

  const scopeShell = page.getByTestId('scope-chip-shell');
  const scopeChip = page.getByTestId('scope-chip');
  const avatarShell = page.getByTestId('account-avatar-shell');
  await expect(scopeChip).toBeVisible({ timeout: 60_000 });

  const overflow = await scopeChip.evaluate((element) => ({
    clientWidth: element.clientWidth,
    overflowX: window.getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth);
  expect(overflow.overflowX).toMatch(/auto|scroll/);

  const [scopeShellBox, avatarShellBox] = await Promise.all([
    scopeShell.boundingBox(),
    avatarShell.boundingBox(),
  ]);
  expect(scopeShellBox).not.toBeNull();
  expect(avatarShellBox).not.toBeNull();
  expect(scopeShellBox!.y).toBeCloseTo(55, 0);
  expect(avatarShellBox!.y).toBeCloseTo(55, 0);
  expect(scopeShellBox!.x + scopeShellBox!.width).toBeLessThanOrEqual(
    avatarShellBox!.x - 8,
  );

  const options = page.locator('[data-testid^="scope-chip-option-"]');
  await expect(options).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const option = options.nth(index);
    await option.scrollIntoViewIfNeeded();
    const optionBox = await option.boundingBox();
    expect(optionBox).not.toBeNull();
    expect(optionBox!.width).toBeGreaterThanOrEqual(44);
    expect(optionBox!.height).toBeGreaterThanOrEqual(44);
    expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(
      avatarShellBox!.x,
    );
    await option.click();
    await expect(option).toHaveClass(/bg-primary/);
    await expect(
      page.locator('[data-testid^="scope-chip-option-"].bg-primary'),
    ).toHaveCount(1);
  }

  await page.goto('/more/account', { waitUntil: 'commit' });
  await applyScopeTextScale(page);
  const accountHeading = page.getByRole('heading', { name: 'Account' });
  const accountContent = page.getByTestId('more-account-scroll');
  await expect(accountHeading).toBeVisible({ timeout: 60_000 });
  await expect(accountContent).toBeVisible({ timeout: 60_000 });

  await expect
    .poll(
      async () => {
        const [chipBox, avatarBox, headingBox, contentBox] = await Promise.all([
          scopeShell.boundingBox(),
          avatarShell.boundingBox(),
          accountHeading.boundingBox(),
          accountContent.boundingBox(),
        ]);
        if (!chipBox || !avatarBox || !headingBox || !contentBox) return null;
        const chromeBottom = Math.max(
          chipBox.y + chipBox.height,
          avatarBox.y + avatarBox.height,
        );
        return {
          contentClearsHeader:
            contentBox.y >= headingBox.y + headingBox.height - 0.5,
          headingClearsChrome: headingBox.y >= chromeBottom - 0.5,
          tallerThanAvatar: chipBox.height > avatarBox.height,
        };
      },
      { timeout: 30_000 },
    )
    .toEqual({
      contentClearsHeader: true,
      headingClearsChrome: true,
      tallerThanAvatar: true,
    });
});
