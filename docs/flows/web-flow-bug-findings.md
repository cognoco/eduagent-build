# Web Flow Bug Findings

Date: 2026-04-13
Platform: Expo web
Source inventory: `docs/flows/mobile-app-flow-inventory.md`

This document records the confirmed web bugs found while testing the current mobile app flows in the browser. It is a focused investigation log, not a complete bug tracker.

## Tracking Conventions

- Every entry should include a `Status`.
- If a bug is fixed, note that explicitly as `Fixed in current branch` or similar.
- Fixed entries should also keep their `Fix applied` and `Verification` notes so it is clear what changed and how it was confirmed.
- If a bug is not yet fixed, keep the best-known symptom and root-cause notes so the next pass can resume quickly.

## Summary

- The initial pattern looked like one systemic "web navigation is dead" failure.
- Live repro and code inspection showed that the reported symptoms came from multiple root causes, not one global Expo Router or Pressable failure.
- Additional testing found one more local web UI bug, confirmed that the `book-suggestions` and `review-summary` failures were stale remote-deployment issues rather than current-branch regressions, and narrowed the seed blocker to that same remote environment.

## WEB-01: Parent profile switcher dropdown opens, but option clicks do not navigate

**Severity:** High
**Affected flows:** `ACCOUNT-04`, `HOME-02`, `HOME-03`
**Status:** Fixed in current branch

**Symptom:** On parent home, the `ProfileSwitcher` dropdown appears to open, but clicking a learner profile does nothing. The parent screen stays visible and the route does not change.

**Root cause:** The switcher lived inside the parent home's `ScrollView`. On web, the menu could render visually above the content while pointer interaction was still effectively owned by the underlying scroll content, so clicks on dropdown items were intercepted instead of reaching the menu.

**Fix applied:** Restructured `ParentGateway` so the header area sits outside the scrollable content, matching the learner layout pattern and avoiding the web stacking/pointer-event trap.

**Files:** `apps/mobile/src/components/home/ParentGateway.tsx`

**Verification:** Reproduced on Expo web before the fix. After the change, switching from parent home into learner home works in the browser.

## WEB-02: Close/back actions silently no-op on web when there is no history entry

**Severity:** High
**Affected flows:** `ACCOUNT-01`, `ACCOUNT-02`, `ACCOUNT-11`, `ACCOUNT-12`, `ACCOUNT-13`, `ACCOUNT-14`, `ACCOUNT-19`, `ACCOUNT-20`, `ACCOUNT-21`, `HOME-06`, `LEARN-09`, `LEARN-10`
**Status:** Fixed in current branch (full sweep complete)

**Symptom:** On direct-load or refreshed web routes, pressing `Cancel`, `Done`, or a top-left back button can do nothing at all. The URL stays the same because `router.back()` has nowhere to go.

**Root cause:** Several screens relied on bare `router.back()` for dismissal. On web, direct URL entry, refresh, or prior `router.replace()` can leave the history stack empty, which makes `router.back()` a silent no-op.

**Fix applied:** Added a shared `goBackOrReplace(router, fallbackHref)` helper and applied it to all screens with bare `router.back()` calls.

**Phase 1** (initial pass — 10 screens):

- `/create-profile`, `/profiles`, `/delete-account`, `/consent`
- `/(app)/learn-new`, `/(app)/shelf/[subjectId]`, `/(app)/shelf/[subjectId]/book/[bookId]`, `/(app)/pick-book/[subjectId]`
- `/terms`, `/privacy`

**Phase 2** (full sweep — 23 additional screens):

Learner flow screens (fallback → `/(app)/home`):
- `/create-subject`, `/assessment`, `/(app)/learn`, `/(app)/dashboard`
- `/(app)/homework/camera`, `/(app)/progress/[subjectId]`, `/(app)/subject/[subjectId]`
- `/(app)/topic/[topicId]` (4 call sites), `/(app)/topic/relearn` (2 call sites)
- `/(app)/onboarding/curriculum-review`, `/(app)/onboarding/interview`
- `/(app)/onboarding/analogy-preference`, `/(app)/onboarding/language-setup`
- `ChatShell` component (shared session UI)

Settings screens (fallback → `/(app)/more`):
- `/(app)/mentor-memory` (2 call sites), `/(app)/subscription` (2 call sites)

Auth screen (fallback → `/sign-in`):
- `/(auth)/forgot-password`

