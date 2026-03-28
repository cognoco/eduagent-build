# Manual Testing Bugs — APK on Device

Reported: 2026-03-28
Device: Physical Android phone

---

## BUG-M01: Splash animation stuck on three dots

**Severity:** Medium
**Screen:** App launch (AnimatedSplash)
**Status:** Fixed (code) — needs rebuild to verify on device

**What happens:** When opening the app for the first time, the animated splash shows three dots (resembling Orion's belt) and stays there — the animation does not complete or transition forward.

**Expected:** The full animation sequence should play (~2.5s): student node springs in → growth arc draws → 3 dots burst with spark particles → mentor node appears → achievement ring pulses → wordmark fades in → everything fades out.

**Root cause:** Two issues found:
1. `onComplete` prop was an inline arrow function creating a new reference on every render, causing the `useEffect` choreography to restart repeatedly (pushing the fade-out delay further each time)
2. No safety fallback — if the final animation callback never fired (common on Android), the splash stayed forever

**Fix applied:**
- Stabilized `onComplete` with `useCallback` in `_layout.tsx` (passed as stable `dismissSplash` ref)
- Used `useRef` inside `AnimatedSplash` so `done` callback doesn't depend on prop identity changes
- Added 4-second safety timeout in `_layout.tsx` — force-dismisses splash if animation doesn't complete

**Design request (future):** User wants the three dots to look more like Orion's belt with exploding stars — a more dramatic star-burst effect. Needs UX spec.

**Files:** `apps/mobile/src/components/AnimatedSplash.tsx`, `apps/mobile/src/app/_layout.tsx`

---

## BUG-M02: "Welcome back" shown to first-time users

**Severity:** Medium
**Screen:** Sign-in screen (`(auth)/sign-in.tsx`)
**Status:** Fixed (code) — needs rebuild to verify on device

**What happens:** A user opening the app for the very first time sees "Welcome back" as the sign-in screen heading — even though they have never used the app before.

**Expected:** First-time users should see a different greeting. "Welcome back" should only appear for returning users.

**Root cause:** The greeting text was hardcoded with no conditional logic.

**Fix applied:**
- Added `hasSignedInBefore` flag in SecureStore, checked on mount
- New users see "Welcome to MentoMate" / "Sign in to start learning"
- Returning users see "Welcome back" / "Sign in to continue learning"
- Flag set after successful sign-in (both email/password and SSO paths)

**File:** `apps/mobile/src/app/(auth)/sign-in.tsx`

---

## BUG-M03: Verification/consent emails land in spam

**Severity:** High (blocks onboarding)
**Screen:** N/A (email delivery)
**Status:** Open — pre-launch config item (not a code fix)

**What happens:** Clerk verification emails sometimes land in the recipient's spam folder. Not 100% reproducible.

**Root cause:** Custom email domain with SPF/DKIM/DMARC is **not yet configured** for Clerk or Resend.

**Fix approach:**
1. Configure custom sending domain in Clerk dashboard (add SPF, DKIM, DMARC DNS records)
2. Verify sending domain in Resend dashboard
3. Both require DNS access to the `mentomate.com` domain

---

## BUG-M04: Camera/photo capture shows empty screen instead of photo

**Severity:** High (blocks homework flow)
**Screen:** Homework camera capture — preview phase
**Status:** Fixed (code) — needs rebuild to verify on device

**What happens:** After capturing a photo, the preview screen shows only a gray placeholder box with "Photo captured" text instead of displaying the actual photo.

**Expected:** The preview should show the captured photo so the user can decide to retake or proceed.

**Root cause:** The preview phase in `camera.tsx` rendered a placeholder `<View>` with text instead of an `<Image>` component with the captured `state.imageUri`. The `Image` component was never imported.

**Fix applied:**
- Added `Image` import from `react-native`
- Preview phase now renders `<Image source={{ uri: state.imageUri }} />` when `imageUri` is available
- Falls back to the text placeholder only if `imageUri` is somehow null

**File:** `apps/mobile/src/app/(learner)/homework/camera.tsx`

---

## BUG-M05: Bottom navigation bar hidden behind system buttons

**Severity:** Critical (blocks navigation)
**Screen:** All screens with bottom tab bar
**Status:** Fixed (code) — needs rebuild to verify on device

**What happens:** The bottom navigation/tab bar is rendered behind the phone's system navigation buttons (Android soft keys or gesture bar), making it impossible to tap the nav items.

**Root cause:** `tabBarStyle` used hardcoded `height: 64, paddingBottom: 8` — ignoring the device's safe area bottom inset.

**Fix applied:**
- Both `(learner)/_layout.tsx` and `(parent)/_layout.tsx` now use `useSafeAreaInsets()` to compute dynamic tab bar dimensions:
  ```
  height: 56 + insets.bottom
  paddingBottom: insets.bottom
  ```
- Tab content area stays 56px; the area below extends to cover the system navigation zone with the surface background color.

**Files:** `apps/mobile/src/app/(learner)/_layout.tsx`, `apps/mobile/src/app/(parent)/_layout.tsx`

---

## BUG-M06: Gemini model deprecated (not API key expired)

**Severity:** Critical (blocks all LLM features)
**Screen:** Any screen using AI (sessions, coaching card, curriculum generation)
**Status:** Fixed (code) — needs deploy to Cloudflare Workers

**What happens:** The app reports that the Gemini token is "expired". All LLM-dependent features are non-functional.

**Root cause:** The API key is valid — the **model** `gemini-2.0-flash` was deprecated by Google. The API returns HTTP 404: "This model is no longer available to new users."

**Why fallback didn't help:** `OPENAI_API_KEY` is not configured in Doppler. Without it, OpenAI is never registered as a fallback provider, so the circuit breaker has nowhere to fall back to.

**Fix applied:**
- Updated model from `gemini-2.0-flash` to `gemini-2.5-flash` in `router.ts`
- Updated OpenAI model mapping in `openai.ts`
- Updated all test files (52+ tests pass)

**Note:** `gemini-2.5-pro` (used for higher escalation rungs) is still active and working.

**Files:** `apps/api/src/services/llm/router.ts`, `apps/api/src/services/llm/providers/openai.ts`, and related test files

---

## BUG-M07: Home screen completely empty — no content loads

**Severity:** Critical (app appears broken)
**Screen:** Learner home screen (`(learner)/home.tsx`)
**Status:** Expected to resolve with M06 fix — needs verification after deploy

**What happens:** After sign-in, the home screen shows only the heading and streak badge. The entire content area is empty — no coaching card, no subject list.

**Root cause (likely):** Cascading failure from BUG-M06. The deprecated Gemini model causes API errors for coaching card and subject queries. With M06 fixed, the API should return data and the home screen should populate.

**If still broken after M06 deploy:** Investigate the subjects query and the redirect logic at `home.tsx:77-89` (new user with 0 subjects should redirect to create-subject).

**File:** `apps/mobile/src/app/(learner)/home.tsx`

---

## BUG-M08: App resumes on last screen after restart (instead of home)

**Severity:** Low / Needs triage
**Screen:** App launch
**Status:** Open — expected dev-client behavior

**What happens:** When the user force-closes and reopens the app, it navigates directly to the last visited screen instead of starting at the home screen.

**Analysis:** No explicit navigation state persistence in codebase. This is Expo Router's development-mode state persistence — dev-client builds auto-restore last screen. Production builds should NOT do this.

**Verdict:** If dev-client APK → not a bug. If preview/production APK → bug.

**Future design idea:** Let the user choose their preference — "resume where I left off" vs. "always start at home". To be specced later.

**File:** `apps/mobile/src/app/_layout.tsx`
