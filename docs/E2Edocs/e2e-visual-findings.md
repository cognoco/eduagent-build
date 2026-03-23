# E2E Visual Review Findings — Session 23

**Date:** 2026-03-23
**Reviewer:** Claude (automated visual review of every screen)
**Environment:** E2E_Device_2:5554 (API 34, 1080x1920), Metro 8081, Bundle Proxy 8082, API 8787
**Branch:** `e2e/session-21-fixes`
**Method:** Each flow run with `takeScreenshot` captures + ADB screencap of final state. Every screenshot reviewed for: text readability, layout integrity, keyboard avoidance, theme consistency, missing elements, wrong input targets, tap target size.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| BLOCKING | 0 | Issues that make the screen unusable |
| MAJOR | 3 | Significant UX issues (text invisible, wrong fields, missing buttons) |
| MINOR | 2 | Cosmetic issues that don't block functionality |
| INFO | 1 | Observations worth documenting |

---

## Group 0: Pre-Auth Flows

### Flow 1: `app-launch-devclient.yaml` — PASS (functional) / CLEAN (visual)

**Screenshots reviewed:** `app-launch-devclient.png`, ADB final state
**Screens seen:** Sign-in

| Check | Result |
|-------|--------|
| Text readability | All text readable — white headings, gray subtitles, purple accents on dark |
| Input fields | Email + password inputs visible with proper borders and placeholders |
| Buttons | SSO buttons (Google, Apple) visible. "Sign in" correctly disabled (gray) when empty |
| Layout | No overlap, no clipping, proper spacing |
| Theme | Dark mode consistent, purple accent throughout |
| Safe area | Content clear of status bar |

**Issues:** None

---

### Flow 2: `auth/sign-in-navigation-devclient.yaml` — PASS / MINOR issues

**Screenshots reviewed:** `auth-nav-sign-in.png`, `auth-nav-sign-up.png`, `auth-nav-forgot-password.png`, `auth-nav-back-to-sign-in.png`
**Screens seen:** Sign-in, Sign-up, Forgot Password, Sign-in (return)

| # | Screen | Finding | Severity |
|---|--------|---------|----------|
| V-001 | Sign-up | Bottom text "Already have an account?..." partially cut off at screen edge (before scroll) | MINOR |
| V-002 | Forgot Password | Form content pushed to bottom ~40% of screen — excessive empty space above heading. Content uses `justifyContent: 'center'` but with only 3 elements, result is bottom-heavy. | MINOR |

**All other checks pass:** Text readable, navigation round-trip works, all links and buttons properly colored.

---

### Flow 3: `auth/sign-in-validation-devclient.yaml` — PASS / CLEAN

**Screenshots reviewed:** `sign-in-empty-submit.png`, `sign-in-password-entered.png`
**Screens seen:** Sign-in (empty submit), Sign-in (credentials filled)

**Key positive finding:** "Sign in" button correctly transitions from gray/disabled (empty fields) to purple/active (both fields filled). Good UX confirmation.

| Check | Result |
|-------|--------|
| Empty submit | No error shown — button is disabled, tap silently ignored. Expected. |
| Password masking | Dots displayed correctly for entered password |
| Button state | Disabled → active transition works correctly |
| "Show" toggle | Purple, visible, accessible |

**Issues:** None

---

### Flow 4: `auth/sign-up-screen-devclient.yaml` — PASS / CLEAN

**Screenshots reviewed:** `sign-up-screen-full.png`, `sign-up-password-short.png`
**Screens seen:** Sign-up (full after scroll), Sign-up (short password)

| Check | Result |
|-------|--------|
| Full screen | All elements visible after scroll: SSO, inputs, legal links, sign-in link |
| Password validation | "At least 8 characters" hint stays visible with short password |
| Button state | "Sign up" stays gray/disabled with insufficient password |
| Legal links | "Terms of Service" and "Privacy Policy" in purple, readable |

**Issues:** None

---

### Flow 5: `auth/forgot-password-devclient.yaml` — PASS / CLEAN

**Screenshots reviewed:** `forgot-password-screen.png`, `forgot-password-email-entered.png`, `forgot-password-after-submit.png`
**Screens seen:** Forgot password (empty), With keyboard, After submit

| Check | Result |
|-------|--------|
| Keyboard avoidance | Form correctly pushed up when keyboard opens — email field stays visible |
| Error display | "Couldn't find your account." in RED — clearly visible |
| Button state | "Send reset code" transitions to purple/active after email entry |
| Navigation | "Back to sign in" returns correctly |

**Issues:** None. Note: V-002 (bottom-heavy layout) applies to empty state here too.

---

## Visual Issue Registry

### V-001: Sign-up bottom text clipped (MINOR)
- **Screen:** Sign-up (before scroll)
- **What:** "Already have an account? Sign in" text is partially cut off at the bottom screen edge
- **Impact:** Low — visible after scroll. Users on smaller screens may not notice the sign-in link initially.
- **Fix:** Add bottom padding or ensure the link is above the safe area

