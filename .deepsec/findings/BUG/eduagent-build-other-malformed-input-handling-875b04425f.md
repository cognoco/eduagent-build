# [BUG] masteryScore query param not guarded against NaN (incomplete sweep of BUG-813 fix)

**File:** [`apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx#L119-L213) (lines 119, 120, 121, 122, 123, 209, 213)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-malformed-input-handling`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The screen reads `masteryScore` from `useLocalSearchParams` (URL/deep-link controlled) and parses it at L119-123 with `Number(masteryScore)` and no `Number.isFinite` guard. For a malformed value like `?masteryScore=abc`, `mastery` becomes NaN and `masteryPercent = Math.round(NaN*100)` is NaN. Because `masteryPercent !== null` is true for NaN, the Understanding card renders (L190): the progress bar gets `style={{ width: 'NaN%' }}` (invalid, ignored by RN) at L209 and the caption displays literal 'NaN%' at L213, and `getUnderstandingLabel(NaN)` is called at L203. This is the exact malformed-query-param class the team explicitly guarded for `totalSessions` directly above (the BUG-813 comment at L109-117 cites `?totalSessions=abc`), but the identical guard was not applied to `masteryScore` — a partial sweep that CLAUDE.md's 'Sweep when you fix' rule warns against. Impact is cosmetic (a parent sees 'NaN%'), not a security issue; no data exposure or state corruption.

## Recommendation

Mirror the BUG-813 pattern: `const parsed = masteryScore ? Number(masteryScore) : NaN; const mastery = Number.isFinite(parsed) ? parsed : null;` (or clamp to [0,1]). This makes the `masteryPercent !== null` gate correctly suppress the card for non-numeric input.

## Revalidation

**Verdict:** true-positive

Confirmed by clean reads. `masteryScore` comes from `useLocalSearchParams` (route/deep-link controlled; on web the query string is user-editable) and is parsed at lines 119-123 as `masteryScore !== undefined && masteryScore !== '' ? Number(masteryScore) : null` with NO `Number.isFinite` guard. For `?masteryScore=abc`, `mastery = Number('abc') = NaN`, then `masteryPercent = mastery !== null ? Math.round(NaN*100) : null = NaN`. Because `NaN !== null` is true, the gate at line 190 (`masteryPercent !== null`) passes and the Understanding card renders: line 209 sets `style={{ width: 'NaN%' }}` (invalid, ignored by RN), line 213 displays the literal 'NaN%', and `getUnderstandingLabel(NaN)` is called at line 203. I verified `getUnderstandingLabel` (parent-vocab.ts:113-127) does NOT crash on NaN — all comparisons (`=== 0`, `<= 30`, ... `<= 99`) are false for NaN, so it falls through to return the 'mastered' key (a mildly wrong but non-fatal label). This is exactly the malformed-query-param class the team explicitly guarded for `totalSessions` immediately above (lines 109-117, the BUG-813 `Number.isFinite` guard citing `?totalSessions=abc`), but the identical guard was not applied to `masteryScore` — a partial sweep, contrary to CLAUDE.md's 'Sweep when you fix' rule. Impact is cosmetic (a parent sees 'NaN%' / a mislabeled card in their own view), no data exposure, state corruption, or crash. High confidence and BUG severity are both correct; the recommended fix (mirror the `Number.isFinite` pattern) is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