Parent child screens (fallback → `/(app)/home`):
- `/(app)/child/[profileId]` (2 call sites)
- `/(app)/child/[profileId]/mentor-memory` (2 call sites)
- `/(app)/child/[profileId]/reports` (2 call sites)
- `/(app)/child/[profileId]/report/[reportId]`
- `/(app)/child/[profileId]/subjects/[subjectId]`
- `/(app)/child/[profileId]/session/[sessionId]` (3 call sites)
- `/(app)/child/[profileId]/topic/[topicId]`

**Verification:**

- `screen-navigation.test.ts`: 40/40 passed (all screens still have exit navigation)
- All related test suites: 146 tests passed across 11 suites
- Mobile typecheck: clean (no errors)
- Zero bare `router.back()` calls remain in non-test source files

## WEB-03: "Open shelf" is not a dead click; the destination screen crashes immediately

**Severity:** High
**Affected flows:** `LEARN-08`, `LEARN-09`
**Status:** Fixed in current branch

**Symptom:** From Library, clicking `Open shelf` can look like nothing happened, but the real failure is a runtime error after navigation starts. In web repro, the shelf route failed with `books.find is not a function`.

**Root cause:** `useAllBooks` and `useBooks` shared the same React Query cache key but returned different data shapes. One path cached an object with a `books` property, while the shelf code expected a plain array and called `.find(...)` on it.

**Fix applied:** Normalized the shared cache shape so both hooks agree on an array result, and added a defensive unwrap in `useBooks` so older cached entries do not crash the shelf.

**Files:**

- `apps/mobile/src/hooks/use-all-books.ts`
- `apps/mobile/src/hooks/use-books.ts`

**Verification:** After the fix, `Library -> Open shelf` reaches the shelf page in Expo web without the runtime crash.

## Investigation Notes

The following items were suspected to share the same web-navigation failure, but they did not reproduce as broken in this pass:

- Library tab switcher
- `Manage` button in Library flows
- `Help with assignment`

That matters because it points away from a single global failure in Expo Router, `router.push()`, or the web `Pressable` layer. The current evidence supports a mix of:

- web pointer/stacking issues
- no-history `router.back()` behavior
- runtime crashes after successful navigation

## WEB-04: Create-profile birth date control does not render any usable input on web

**Severity:** High
**Affected flows:** `ACCOUNT-01`, `ACCOUNT-02`, `ACCOUNT-03`
**Status:** Fixed in current branch

**Symptom:** On web, the `create-profile` screen showed the birth-date field, but clicking it did not render any picker or editable control. The submit button could never become enabled because the date stayed unset.

**Root cause:** This screen relied on `@react-native-community/datetimepicker` for web. In the browser repro, the `Pressable` updated local state but the picker component did not render any usable DOM control.

**Fix applied:** Added an explicit web fallback on `create-profile` that uses a typed birth-date text input (`YYYY-MM-DD`) instead of depending on the native date picker package on web.

**Files:**

- `apps/mobile/src/app/create-profile.tsx`
- `apps/mobile/src/app/create-profile.test.tsx`

**Verification:**

- `pnpm test:mobile:unit -- create-profile.test.tsx`
- Live web repro: after the fix, adding a child profile from the parent home works and returns to `/home`

## WEB-05: Broad-subject flow reaches `pick-book`, but the suggestions API returns 404

**Severity:** High
**Affected flows:** `SUBJECT-01`, `SUBJECT-02`, `SUBJECT-06`
**Status:** Not reproducible in current branch with local API; still open on stale remote dev deployment

**Symptom:** In a live browser flow, creating a broad subject succeeds and routes to `/(app)/pick-book/[subjectId]`, but the screen eventually degrades into a `404 Not Found` error state with `Retry` and `Go back`.

**Root cause:** The current dev API returns `404` for `GET /v1/subjects/:subjectId/book-suggestions`, which leaves the pick-book screen in its error branch.

**Evidence from repro:**

- `POST /v1/subjects/resolve` returned `200`
- `POST /v1/subjects` returned `201`
- navigation reached `/pick-book/<subjectId>`
- repeated `GET /v1/subjects/<subjectId>/book-suggestions` requests returned `404`

**Inference:** The app code in this repo already contains the matching API route in `apps/api/src/routes/book-suggestions.ts`, so the most likely explanation is that the currently deployed dev API is missing that route or is out of sync with the repo code.

**Files relevant to investigation:**

- `apps/mobile/src/hooks/use-book-suggestions.ts`
- `apps/mobile/src/app/(app)/pick-book/[subjectId].tsx`
- `apps/api/src/routes/book-suggestions.ts`

**Verification on stale remote dev deployment:** Reproduced in Expo web by:

