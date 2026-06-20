/**
 * ACCOUNT-19 / ACCOUNT-20 / ACCOUNT-26: Consent and onboarding seed states
 *
 * These inventory rows were blocked because the consent/onboarding states
 * were not reliably reachable without traversing the full sign-up funnel
 * (which burns Clerk email quota).
 *
 * APPROACH: Use pre-seeded scenarios that put the account directly into the
 * target consent state.  Each test calls seedAndSignIn() with the relevant
 * scenario, so there is no dependency on email delivery or quota.
 *
 *   ACCOUNT-19: consent-pending (child signed up, awaiting parent approval)
 *               → Covered by j13-consent-pending-parent-approval.spec.ts.
 *               This file adds an additional assertion: the gate renders the
 *               check-again button and a sign-out escape hatch.
 *
 *   ACCOUNT-20: consent-withdrawn (parent withdrew consent; child is blocked
 *               during the 7-day deletion grace period)
 *               → Uses 'consent-withdrawn' scenario (child profile sign-in).
 *
 *   ACCOUNT-26: pre-profile onboarding (account exists, NO profile yet —
 *               the create-profile gate renders)
 *               → Uses 'pre-profile' scenario.
 *               Covered at high level by j12-pre-profile-create-profile.spec.ts.
 *               This file adds assertions for the gate testID and CTA.
 *
 * ALSO COVERED:
 *   ACCOUNT-20 solo variant: consent-withdrawn-solo (learner is the account
 *   owner, no parent to switch to).  Ensures the gate copy differs.
 *
 *   ACCOUNT-32: consent-gate "while you wait" previews. The waiting gate
 *               (PARENTAL_CONSENT_REQUESTED) exposes "Browse Subjects" and
 *               "Sample Coaching" launchers. Each preview screen fully replaces
 *               the gate (early return in ConsentPendingGate), and "Back"
 *               returns to the gate. Static showcases, no API.
 *               → Uses the 'consent-pending' scenario (same waiting gate j13
 *                 drives) and exercises the real preview components.
 */

import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

// ---------------------------------------------------------------------------
// ACCOUNT-19: consent-pending gate
// ---------------------------------------------------------------------------

