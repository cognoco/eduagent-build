import path from 'node:path';
import { expect, test } from '@playwright/test';
import { pressableClick } from '../../helpers/pressable';
import { authStateDir } from '../../helpers/runtime';

// J-19: Subscription paywall UI
//
// Verifies that a free-tier learner can navigate to the subscription screen
// and sees the correct paywall UI. RevenueCat IAP is mobile-only — on web
// the screen renders the static tier-comparison fallback (`no-offerings`)
// instead of live RevenueCat packages. This test covers:
//   - subscription-screen renders and shows the correct free-tier plan
//   - mobile-only upgrade notice replaces the native purchase CTA on web
//   - no-offerings static fallback renders (expected on web)
//   - static-tier-free and static-tier-plus cards are present
//   - restore-purchases-button is present (required by App Store 3.1.1)
//   - byok-waitlist-section renders
//   - back-navigation returns to the more tab
//
// RevenueCat is a true external boundary (mobile SDK, no web support) —
// mocking it here is correct per CLAUDE.md "Mock only true external boundaries".

test.use({ storageState: path.join(authStateDir, 'solo-learner.json') });

test('J-19 free-tier learner sees subscription paywall with static tier comparison on web', async ({
  page,
}) => {
  // ── 1. Navigate to More tab and open Subscription via the nav row ──────────
  await page.goto('/more', { waitUntil: 'commit' });
  await expect(
    page.getByRole('button', { name: 'Profile', exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  await pressableClick(page.getByTestId('more-row-account'));
  await expect(page.getByTestId('more-account-scroll')).toBeVisible({
    timeout: 30_000,
  });

  // Tap the Subscription row
  await pressableClick(page.getByTestId('more-row-subscription'));

  // ── 2. Verify subscription screen loaded ───────────────────────────────────
  await expect(page.getByTestId('subscription-screen')).toBeVisible({
    timeout: 30_000,
  });

  // ── 3. Verify current plan shows Free tier ─────────────────────────────────
  await expect(page.getByTestId('current-plan')).toBeVisible();
  // Free tier label is "Free" per TIER_LABELS constant in subscription.tsx
  await expect(page.getByTestId('current-plan')).toContainText('Free');

  // ── 4. Verify web users see the mobile-purchase notice ────────────────────
  await expect(page.getByTestId('free-upgrade-unavailable')).toBeVisible();
  await expect(page.getByTestId('free-upgrade-unavailable')).toContainText(
    'Plans available on the mobile app',
  );
  await expect(page.getByTestId('free-upgrade-button')).toHaveCount(0);

  // ── 5. Verify no-offerings static fallback renders ─────────────────────────
  // RevenueCat packages are not available on web (mobile SDK only), so the
  // screen always renders the static tier-comparison fallback on this platform.
  await expect(page.getByTestId('no-offerings')).toBeVisible({
    timeout: 15_000,
  });

  // Fallback disclaimer copy — asserted against the actual text in subscription.tsx:1406
  await expect(page.getByTestId('no-offerings')).toContainText(
    "store purchasing isn't available on this device yet",
  );

  // ── 6. Verify static Free and Plus tier cards are visible ──────────────────
  // BUG-899: only Free and Plus are shown to non-Family/non-Pro free users.
  await expect(page.getByTestId('static-tier-free')).toBeVisible();
  await expect(page.getByTestId('static-tier-plus')).toBeVisible();
  // Family and Pro cards must NOT appear for a plain free-tier user (BUG-899)
  await expect(page.getByTestId('static-tier-family')).toHaveCount(0);
  await expect(page.getByTestId('static-tier-pro')).toHaveCount(0);

  // ── 7. Verify pricing text is present in the tier cards ───────────────────
  await expect(page.getByTestId('static-tier-free')).toContainText(
    '10 questions per day, 100 per month',
  );
  await expect(page.getByTestId('static-tier-plus')).toContainText(
    '700 questions per month',
  );

  // ── 8. Verify Restore Purchases button is present ─────────────────────────
  // Required by App Store 3.1.1. Must be visible for IAP compliance.
  await expect(page.getByTestId('restore-purchases-button')).toBeVisible();

  // ── 9. Verify BYOK waitlist section is present ────────────────────────────
  await expect(page.getByTestId('byok-waitlist-section')).toBeVisible();

  // ── 10. Back navigation returns to the More tab ───────────────────────────
  await pressableClick(page.getByRole('button', { name: 'Go back' }));
  await expect(page).toHaveURL(/\/more(?:\?.*)?$/);
});
