/**
 * SUBJECT-16: Conversation-language picker (profile-wide).
 *
 * Background: The standalone onboarding/language-picker screen was removed
 * (2026-05-06, plan: mentor-language-from-ui). The profile's
 * `conversationLanguage` is now auto-synced from the active app UI language
 * via `useMentorLanguageSync` in (app)/_layout. The user-visible control is
 * the "App Language" bottom-sheet picker in More → Account
 * (testID: settings-app-language; requires FEATURE_FLAGS.I18N_ENABLED = true,
 * which is true in all environments).
 *
 * COVERAGE:
 *   - Picker row is visible in More → Account
 *   - Bottom sheet opens on tap (backdrop + close button visible)
 *   - Each supported language option has a deterministic testID
 *     (language-option-<code>) and is visible/enabled
 *   - Selecting a language closes the sheet
 *   - "Other" text-input path: N/A for app-language (only preset ISO codes)
 *
 * SEED: onboarding-complete (adult learner, CONSENTED, one subject so home
 * stays stable). No new seed scenario needed.
 */

import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test.describe('[SUBJECT-16] Conversation-language picker (app language → auto-sync)', () => {
  test('More → Account → App Language picker opens and shows language options', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's16-lang',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    // Navigate directly to More → Account (avoids tab role locator fragility)
    await page.goto('/more/account', { waitUntil: 'commit' });
    await expect(page.getByTestId('more-account-scroll')).toBeVisible({
      timeout: 30_000,
    });

    // App Language row must be visible (I18N_ENABLED = true)
    const appLanguageRow = page.getByTestId('settings-app-language');
    await expect(appLanguageRow).toBeVisible();

    // Tap to open picker bottom sheet
    await pressableClick(appLanguageRow);

    // Backdrop should appear confirming the modal opened
    await expect(page.getByTestId('app-language-backdrop')).toBeVisible({
      timeout: 15_000,
    });

    // Close button must be present
    await expect(page.getByTestId('app-language-close')).toBeVisible();
  });

  test('Language preset options are visible and selectable (en preset + de preset)', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's16-presets',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    // Navigate directly to More → Account
    await page.goto('/more/account', { waitUntil: 'commit' });
    await expect(page.getByTestId('more-account-scroll')).toBeVisible({
      timeout: 30_000,
    });

    // Open language picker
    await pressableClick(page.getByTestId('settings-app-language'));
    await expect(page.getByTestId('app-language-backdrop')).toBeVisible({
      timeout: 15_000,
    });

    // English option must be visible and enabled (the minimum supported locale)
    const englishOption = page.getByTestId('language-option-en');
    await expect(englishOption).toBeVisible();
    await expect(englishOption).toBeEnabled();

    // German option (de) — a second language preset coverage
    const germanOption = page.getByTestId('language-option-de');
    await expect(germanOption).toBeVisible();
    await expect(germanOption).toBeEnabled();

    // Tap German — sheet should close after selection
    await pressableClick(germanOption);

    // Bottom sheet closes on selection
    await expect(page.getByTestId('app-language-backdrop')).not.toBeVisible({
      timeout: 15_000,
    });
  });

  test('Closing picker via backdrop close button dismisses the sheet', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's16-close',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    // Navigate directly to More → Account
    await page.goto('/more/account', { waitUntil: 'commit' });
    await expect(page.getByTestId('more-account-scroll')).toBeVisible({
      timeout: 30_000,
    });

    // Open picker
    await pressableClick(page.getByTestId('settings-app-language'));
    await expect(page.getByTestId('app-language-backdrop')).toBeVisible({
      timeout: 15_000,
    });

    // Dismiss via the close icon button
    await pressableClick(page.getByTestId('app-language-close'));

    // Sheet must close
    await expect(page.getByTestId('app-language-backdrop')).not.toBeVisible({
      timeout: 15_000,
    });

    // Account screen remains visible — no dead end
    await expect(page.getByTestId('more-account-scroll')).toBeVisible();
  });
});
