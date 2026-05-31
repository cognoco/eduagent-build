# [BUG] Self-reinvoke cursor advances past profiles that errored mid-run, silently skipping them for the rest of the backfill chain

**File:** [`apps/api/src/inngest/functions/memory-facts-backfill.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/inngest/functions/memory-facts-backfill.ts#L64-L220) (lines 64, 72, 177, 195, 213, 220)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The function paginates with a composite (createdAt, profileId) cursor. Each run processes a slice of up to MAX_PROFILES_PER_RUN profiles, and the next cursor is set to the LAST profile of the slice regardless of whether individual profiles succeeded: `const last = profilesThisRun[profilesThisRun.length - 1]` (L215) → `nextCursor = { lastCreatedAt, lastProfileId }` (L217-220). Per-profile failures are caught and counted but the marker (memoryFactsBackfilledAt) is NOT set (L177-195), so those rows remain `memoryFactsBackfilledAt IS NULL`. On the next run, the cursorFilter requires `createdAt > lastCreatedAt OR (createdAt = lastCreatedAt AND profileId > lastProfileId)` (L64-72), which strictly excludes anything at-or-before the cursor. Since every failed profile in the slice sorts at-or-before the slice's last element, failed profiles are filtered out and never retried within the self-reinvoke chain. The termination comment (L207-212) asserts the chain stops 'once every profile has been processed by either path' — but failed profiles are neither processed nor revisited; the chain terminates leaving them un-backfilled. Impact is bounded: failures are captured in Sentry (L182-189) and a fresh trigger (cursor=null) re-scans from the start and picks them up again because they are still NULL. So this is incomplete-backfill-until-manual-re-trigger, not data loss. A single transient Neon/transaction blip on one profile is enough to drop it from the entire chain.

## Recommendation

Either (a) advance the cursor only past the highest SUCCESSFULLY-processed (or deliberately-skipped) profile, retrying failures on the next run; or (b) keep advancing but re-run the chain until a full pass yields zero failures; or (c) at minimum, correct the termination comment and emit a summary metric of profiles left NULL so ops know a re-trigger is required. Because failures keep the marker NULL, simply NOT advancing the cursor past the first failed profile would let the IS NULL filter naturally re-pick it on the next run.

## Revalidation

**Verdict:** true-positive

I traced the full self-reinvoke logic and the finding's mechanism is correct. The keyset cursor filter (L64-72) is a strict `or(gt(createdAt, last), and(eq(createdAt, last), gt(profileId, last)))`, which excludes everything at-or-before the cursor. The next cursor is unconditionally set to the slice's LAST element (L215-220) regardless of per-profile success. Per-profile failures are caught inside the `process-batch-*` step (L177-195) and only increment a counter — the `memoryFactsBackfilledAt` marker is set solely on the success path inside the transaction (L153-159), so a failed profile stays NULL. Crucially, because the failure is caught *inside* the step.run, the step itself returns normally and Inngest does not replay it, so there is no automatic retry. On the next chained run, any failed profile from the prior slice sorts strictly before the cursor and is therefore excluded by the cursorFilter even though it is still NULL — so it is never revisited for the remainder of the self-reinvoke chain (which only exists when capped, i.e. >5000 NULL profiles). The chain terminates when a run is not capped, leaving those profiles un-backfilled; the L207-212 termination comment ('once every profile has been processed by either path') is inaccurate for failed profiles. Impact is bounded exactly as described: not data loss, failures are captured in Sentry (L182-189), and a fresh cursor=null trigger re-scans from the start (the rows are still NULL) and re-picks them. This is a genuine reliability/logic bug requiring an operator to notice and manually re-trigger. BUG severity is appropriate (correctness bug, not a security vulnerability).

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-22)
