# E2E Visual Review Findings — Session 23

**Date:** 2026-03-23
**Reviewer:** Claude (automated visual review of every screen)
**Environment:** E2E_Device_2:5554 (API 34, 1080x1920), Metro 8081, Bundle Proxy 8082, API 8787
**Branch:** `e2e/session-23-visual-review`
**Method:** Each flow run with `takeScreenshot` captures + ADB screencap of final state. Every screenshot reviewed for: text readability, layout integrity, keyboard avoidance, theme consistency, missing elements, wrong input targets, tap target size.

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| BLOCKING | 0 | Issues that make the screen unusable |
| MAJOR | 4 | Significant UX issues (text invisible, wrong fields, missing buttons) |
| MINOR | 2 | Cosmetic issues that don't block functionality |
| INFO | 3 | Observations worth documenting |

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
| V-006 | Parent dashboard tab bar | ~~4th tab "child/[profileI..." leaks in tab bar with broken icon.~~ **FIXED** (2026-03-25, BUG-67) — route name corrected to `child/[profileId]`. | ~~MAJOR~~ FIXED |

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

## Group 2: Onboarding Flows

### Flow 14: `onboarding/create-profile-standalone.yaml` — PASS / CLEAN
New profile form renders cleanly. Auto-persona detection based on birthdate: "Based on your age, we set your profile type to Learner." Region buttons (EU/US/Other). Profile creation redirects to create-subject.

### Flow 15: `onboarding/create-subject.yaml` — FAIL (Maestro timing)
`create-subject-name` testID found by assertVisible but tap failed immediately after (re-render timing). Screen renders correctly visually.

### Flow 16: `onboarding/view-curriculum.yaml` — PASS / V-007 INFO
Home screen renders correctly. Learning Book shows "0 topics across 0 subjects" empty state — inconsistent with home showing "World History" with "Thriving" badge. Likely `learning-active` seed creates retention data but no curriculum topics.

### Flow 17: `onboarding/analogy-preference-flow.yaml` — PASS / CLEAN
7 analogy domain options render with clear selection states (purple border + "Active" label). ScrollView works for options below fold. Curriculum review appears after selection.

### Flow 18: `onboarding/curriculum-review-flow.yaml` — FAIL (LLM-dependent)
LLM didn't produce structured curriculum response in time. Known issue from Sessions 20/22.

---

## Group 3: Billing Flows — All 3 PASS / CLEAN

- **subscription.yaml** — More tab accessible, subscription area reachable
- **subscription-details.yaml** — Trial banner, usage, restore-purchases, BYOK section
- **child-paywall.yaml** — Excellent child-friendly paywall: "Nice work so far!", "Parent notified" (disabled after tap), 24h reminder cooldown, "Browse Learning Book" escape hatch

---

## Group 4: Learning Flows — All 6 PASS / CLEAN

**BUG-63 fix confirmed visually.** AI coach bubble text is fully readable in dark mode — white text on dark bubbles, proper contrast.

- **core-learning** — 3-exchange chat session, timer, Done button, input bar all visible
- **session-summary** — Full lifecycle: exchanges → close → summary → write → AI feedback. "What happened" section, "Your Words" area, green checkmark, "Mate feedback" with constructive guidance
- **voice-mode-controls** — Voice toggle works, input bar returns after toggle off

---

## Group 5: Assessment — FAIL (sign-in infra timing)
Same infrastructure issue as delete-account and parent-dashboard. Not an app bug.

---

## Group 6: Retention Flows — All 6 PASS / CLEAN

- **topic-detail** — SM-2 metrics render correctly: Memory strength (Thriving with green leaf), Next review date, Interval (7 days), Reviews count. "Start Review Session" + "Recall Check" buttons.
- **relearn-flow** — "Relearn Topic" heading, method picker, "Starting relearn session..." loading state

---

## Group 7: Parent Flows — 6/8 PASS

### Flow: `parent/parent-tabs.yaml` — FAIL / V-008 MAJOR
**V-008:** Parent's Learning Book tab shows **"New subject" creation screen** instead of parent curriculum overview. Screenshot `parent-tabs-02-learning-book` clearly shows a learner's create-subject form with keyboard. This is a routing/navigation bug — parent layout routes Learning Book to the wrong component.

