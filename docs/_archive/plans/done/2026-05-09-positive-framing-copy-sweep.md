# Positive-Framing Copy Sweep

**Date:** 2026-05-09
**Branch:** `ux-cleanup`
**Status:** Spec — ready to implement
**Siblings:** `2026-05-09-family-tab-restructure.md`, `2026-05-09-progress-tab-currently-working-on.md`

## Why

Per `feedback_positive_framing_no_struggle`, the UI must not say "struggle / struggling / declining / weak / trouble" anywhere a user reads. Current grep across the mobile app finds these words in component strings, locale files, and a couple of progress / library / mentor surfaces.

Two specs in flight (Family-tab restructure + Progress "currently working on") both touch overlapping files. Doing the copy sweep inside either one would: (a) inflate that PR's diff with translation churn, (b) make merge conflicts likely if they ship in parallel, (c) leave the *other* spec's surface still using the old wording until its own PR lands. Splitting the sweep into a tiny standalone PR fixes all three problems and gives the rest of the app a free win.

This is a copy-only PR. No behavior changes, no schema changes, no new components.

## Decisions

| ID | Decision |
|---|---|
| **D-CS-1** | Edit string **values**, not keys. Translation keys like `progress.struggling` stay (renaming would churn tests and call sites). Locale-file values change. |
| **D-CS-2** | Internal identifiers (table name `learning_profiles.struggles`, event name `struggle_noticed`, type literals like `'struggling' \| 'mastered'`) **do not change**. They're not user-visible. Renaming them is a separate, much larger refactor. |
| **D-CS-3** | Replacement vocabulary, applied consistently across all 7 locales: |

| Old | Replace with |
|---|---|
| "struggling with X" | "currently practicing X" or "working on X" |
| "struggle" / "struggles" (noun, in copy) | "focus areas" or "currently working on" |
| "declining" | "needs more time" or "due for review" |
| "trouble with" | "practicing" |
| "weak in" | "building fluency in" |

Translators adapt for each locale's idiom; the replacement table is a guideline, not a literal find-replace.

## Affected Surfaces

Initial grep (verify exhaustively in the PR before claiming done):

### Mobile components
- `apps/mobile/src/components/coaching/ParentDashboardSummary.tsx`
- `apps/mobile/src/components/library/RetentionPill.tsx`
- `apps/mobile/src/components/progress/RemediationCard.tsx`
- `apps/mobile/src/hooks/use-progress.ts` (any user-visible string literals)

### Mobile screens
- `apps/mobile/src/app/(app)/family.tsx`
- `apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx`
- `apps/mobile/src/app/(app)/practice/assessment/index.tsx`
- `apps/mobile/src/app/(app)/mentor-memory.tsx`

### Locale files
- `apps/mobile/src/i18n/locales/en.json`
- `apps/mobile/src/i18n/locales/nb.json`
- `apps/mobile/src/i18n/locales/de.json`
- `apps/mobile/src/i18n/locales/es.json`
- `apps/mobile/src/i18n/locales/pt.json`
- `apps/mobile/src/i18n/locales/pl.json`
- `apps/mobile/src/i18n/locales/ja.json`

