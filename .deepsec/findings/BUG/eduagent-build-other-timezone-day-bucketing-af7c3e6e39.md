# [BUG] `localDate` computed in UTC (toISOString) despite name/intent of device-local date

**File:** [`apps/mobile/src/app/(app)/dictation/review.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/dictation/review.tsx#L56) (lines 56)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-timezone-day-bucketing`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

In handleDone (line 56) the result is recorded with `const localDate = new Date().toISOString().slice(0, 10)`. `Date.prototype.toISOString()` always renders the date in UTC, not the device's local timezone, so the value sent as `localDate` is the UTC calendar day. The server (apps/api/src/services/dictation/result.ts:71) persists this verbatim into the `dictation_results.date` column, which is the basis for the consecutive-day streak in `getDictationStreak()` (result.ts:115-160) and for the legacy completion-key derivation (result.ts:27-39). The field name `localDate` and the schema field (packages/schemas/src/dictation.ts:92) signal that the intent is the LEARNER'S LOCAL calendar day — which is the only reason a client computes and transmits a date at all, since the Cloudflare Workers backend cannot know the user's timezone. The codebase already contains the correct local-date pattern in apps/api/src/services/trial.ts:93-98 (`new Intl.DateTimeFormat('en-CA', { timeZone })`), confirming the team distinguishes UTC from local elsewhere. Net effect: all dictation day-bucketing follows UTC midnight rather than the learner's local midnight. For learners in timezones far from UTC (e.g. UTC-8 evening practice rolls into the next UTC day; UTC+13 morning practice falls back to the previous UTC day), practice is attributed to the adjacent calendar day in progress/heatmap surfaces, and sessions that straddle the UTC boundary can be counted as the same day (or two local days collapsed into one). Impact is partially masked because the server's own `getServerDate()` (result.ts:181-183) is ALSO UTC, so the streak math stays internally consistent for routine once-a-day practice; the user-visible defect is day-attribution drift and boundary-case streak miscounts, not a hard crash or data loss. The identical defect exists at apps/mobile/src/app/(app)/dictation/complete.tsx:286 — per CLAUDE.md 'Sweep when you fix', both sites should be corrected together.

## Recommendation

Compute the device-local date instead of UTC. Reuse the project's established pattern, e.g. `new Intl.DateTimeFormat('en-CA').format(new Date())` (renders YYYY-MM-DD in the device's local timezone) or `new Date().toLocaleDateString('en-CA')`, ideally extracted into a shared `getLocalDateString()` helper imported by both review.tsx and complete.tsx. If day-bucketing is intended to be UTC-based, rename the field away from `localDate` and document it so the contract is unambiguous. Add a unit test that fakes a non-UTC timezone near a day boundary and asserts the recorded date matches the local calendar day.

## Revalidation

**Verdict:** true-positive

This is unpatched and the analysis holds. review.tsx line 56 still computes `const localDate = new Date().toISOString().slice(0, 10)`, and toISOString() is spec-mandated to render in UTC (the trailing Z), so on a UTC-8 device at 5pm Monday the value is Tuesday's UTC date, not the local Monday. I verified every downstream claim: the schema field is literally named localDate (packages/schemas/src/dictation.ts:92, z.string().date()); the server persists it verbatim as dictation_results.date (result.ts:71); that column drives the consecutive-day streak walk in getDictationStreak (result.ts:132-159) and the legacy completion-key hash (result.ts:33). The intent is genuinely local: a Cloudflare Worker cannot know the user's timezone, so the only reason to compute and transmit a date client-side at all is to capture the learner's local calendar day — otherwise the server would use its own clock (which it does via getServerDate, also UTC, result.ts:181-183). The team demonstrably distinguishes UTC from local elsewhere: trial.ts:93-98 uses `new Intl.DateTimeFormat('en-CA', { timeZone })` for exactly this. Impact is correctly scoped as BUG-level: because getServerDate() is also UTC, routine once-a-day streak math stays internally consistent, so the observable defect is day-attribution drift on progress/heatmap surfaces for users far from UTC plus boundary-case streak miscounts (two local days collapsing into one UTC day, or a near-midnight session attributed to the adjacent day) — not a crash or data loss. git -L confirms line 56 still traces to the original feature commit f6631f4a0 and was never swept. The identical sibling at complete.tsx:286 is also still UTC, so the 'Sweep when you fix' obligation is genuinely outstanding. BUG severity is appropriate.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-27)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-13)