test.describe('[ACCOUNT-19] consent-pending gate', () => {
  test('consent-pending gate renders check-again and sign-out escape hatch', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'consent-pending',
      alias: 'a19',
      landingTestId: 'consent-pending-gate',
      landingPath: '/home',
    });

    // The consent gate blocks app access.
    await expect(page.getByTestId('consent-pending-gate')).toBeVisible({
      timeout: 60_000,
    });

    // User can re-check consent (e.g., parent approved from a different device).
    await expect(page.getByTestId('consent-check-again')).toBeVisible();
    await expect(page.getByTestId('consent-check-again')).toBeEnabled();

    // Sign-out escape hatch must be present so user is never fully stuck.
    await expect(page.getByTestId('consent-sign-out')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ACCOUNT-20: consent-withdrawn gate
// ---------------------------------------------------------------------------

test.describe('[ACCOUNT-20] consent-withdrawn gate', () => {
  test('withdrawn consent blocks child and shows refresh + sign-out actions', async ({
    page,
  }) => {
    // The consent-withdrawn scenario signs in as the CHILD profile
    // (profileId = childProfileId per seedConsentWithdrawn).
    await seedAndSignIn(page, {
      scenario: 'consent-withdrawn',
      alias: 'a20',
      landingTestId: 'consent-withdrawn-gate',
      landingPath: '/home',
    });

    // The withdrawn consent gate must be visible — not the normal app shell.
    await expect(page.getByTestId('consent-withdrawn-gate')).toBeVisible({
      timeout: 60_000,
    });

    // Refresh status button (BUG-114: re-check if parent restored consent).
    await expect(page.getByTestId('withdrawn-refresh-status')).toBeVisible();
    await expect(page.getByTestId('withdrawn-refresh-status')).toBeEnabled();

    // Sign-out button (user is never fully stuck).
    await expect(page.getByTestId('withdrawn-sign-out')).toBeVisible();
  });

  test('consent-withdrawn-solo shows withdrawn gate with no profile-switch CTA', async ({
    page,
  }) => {
    // Solo-learner (account owner) with withdrawn consent.
    // There is no parent profile on this account to switch to.
    await seedAndSignIn(page, {
      scenario: 'consent-withdrawn-solo',
      alias: 'a20-solo',
      landingTestId: 'consent-withdrawn-gate',
      landingPath: '/home',
    });

    await expect(page.getByTestId('consent-withdrawn-gate')).toBeVisible({
      timeout: 60_000,
    });

    // There is no parent profile on this account — the switch-profile
    // button must NOT appear (canSwitchFromConsentGate returns false).
    await expect(
      page.getByTestId('withdrawn-switch-profile'),
    ).not.toBeVisible();

    // Sign-out is the only escape.
    await expect(page.getByTestId('withdrawn-sign-out')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// ACCOUNT-26: pre-profile onboarding gate
// ---------------------------------------------------------------------------

test.describe('[ACCOUNT-26] pre-profile onboarding gate', () => {
  test('pre-profile gate blocks tabs and shows create-profile CTA', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'pre-profile',
      alias: 'a26',
      // The pre-profile gate uses create-profile-gate testID, not learner-screen.
      // auth.ts waitForSignedInReady will not find learner-screen, but the app
      // shell with tabs is still visible — signIn succeeds when the gate renders.
      landingTestId: 'create-profile-gate',
      landingPath: '/home',
    });

    // Create-profile gate is visible.
    await expect(page.getByTestId('create-profile-gate')).toBeVisible({
      timeout: 60_000,
    });

    // CTA to start profile creation.
    await expect(page.getByTestId('create-profile-cta')).toBeVisible();
    await expect(page.getByTestId('create-profile-cta')).toBeEnabled();

    // Clicking the CTA navigates to the create-profile screen.
    await page.getByTestId('create-profile-cta').click();
    await expect(page.getByTestId('create-profile-name')).toBeVisible({
      timeout: 30_000,
    });
  });
});

// ---------------------------------------------------------------------------
// ACCOUNT-32: consent-gate "while you wait" previews
// ---------------------------------------------------------------------------

test.describe('[ACCOUNT-32] consent-gate while-you-wait previews', () => {
  test('Browse Subjects preview replaces the gate and Back returns to it', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'consent-pending',
      alias: 'a32-subj',
      landingTestId: 'consent-pending-gate',
      landingPath: '/home',
    });

    // The waiting gate exposes the preview launchers (REQUESTED branch).
    await expect(page.getByTestId('consent-pending-gate')).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('preview-browse-subjects')).toBeVisible();

    // Launching the subject preview fully replaces the gate.
    await pressableClick(page.getByTestId('preview-browse-subjects'));
    await expect(page.getByTestId('preview-subject-browser')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('consent-pending-gate')).not.toBeVisible();

    // Back returns to the consent gate.
    await pressableClick(page.getByRole('button', { name: 'Back' }).first());
    await expect(page.getByTestId('consent-pending-gate')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('preview-subject-browser')).not.toBeVisible();
  });

  test('Sample Coaching preview replaces the gate and Back returns to it', async ({
    page,
  }) => {
    await seedAndSignIn(page, {
      scenario: 'consent-pending',
      alias: 'a32-coach',
      landingTestId: 'consent-pending-gate',
      landingPath: '/home',
    });

    await expect(page.getByTestId('consent-pending-gate')).toBeVisible({
      timeout: 60_000,
    });
    // The coaching launcher shares its testID with the preview container, so
    // discriminate states by gate-only / preview-only affordances instead.
    await expect(page.getByTestId('preview-sample-coaching')).toBeVisible();

    await pressableClick(page.getByTestId('preview-sample-coaching'));

    // On the preview screen the gate's check-again action is gone and a Back
    // button is present — the preview has fully replaced the gate.
    const back = page.getByRole('button', { name: 'Back' });
    await expect(back).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('consent-check-again')).not.toBeVisible();

    await pressableClick(back.first());
    await expect(page.getByTestId('consent-pending-gate')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('consent-check-again')).toBeVisible();
  });
});