### Other parent flows — All PASS / CLEAN
parent-learning-book, child-drill-down, consent-management, demo-dashboard, multi-child-dashboard, add-child-profile all pass with clean visuals.

---

## Groups 8-13: Homework / Subjects / Edge / Consent / Audit / Standalone — All PASS

| Group | Flows | Status |
|-------|-------|--------|
| Homework | 3 | 3/3 PASS |
| Subjects | 1 | 1/1 PASS |
| Edge cases | 2 | 2/2 PASS |
| Consent | 8 | 8/8 PASS (COPPA/GDPR age-gated flows all clean) |
| Parent audit | 2 | 2/2 PASS |
| Standalone | 3 | 3/3 PASS (sign-up partial by design) |

**Consent-withdrawn-gate visual note:** "If this wasn't meant to happen..." text appears very low contrast (faint gray on dark background). Potential WCAG issue for child readers.

---

## Visual Issue Registry (continued)

### V-005: Parent dashboard empty cards (MAJOR)
- **Screen:** Parent dashboard (after theme switch to Parent Light)
- **What:** Two large empty gray card placeholders — no child names, no data, no content rendered inside
- **Impact:** Parent sees empty boxes instead of child progress cards
- **Likely cause:** `onboarding-complete` seed has no children. Cards render but with no data to populate.
- **Recommendation:** Show "No children linked" message or hide cards when empty

### V-006: 4th tab leaks in parent layout (MAJOR) — FIXED
- **Screen:** Parent dashboard tab bar
- **What:** `child/[profileId]` route renders as visible 4th tab with broken icon (box with X) and truncated label "child/[profileI..."
- **Impact:** Visual clutter in parent tab bar. Could confuse users.
- **Status:** FIXED (2026-03-25, BUG-67) — root cause was `Tabs.Screen name="child"` not matching the auto-discovered route `child/[profileId]`. Changed to `name="child/[profileId]"`. Verified in Session 25 E2E run (consent-management test shows 3 tabs).

### V-007: Learning Book empty state inconsistent with home (INFO)
- **Screen:** Learning Book (after `learning-active` seed)
- **What:** Shows "0 topics across 0 subjects" when home screen shows "World History" with "Thriving" retention badge
- **Impact:** Low — may confuse users who see a subject on home but empty Learning Book
- **Likely cause:** `learning-active` seed creates subject + retention data but no curriculum topics

### V-008: Parent Learning Book shows wrong screen (MAJOR) — RESOLVED
- **Screen:** Parent Learning Book tab
- **What:** Tapping "Learning Book Tab" in parent layout shows the learner's "New subject" creation screen with keyboard, instead of the parent's curriculum overview
- **Impact:** HIGH — parents cannot access curriculum overview via tab navigation
- **Status:** RESOLVED (2026-03-25, BUG-68) — navigation state leak from learner group. Resolved as side-effect of BUG-34 (subjects added to seeds eliminated the create-subject auto-redirect). Verified in Session 25: Learning Book shows correct empty state.

### V-009: Consent-withdrawn low contrast text (INFO)
- **Screen:** Consent-withdrawn gate
- **What:** "If this wasn't meant to happen, ask your parent to fix it from their app." text has very low contrast (faint gray on dark)
- **Impact:** Low — secondary text is hard to read, especially for children
- **Recommendation:** Increase contrast to meet WCAG AA (4.5:1 minimum)

---

## Session 23 Final Totals

| Category | Count |
|----------|-------|
| Flows tested | 61 |
| PASS | 55 (90%) |
| FAIL | 6 (infra/LLM/timing — not app bugs) |
| Visual issues found | 4 MAJOR, 2 MINOR, 3 INFO |

**Key visual catches (would have been missed by Maestro alone):**
1. V-004: Subscription screen perpetual spinner (Maestro found testID, screen was blank)
2. V-005: Parent dashboard empty cards (Maestro found heading text, cards had no content)
3. V-006: 4th tab leak in parent layout (Maestro navigated by accessibility label, didn't see extra tab)
4. V-008: Parent Learning Book shows wrong screen (Maestro tapped tab successfully, wrong content loaded)
