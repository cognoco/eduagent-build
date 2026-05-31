# [HIGH_BUG] Same-day dictations in the same mode overwrite each other

**File:** [`apps/api/src/services/dictation/result.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/dictation/result.ts#L33-L59) (lines 33, 45, 59)
**Project:** eduagent-build
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-data-loss`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

recordDictationResult records only profile/date/mode identity when it calls repo.dictationResults.insert. The repository upserts on (profile_id, date, mode), so a legitimate second homework or surprise dictation on the same day overwrites the first result. Because the practice ledger event dedupes from the reused result row id, the second completion is also not counted as a separate practice activity. The mobile flow exposes 'Try another dictation', so this is reachable as normal user behavior, not just retry behavior.

## Recommendation

Add a per-completion client id/idempotency key or session id to the result API and unique constraint. Use that stable id for retry dedupe, while allowing multiple rows for the same profile/date/mode.

## Revalidation

**Verdict:** true-positive

Confirmed still present and accurate. The dictation_results table (packages/database/src/schema/dictation.ts:46-56) retains uniqueIndex('uniq_dictation_results_profile_date_mode') on (profileId, date, mode) as the only UNIQUE constraint; completion_key is merely a non-unique index. The repository insert (repository.ts:856-872) performs onConflictDoUpdate with target [profileId, date, mode] and a SET clause that overwrites completionKey/sentenceCount/mistakeCount/reviewed — so a second homework or surprise dictation on the same calendar day in the same mode UPDATES (overwrites) the first row rather than inserting a new one. The completionKey field was added only to the SET clause for a forward-migration ('a contract migration can move this upsert to completionKey'); it is NOT the conflict arbiter, so it does not enable multiple same-day/mode rows. The secondary claim also holds: recordDictationResult (result.ts:82-105) passes sourceId: row.id with NO occurrenceKey, and since the conflict-update returns the original row id, the practice-activity dedupeKey (practice-activity-events.ts:24-41) is identical across both completions, so onConflictDoNothing on (profileId, dedupeKey) drops the second event — confirming it is not counted as a separate practice activity (contrast processRecallTest at retention-data.ts:961, which passes a timestamped occurrenceKey). Reachable through normal UX ('Try another dictation'). HIGH_BUG is appropriate for silent, normal-path data loss plus practice-ledger under-counting; the streak walk is unaffected since it only keys on distinct dates.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-19)