### V-002: Forgot password screen bottom-heavy (MINOR)
- **Screen:** Forgot password (empty state)
- **What:** Only 3 elements (heading, email input, button) positioned in bottom ~40% of screen. Top 60% is empty dark space.
- **Impact:** Low — cosmetic. Form is usable.
- **Fix:** Consider `justifyContent: 'flex-start'` with top padding, or add an illustration/icon to the empty area

### V-004: Subscription screen perpetual loading spinner (MAJOR)
- **Screen:** Subscription (navigated from More tab)
- **Flow:** `account/more-tab-navigation.yaml` (step: nav-subscription screenshot)
- **What:** Subscription screen shows only the heading "Subscription" + "Back" button + a teal loading spinner centered on screen. No subscription content (plan name, trial status, usage, restore purchases, BYOK section) ever loads. The screen is functionally blank.
- **Why Maestro passed:** The flow asserts `id: subscription-screen` which is the screen container — present even when content fails to load.
- **Impact:** HIGH — a user navigating to Subscription sees an empty screen with an infinite spinner. No error message, no fallback state.
- **Likely cause:** The `onboarding-complete` seed scenario may not create subscription/trial data, causing the subscription query to hang or return empty without a proper empty state. Alternatively, RevenueCat SDK initialization fails in the emulator (no Play Store → no StoreKit).
- **Recommendation:** (1) Add an empty/error state to the subscription screen ("No active subscription" fallback). (2) Verify with `trial-active` seed to determine if this is data-dependent.

### V-003: Status bar text artifacts (INFO)
- **Screen:** Multiple auth screens
- **What:** Time text in status bar appears slightly garbled/blurred (e.g., "8:0..." with artifacts)
- **Impact:** None — emulator rendering artifact, not app issue
- **Fix:** N/A (emulator-specific)

---

---

## Group 1: Account Flows

### Flow 9: `account/more-tab-navigation.yaml` — PASS / V-004 MAJOR

**Screenshots reviewed:** `signin-01-04` (sign-in sequence), `more-tab-loaded`, `nav-profile`, `nav-subscription`, `nav-privacy-policy`, `nav-terms-of-service`, `nav-export-data`, `nav-delete-account`, `nav-signed-out` (10 total)
**Screens seen:** Sign-in, Home, More tab, Profiles, Subscription, Privacy Policy, Terms of Service, Delete Account, Sign-in (after sign-out)

| Screen | Visual Status |
|--------|-------------|
| Home | CLEAN — coaching card, retention, subjects, tab bar icons all render |
| More tab | CLEAN — themes, accent colors, notifications, learning mode |
| Profiles | CLEAN — avatar, name, role, checkmark, add button |
| Subscription | **V-004 MAJOR** — loading spinner only, no content |
| Privacy Policy | CLEAN — full legal text, proper formatting |
| Terms of Service | CLEAN — full legal text, proper formatting |
| Delete Account | CLEAN — red destructive button, clear warning, Cancel option |
| Sign-out | CLEAN — returns to sign-in |

**Note:** 2 WARNs on Privacy Policy ("Who We Are") and Terms ("Acceptance of Terms") — flow text assertions lack the "1." section number prefix from the actual UI. Not app issues.

### Flow 10: `account/settings-toggles.yaml` — PASS / V-005, V-006 MAJOR

**Screenshots reviewed:** 15 total (sign-in sequence + 11 settings screenshots)
**Screens seen:** Sign-in, Home, More tab (multiple theme states), Parent dashboard redirect, Home (return)

| # | Screen | Finding | Severity |
|---|--------|---------|----------|
| V-005 | Parent dashboard (after theme switch) | Two large EMPTY gray cards — no child names, no data, no content. Parent dashboard shows "How your children are doing" + two blank card placeholders. `onboarding-complete` seed has no children, but empty cards with no content/message is poor UX. | MAJOR |
| V-006 | Parent dashboard tab bar | 4th tab "child/[profileI..." leaks in tab bar with broken icon (box with X). BUG-59 regression — `tabBarItemStyle: { display: 'none' }` not working for `child/[profileId]` route in parent layout. | MAJOR |

**Positive findings:** Theme switching works perfectly. Accent color palette changes per persona (Indigo/Teal/Rose → Violet/Electric Blue/Hot Pink). Notification toggles visible and functional.

### Flow 11: `account/account-lifecycle.yaml` — PASS / CLEAN (5 WARNs)

Profile/Account sections below fold — flow uses optional assertions without scrolling. More tab renders correctly. No visual issues.

### Flow 12: `account/delete-account.yaml` — FAIL (flow issue)

**Failure:** `sign-out-button` not visible after cancel — needs `scrollUntilVisible`. NOT an app bug.
**Visual:** Delete account dialog renders perfectly (red destructive button, warning text, 7-day grace period, Cancel). More tab ACCOUNT section shows "Subscription: Free" inline.

### Flow 13: `account/profile-switching.yaml` — PASS / CLEAN

**Screenshots reviewed:** `profile-switcher-open`, `profile-switching-complete`
**Visual:** Profiles screen shows both Parent (active, checkmark) and Teen profiles cleanly. After switch to Teen: PostApprovalLanding renders with party emoji + "Let's Go" button. Expected behavior.

---

*This document is updated as each flow group completes. Flows are run sequentially with visual review of every screenshot.*