Known specific hits in `en.json` (from grep):
- `"struggles": "Things You're Improving At"` — already half-positively-framed; consider renaming the **value side** copy at call sites if any still surface "struggles" as a label. Key stays.
- `"learnAboutChildDescription": "Allow the mentor to build a memory of your child's strengths and struggles"` → "...strengths and focus areas".
- `"declining": "Engagement declining"` → "Engagement needs attention" or similar (translator's call within positive-framing rules).
- `"declining": "Declining"` (likely a status label) → "Needs review" or similar.
- `"profileNotFound": "We had trouble loading your profile..."` — "trouble" here is system-error context, not learner-progress framing. **Acceptable** — `feedback_positive_framing_no_struggle` is about learner outcomes, not transient infrastructure errors. Leave as-is unless translator finds a cleaner phrasing.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Translator misses a string in a non-EN locale | Manual sweep oversight | User in that locale sees old word | Reviewer runs the verification grep below across all 7 locale files. CI does not catch i18n drift. |
| A component reads a key that was never localized | Pre-existing missing translation | `react-i18next` returns the raw key | Pre-existing problem, out of scope here. Don't try to fix general i18n coverage in this PR. |
| Replacement makes a sentence ungrammatical in some locale | "struggling with" doesn't have a 1:1 idiom in (e.g.) Japanese | Awkward phrasing | Translators paraphrase per the spirit of the rule. PR review must spot-check non-EN locales, not just EN. |
| A component string contains the banned word but also a `Trans` interpolation | E.g. `<Trans i18nKey="...">struggling with <Bold>{name}</Bold></Trans>` | Replacement might break the interpolation | Read the JSX context, not just the string. Update both the locale value and any inline JSX wrappers. |

## Implementation Steps

1. **Exhaustive grep first.** Run the verification grep below from a clean tree. Record the full list of file:line hits to work from. Don't trust the inventory in this spec — it's a starting point.
2. **Edit each component / screen file** to replace banned words in JSX `<Text>` children and string props. Internal vars, type literals, and translation **keys** stay.
3. **Edit each locale file** in lockstep — same structural change across all 7 JSON files. Use a side-by-side editor or a small script.
4. **Verification grep** — see checklist below. Should return **zero** UI-visible hits.
5. **Manual smoke** — open the screens that previously contained banned words (Family tab, Progress tab, RemediationCard surface, mentor-memory, RetentionPill on shelf/book). Confirm the new copy reads naturally in EN. Spot-check at least one non-EN locale visually if possible.
6. **Tests.** Update any test that asserts the old strings (`expect(...).toHaveTextContent('struggling')` style). Tests asserting **keys** are unaffected. Use `superpowers:verification-before-completion` discipline: don't loosen a test by replacing exact-string assertions with `.toContain('practicing')`-style fuzzy matches just because the string changed — match the new exact rendered string.

## Verification Checklist (before PR)

- [ ] `grep -rE "(struggle|struggling|struggles|declining|weak in|trouble with)" apps/mobile/src/i18n/locales/` returns **zero** hits in user-visible value strings. (Internal `"struggling": "...new copy..."` keys whose **values** are clean are fine.)
- [ ] `grep -rE ">\\s*[^<]*(struggle|struggling|declining|weak in|trouble with)" apps/mobile/src/` returns zero JSX-text hits.
- [ ] Mentor-memory screen reads naturally in EN.
- [ ] Family tab cards read naturally in EN.
- [ ] RemediationCard reads naturally in EN.
- [ ] RetentionPill reads naturally in EN.
- [ ] No translation keys were renamed (only values).
- [ ] No internal type literals or DB column references were touched.
- [ ] `pnpm exec nx run mobile:test` clean. Tests asserting old strings updated to new strings (not weakened).
- [ ] `pnpm exec tsc --build` clean.

## Out of Scope

- Renaming `learning_profiles.struggles` table column. Database refactor; separate work.
- Renaming `struggle_noticed` Inngest event. Cross-system rename; separate work.
- Renaming TypeScript type literals like `RetentionStatus = 'strong' | 'fading' | 'weak' | 'forgotten'`. Internal; not user-visible.
- Adding new copy or restructuring messages. Word-for-word swap only.
- Fixing pre-existing missing translations or broken `react-i18next` keys.
- Behavior changes, layout changes, accessibility changes. Copy only.

## Coordination With Sibling Specs

- **Ships first.** Both `2026-05-09-family-tab-restructure.md` and `2026-05-09-progress-tab-currently-working-on.md` depend on this landing first to avoid locale-file conflicts.
- **Independent of:** parent-home-restructure and more-tab-restructure unless those edit the same locale strings. (Quick check during PR review.)
