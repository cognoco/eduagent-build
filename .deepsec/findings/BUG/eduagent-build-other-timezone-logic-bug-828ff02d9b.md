# [BUG] Quiz-history date grouping/labeling mixes UTC and local time bases (off-by-one labels)

**File:** [`apps/mobile/src/app/(app)/quiz/history.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/quiz/history.tsx#L16-L221) (lines 16, 17, 18, 19, 20, 221)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-timezone-logic-bug`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

Rounds are grouped by `round.completedAt.slice(0, 10)` (L221). `completedAt` is a strict ISO UTC datetime (schema `isoDateField`, e.g. `2026-05-18T12:00:00.000Z`), so the slice yields the round's *UTC* calendar date. `formatDateHeader` (L16-32) then parses that date as `new Date(`${isoDate}T00:00:00`)` — with NO timezone suffix, JS interprets it as *local* midnight (L17) — and compares it against `today`, which is built from local `now.getFullYear/Month/Date()` (L18-19). The two time bases disagree for any user not at UTC. Concrete effects: (1) for negative UTC offsets (the Americas), an evening round carries the next UTC date, so `diffDays` goes negative and the 'Today'/'Yesterday' branches (L24-25) are skipped, falling through to `toLocaleDateString` which renders a *future* calendar date for a round the user just played; (2) for positive offsets (e.g. Japan, a supported `ja` locale; UTC+9), early-morning rounds carry the previous UTC date and mislabel as 'Yesterday'; (3) rounds played in one local day that straddle a UTC midnight get split across two date-section headers. This is cosmetic (no data exposure), but produces visibly wrong history headers near day boundaries and for far-from-UTC users.

## Recommendation

Use a single, consistent time base. Either derive the grouping key from the user's local date — e.g. `const c = new Date(round.completedAt); const dateKey = `${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}-${String(c.getDate()).padStart(2,'0')}`` — and keep parsing that local key as local midnight; or keep UTC grouping and compute `diffDays`/`today` in UTC (`Date.UTC(...)` and parse `${isoDate}T00:00:00Z`). The key and the label must agree on whether 'a day' means the user's local day or the UTC day.

## Revalidation

**Verdict:** true-positive

I verified every premise. The grouping key is round.completedAt.slice(0,10) (line 221), and completedAt reaches the client via the recent-rounds route as round.completedAt?.toISOString() (apps/api/src/routes/quiz.ts:232-233), validated as isoDateField in recentRoundSchema (packages/schemas/src/quiz.ts:233). toISOString() always emits a Z-suffixed UTC string (e.g. 2026-05-18T12:00:00.000Z), so slice(0,10) yields the round's UTC calendar date — confirmed. formatDateHeader (lines 16-32) then builds d = new Date(`${isoDate}T00:00:00`); per the ECMAScript Date Time String Format, a date-time literal with no trailing Z/offset is parsed as LOCAL time (only date-only YYYY-MM-DD strings are UTC), so d is local midnight of the UTC date, while today (line 19) is local midnight of the current local date — two disagreeing time bases. The concrete effects all hold: for negative UTC offsets an evening round carries the next UTC date so diffDays goes negative, skips the Today/Yesterday branches, and toLocaleDateString renders a future date; for positive offsets such as the supported ja locale (UTC+9), an early-morning round carries the previous UTC date and mislabels as 'Yesterday'; and a single local day straddling UTC midnight splits across two section headers because the dateKeys differ. This is a real logic bug, correctly scoped as cosmetic with no data exposure, so BUG severity is appropriate and unchanged. It has not been patched — the current formatDateHeader and the slice(0,10) key still mix bases — so it is a live true positive.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-29)
