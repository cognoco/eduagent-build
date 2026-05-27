import { expect, type Locator, type Page } from '@playwright/test';
import { switchAppMode } from './mode-switcher';
import { pressableClick } from './pressable';

interface EnterFamilyHomeOptions {
  timeout?: number;
}

export async function enterFamilyHome(
  page: Page,
  options: EnterFamilyHomeOptions = {},
): Promise<Locator> {
  const timeout = options.timeout ?? 60_000;
  const familyHome = page.getByTestId('parent-home-screen');
  const learnerHome = page.getByTestId('learner-screen');
  const familyToggle = page.getByTestId('mode-switcher-family');
  const familyRouteBlocked = page.getByTestId('family-route-blocked');
  const familyRouteSwitchCta = page.getByTestId('family-route-switch-cta');
  const childProfileUnavailable = page.getByTestId('child-profile-unavailable');
  const childProfileBack = page.getByTestId('child-profile-back');
  const modeSwitchError = page.getByTestId('mode-switcher-error');
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await familyHome.isVisible().catch(() => false)) {
      return familyHome;
    }

    if (await familyRouteBlocked.isVisible().catch(() => false)) {
      if (await familyRouteSwitchCta.isVisible().catch(() => false)) {
        await pressableClick(familyRouteSwitchCta);
        await page.waitForTimeout(500);
        continue;
      }
    }

    if (await childProfileUnavailable.isVisible().catch(() => false)) {
      if (await childProfileBack.isVisible().catch(() => false)) {
        await pressableClick(childProfileBack);
        await page.waitForTimeout(500);
        continue;
      }
    }

    if (
      (await learnerHome.isVisible().catch(() => false)) ||
      (await modeSwitchError.isVisible().catch(() => false))
    ) {
      await expect(familyToggle).toBeVisible({
        timeout: Math.max(deadline - Date.now(), 1_000),
      });
      await switchAppMode(
        page,
        'family',
        Math.max(deadline - Date.now(), 1_000),
      );
      continue;
    }

    await page.waitForTimeout(250);
  }

  await expect(familyHome).toBeVisible({ timeout: 1_000 });
  return familyHome;
}

interface PressFamilyHomeActionOptions extends EnterFamilyHomeOptions {
  attempts?: number;
}

export async function pressFamilyHomeAction(
  page: Page,
  action: Locator,
  options: PressFamilyHomeActionOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? 30_000;
  const attempts = options.attempts ?? 3;
  const deadline = Date.now() + timeout;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await enterFamilyHome(page, {
      timeout: Math.max(deadline - Date.now(), 1_000),
    });

    if (!(await action.isVisible().catch(() => false))) {
      await page.waitForTimeout(250);
      continue;
    }

    try {
      await pressableClick(action);
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
    }

    await page.waitForTimeout(250);
  }

  await expect(action).toBeVisible({
    timeout: Math.max(deadline - Date.now(), 1_000),
  });
  await pressableClick(action);
}
