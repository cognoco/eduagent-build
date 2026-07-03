import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Config F (V1-on / V2-off) nav-shell smoke — WI-1307 (M4/C7).
 *
 * Proves the shell that the `fallback` EAS Update channel ships
 * (apps/mobile/eas.json build.fallback: EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true,
 * _V2=false) actually renders: the V1 tab sets (recaps for family shape,
 * library for study shape) are visible, and every V2-only tab
 * (mentor/subjects/journal) is absent. This is the cheap, local half of the
 * M4 rollback proof — the native OTA channel-promotion proof is a separate,
 * operator-authorized step (.github/workflows/mobile-fallback-ota.yml) and
 * is out of scope here.
 *
 * **Opt-in only.** Not part of the default Playwright run — invoke via
 * `--project=config-f-smoke` (see playwright.config.ts), and the web export
 * itself must be built with the Config F flags set in the environment
 * *before* `playwright test` starts (serve-exported-web.mjs reads
 * process.env at export time):
 *   EXPO_PUBLIC_ENABLE_MODE_NAV=true \
 *   EXPO_PUBLIC_ENABLE_MODE_NAV_V1=true \
 *   EXPO_PUBLIC_ENABLE_MODE_NAV_V2=false \
 *   pnpm exec playwright test -c apps/mobile/playwright.config.ts --project=config-f-smoke
 */

const authDir = path.join(process.cwd(), 'apps', 'mobile', 'e2e-web', '.auth');

test.describe('Config F: family shape (owner with children)', () => {
  test.use({ storageState: path.join(authDir, 'owner-with-children.json') });

  test('shows recaps tab, no V2 tabs @configF', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'commit' });

    await expect(page.getByTestId('tab-home')).toBeVisible();
    await expect(page.getByTestId('tab-recaps')).toBeVisible();
    await expect(page.getByTestId('tab-progress')).toBeVisible();
    await expect(page.getByTestId('tab-more')).toBeVisible();

    await expect(page.getByTestId('tab-mentor')).not.toBeVisible();
    await expect(page.getByTestId('tab-subjects')).not.toBeVisible();
    await expect(page.getByTestId('tab-journal')).not.toBeVisible();
    await expect(page.getByTestId('tab-library')).not.toBeVisible();
    await expect(page.getByTestId('tab-my-learning')).not.toBeVisible();
  });
});

test.describe('Config F: study shape (solo learner)', () => {
  test.use({ storageState: path.join(authDir, 'solo-learner.json') });

  test('shows library tab, no V2 tabs @configF', async ({ page }) => {
    await page.goto('/home', { waitUntil: 'commit' });

    await expect(page.getByTestId('tab-home')).toBeVisible();
    await expect(page.getByTestId('tab-library')).toBeVisible();
    await expect(page.getByTestId('tab-progress')).toBeVisible();
    await expect(page.getByTestId('tab-more')).toBeVisible();

    await expect(page.getByTestId('tab-mentor')).not.toBeVisible();
    await expect(page.getByTestId('tab-subjects')).not.toBeVisible();
    await expect(page.getByTestId('tab-journal')).not.toBeVisible();
    await expect(page.getByTestId('tab-recaps')).not.toBeVisible();
  });
});