1. signing in with a fresh seeded account
2. adding a 17+ child profile
3. switching into that child profile
4. creating the subject `Biology`
5. waiting for the pick-book screen to request suggestions

**Verification on current branch:** Against the local API, the same browser path now reaches `/pick-book/[subjectId]` and renders suggestion cards. `GET /v1/subjects/:subjectId/book-suggestions` returned `200`.

## WEB-06: Learner home fires `review-summary` requests that return 404 in the current dev environment

**Severity:** Medium
**Affected flows:** `HOME-01`, `HOME-06`
**Status:** Not reproducible in current branch with local API; still open on stale remote dev deployment

**Symptom:** On learner-home loads during this pass, the browser repeatedly logged `GET /v1/progress/review-summary` returning `404`. The home screen still rendered, but Sentry captured the API error and the review-summary data was unavailable.

**Root cause:** The current dev API is responding `404` to the `review-summary` endpoint used by `useReviewSummary()`.

**Inference:** The route exists in the repo at `apps/api/src/routes/progress.ts`, so this again points to a dev-environment deployment mismatch or stale API version rather than a bad mobile route string.

**Files relevant to investigation:**

- `apps/mobile/src/hooks/use-progress.ts`
- `apps/mobile/src/components/home/LearnerScreen.tsx`
- `apps/api/src/routes/progress.ts`

**Verification on stale remote dev deployment:** Observed repeatedly in live web while switching into a learner profile and loading learner home.

**Verification on current branch:** Against the local API, learner-home loads returned `200` for `GET /v1/progress/review-summary`.

## WEB-07: Adult solo learners are routed to "Add your first child" instead of learner home

**Severity:** High
**Affected flows:** `HOME-01`, `SUBJECT-01`, `HOMEWORK-01`
**Status:** Fixed in current branch

**Symptom:** Signing in as a solo learner on web could land on the parent-style `Add your first child` CTA instead of the learner home. That hid the normal `Start learning` and `Help with assignment?` entry points and blocked learner flow coverage.

**Root cause:** `HomeScreen` treated any owner profile with no linked children as a parent-with-no-children case. That is wrong for `free` and `plus` accounts, where `maxProfiles` is `1` and the owner is still a solo learner.

**Fix applied:** Restricted the add-child CTA to multi-profile tiers (`family` and `pro`) so `free` and `plus` owners continue to the learner home.

**Files:**

- `apps/mobile/src/app/(app)/home.tsx`
- `apps/mobile/src/app/(app)/home.test.tsx`

**Verification:**

- `pnpm test:mobile:unit -- home.test.tsx`
- Live web repro with a seeded `multi-subject` learner account now lands on `LearnerScreen`, and subsequent Library / subject-creation flows work normally

## TEST-01: Most subject-backed seed scenarios currently fail before web testing can start

**Severity:** Medium
**Affected testing scenarios:** `learning-active`, `multi-subject`, `multi-subject-practice`, `parent-with-children`, `parent-multi-child`, `trial-active`, `trial-expired`, `trial-expired-child`, `daily-limit-reached`, and others that create subject/book data
**Status:** Mitigated for current-branch testing; still open on stale remote dev deployment

**Symptom:** The remote `POST /v1/__test/seed` endpoint currently fails for many scenarios with:

`null value in column "book_id" of relation "curriculum_topics" violates not-null constraint`

**Impact:** On the stale remote dev deployment, this blocks systematic browser testing for many subject, library, and parent flows because the richer test scenarios cannot be created reliably.

**Inference:** The failure is in the deployed remote dev environment, not in the browser layer and not in the current local branch. The repo's current seed implementation creates `curriculum_topics.book_id`, and local subject-backed scenarios seed successfully.

**Verification:**

- Remote dev deployment: direct calls to `POST /v1/__test/seed` still reproduced the `curriculum_topics.book_id` null-constraint failure
- Current branch on local API: `learning-active`, `multi-subject`, and `parent-multi-child` seeded successfully and were used to continue browser testing

## Recommended Next Sweep

- ~~Continue replacing fragile bare `router.back()` usage on standalone/detail routes that should always have a safe fallback on web.~~ **DONE** — full sweep completed, zero bare `router.back()` calls remain in production source.
- Keep validating suspected "dead click" reports in the browser before clustering them under one root cause.
- Keep using the local API for systematic web-flow coverage until the remote dev deployment is updated to match the repo code.
- Add more inventory-linked web regression checks around Library, subject shelf, and account/legal screens.
- When adding new screens, use `goBackOrReplace(router, fallbackHref)` instead of bare `router.back()` to maintain web safety.
