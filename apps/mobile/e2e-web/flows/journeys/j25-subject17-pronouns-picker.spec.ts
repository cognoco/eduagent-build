/**
 * SUBJECT-17: Pronouns picker — presets + free-text Other path.
 *
 * The pronouns screen at /(app)/onboarding/pronouns is a profile-wide,
 * optional step with three presets (she/her, he/him, they/them) and a
 * "Something else" (Other) path that reveals a free-text input.
 *
 * Age gate: learners below PRONOUNS_PROMPT_MIN_AGE (13) are silently
 * forwarded; this test uses the `onboarding-complete` scenario whose
 * LEARNER_BIRTH_YEAR = currentYear - 17, well above the gate.
 *
 * Reach: The screen is reachable via direct URL navigation after sign-in
 * (identical to how j22 uses page.goto() to reach deep routes in the app).
 * The `returnTo` query-param is omitted (onboarding context) so the step
 * indicator renders and Skip is available.
 *
 * COVERAGE:
 *   - Screen renders the three preset options (testID: pronouns-option-she-her,
 *     pronouns-option-he-him, pronouns-option-they-them)
 *   - "Other" card is visible (testID: pronouns-option-other)
 *   - Selecting "Other" reveals the free-text input (testID: pronouns-custom-input)
 *   - Typing into the custom input and pressing Continue is enabled
 *   - Skip button is visible and enabled (testID: pronouns-skip)
 *   - Continue button is disabled when Other is selected but custom text is empty
 *   - Continue button is enabled when a preset is selected
 *
 * SEED: onboarding-complete (17-year-old, above age gate, CONSENTED).
 * No new seed scenario needed.
 */

import { expect, test } from '@playwright/test';
import { fillTextInput } from '../../helpers/text-input';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

// ---------------------------------------------------------------------------
// SUBJECT-17: Pronouns picker
// ---------------------------------------------------------------------------

test.describe('[SUBJECT-17] Pronouns picker', () => {
  test('Pronouns screen renders all preset options and the Other card', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's17-presets',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    // Navigate directly to the pronouns screen (onboarding context, no returnTo)
    await page.goto('/onboarding/pronouns', { waitUntil: 'commit' });

    // Screen header + presets must all be visible
    await expect(page.getByTestId('pronouns-option-she-her')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('pronouns-option-he-him')).toBeVisible();
    await expect(page.getByTestId('pronouns-option-they-them')).toBeVisible();

    // "Other" / "Something else" card
    await expect(page.getByTestId('pronouns-option-other')).toBeVisible();

    // Skip and Continue buttons
    await expect(page.getByTestId('pronouns-skip')).toBeVisible();
    await expect(page.getByTestId('pronouns-continue')).toBeVisible();
  });

  test('Selecting a preset enables the Continue button', async ({ page }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's17-preset-continue',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    await page.goto('/onboarding/pronouns', { waitUntil: 'commit' });

    await expect(page.getByTestId('pronouns-option-she-her')).toBeVisible({
      timeout: 30_000,
    });

    // By default, no preset is selected — Continue is still enabled because
    // `canContinue` is true when choice is null (user may skip with no selection).
    // Tap a preset to select it explicitly.
    await pressableClick(page.getByTestId('pronouns-option-she-her'));

    // Continue should be enabled (a preset is selected, choice !== OTHER_KEY)
    await expect(page.getByTestId('pronouns-continue')).toBeEnabled();

    // Tap a second preset (he/him) to verify switching works
    await pressableClick(page.getByTestId('pronouns-option-he-him'));
    await expect(page.getByTestId('pronouns-continue')).toBeEnabled();

    // Tap they/them
    await pressableClick(page.getByTestId('pronouns-option-they-them'));
    await expect(page.getByTestId('pronouns-continue')).toBeEnabled();
  });

  test('Selecting Other reveals free-text input and disables Continue until text entered', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's17-other',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    await page.goto('/onboarding/pronouns', { waitUntil: 'commit' });

    await expect(page.getByTestId('pronouns-option-other')).toBeVisible({
      timeout: 30_000,
    });

    // Tap "Other" / "Something else" card
    await pressableClick(page.getByTestId('pronouns-option-other'));

    // Free-text input must appear
    await expect(page.getByTestId('pronouns-custom-input')).toBeVisible({
      timeout: 10_000,
    });

    // Continue is disabled while the custom input is empty (canContinue = false).
    // Use not.toBeEnabled() — RNW Pressable renders disabled via aria-disabled,
    // which Playwright's toBeDisabled() may not detect on non-form elements.
    await expect(page.getByTestId('pronouns-continue')).not.toBeEnabled();

    // Type a custom value
    await fillTextInput(page.getByTestId('pronouns-custom-input'), 'ze/zir');

    // Continue is now enabled
    await expect(page.getByTestId('pronouns-continue')).toBeEnabled();
  });

  test('Skip button is present and navigates away from the pronouns screen', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'onboarding-complete',
      alias: 's17-skip',
      landingTestId: 'learner-screen',
      landingPath: '/home',
    });

    await expect(page.getByTestId('learner-screen')).toBeVisible({
      timeout: 60_000,
    });

    await page.goto('/onboarding/pronouns', { waitUntil: 'commit' });

    await expect(page.getByTestId('pronouns-skip')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('pronouns-skip')).toBeEnabled();

    // Tapping Skip navigates away (pronouns is optional and never blocks progress)
    await pressableClick(page.getByTestId('pronouns-skip'));

    // After skip, the pronouns screen is no longer at focus.
    // The skip mutation writes null and calls navigateForward().
    // Without subjectId, navigateForward() goes to /(app)/home.
    await expect(page.getByTestId('pronouns-skip')).not.toBeVisible({
      timeout: 15_000,
    });
  });
});
