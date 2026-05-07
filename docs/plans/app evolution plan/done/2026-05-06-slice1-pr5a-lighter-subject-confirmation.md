# Slice 1 PR 5a — Lighter Subject Confirmation Copy

**Date:** 2026-05-06
**Status:** Implemented on `app-ev` (commit `2b437baa`). Pending merge to `main`.
**Branch:** `app-ev`
**Parent plan:** `2026-05-06-learning-product-evolution-audit.md` § C and Slice 1 row 5a
**Wave:** Wave 1 (parallel with 5b, 5d, 5g)
**Size:** XS

---

## Goal (from audit)

> When my subject is confidently classified, I want a single-tap "Start" rather than an "Accept / Edit" approval screen, so the moment feels like momentum into learning.

Acceptance (verbatim from audit § "First Wave PR Candidates"):

- "Confident" defined as `status === 'resolved' && suggestions.length === 1`. No backend schema change.
- Confident case shows "We'll start with [subject]." with primary `Start` and secondary `Change`.
- `corrected` status (spelling fix) also takes the lighter copy.
- `resolved` with `suggestions.length > 1` and no-match cases keep the heavier clarification card.
- Direct-match path unchanged.

---

## What shipped

### Mobile

- **`apps/mobile/src/app/create-subject.tsx`** — added `isConfident` computed flag (`status === 'corrected' || (status === 'resolved' && suggestions.length === 1)`). New `subject-confident-card` JSX renders "We'll start with [subject]" + primary `Start` (testID `subject-suggestion-accept`) + secondary `Change` (testID `subject-suggestion-edit`). The existing single-suggestion Accept/Edit card is gated behind `!isConfident`. `direct_match` flow unchanged (still calls `doCreate()` immediately at line ~252).
- **`apps/mobile/src/app/create-subject.test.tsx`** — five new tests: confident card on `resolved`+single, confident card on `corrected`, Start CTA navigates, Change CTA returns to edit, heavier card retained for `resolved`+multiple. 37 tests pass overall (5 new + 32 pre-existing).

### i18n

- All 7 locale files updated: `en, nb, de, es, pl, pt, ja`.
- New keys: `weWillStartWith`, `start`, `changeSubject`, `changeSubjectLabel`.

---

## Out of scope (deferred)

- Adding a numeric `confidence` field to `SubjectResolveResult`. Audit explicitly defers this to a future PR.
- Any change to the resolve/classify endpoint shape on the API side.

---

## Verification (run before commit)

- `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/create-subject.tsx --no-coverage` — 37/37 pass
- `cd apps/mobile && pnpm exec tsc --noEmit` — clean
- `pnpm exec nx lint mobile` — 0 errors on touched files

---

## Commit

`2b437baa` — `feat(mobile): lighter subject confirmation copy + locale-aware language setup [5a, 5g]`

Bundled with PR 5g because both touch the same 7 locale JSON files.
