# Slice 1 PR 5g — Language Setup Reframe + Locale Default

**Date:** 2026-05-06
**Status:** Implemented on `app-ev` (commit `2b437baa`). Pending merge to `main`.
**Branch:** `app-ev`
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § Slice 1 row 5g
**Wave:** Wave 1 (parallel with 5a, 5b, 5d)
**Size:** S

---

## Goal (from audit)

> When I pick a language subject, I want the calibration step to feel like a quick check rather than another setup screen, so the first mentor turn arrives fast.

Acceptance (verbatim from audit § "First Wave PR Candidates"):

- Native language pre-selects from device locale (Norwegian device → `nb` preselected, single tap to confirm or change).
- Step indicator and "Step 2 of 4" copy removed; framed as quick calibration.
- First mentor turn after submission satisfies the 5b rule.

---

## What shipped

### Mobile

- **`apps/mobile/src/app/(app)/onboarding/language-setup.tsx`**
  - Locale pre-selection via `getLocales()` from `expo-localization` (already used by `apps/mobile/src/i18n/index.ts`).
  - `getLocales()[0]?.languageTag` (e.g. `"nb-NO"`) split on `-`; first part matched against `NATIVE_LANGUAGE_CODES`. Norwegian Nynorsk (`nn`) is mapped to `nb`. Wrapped in `try/catch` so test environments where `getLocales()` throws don't break. Falls back to `'en'` when unmatched.
  - Removed `OnboardingStepIndicator` import and the "Step 2 of 4" copy.
  - Title/subtitle replaced with `calibrationTitle` / `calibrationSubtitle` keys.
  - The `step` / `totalSteps` route params still destructured (back-compat for callers passing them) but no longer drive any UI.
  - **`returnTo=settings`** preserved (ACCOUNT-29 — Tutor language edit from More): `returnTo` read via `useLocalSearchParams`. Both `handleBack` and `handleContinue` route back via `goBackOrReplace(router, '/(app)/more')` when `returnTo === 'settings'`. Mirrors the pattern in `pronouns.tsx`.
  - Post-submit destination unchanged — first mentor turn after submission flows through the existing `startFirstCurriculumSession` path and inherits PR 5b's FIRST TURN RULE automatically.

- **`apps/mobile/src/app/(app)/onboarding/language-setup.test.tsx`** — 3 new tests covering locale pre-selection paths. 12/12 pass.

### i18n

- All 7 locale files: `en, nb, de, es, pl, pt, ja`.
- New keys for calibration framing (added in the same JSON files PR 5a touched — that is why 5a and 5g landed in one commit).

### New testID

- `language-setup-calibration-title` on the heading text.

---

## Out of scope (deferred to PR 5h, Wave 4)

- Deleting `language-setup.tsx` outright. The audit's deletion sweep (5h, ≤14 days after Wave 3) does not include this screen — `language-setup` survives because per-subject native-language calibration (four-strands pedagogy) is a real product requirement, not a preference screen.

---

## Verification (run before commit)

- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/(app)/onboarding/language-setup.tsx --no-coverage` — 12/12 pass
- `cd apps/mobile && pnpm exec tsc --noEmit` — clean
- `pnpm exec nx lint mobile` — 0 errors on touched files

---

## Commit

`2b437baa` — `feat(mobile): lighter subject confirmation copy + locale-aware language setup [5a, 5g]`

Bundled with PR 5a because both touch the same 7 locale JSON files.
