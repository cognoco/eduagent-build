# [BUG] Pending celebration writes can still lose concurrent updates

**File:** [`apps/api/src/services/home-surface-cache.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/home-surface-cache.ts#L224-L245) (lines 224, 225, 237, 244, 245)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

mergeHomeSurfaceCacheData locks the row for cardData merges, but pendingCelebrations is replaced wholesale from options.pendingCelebrations. The exported writeHomeSurfacePendingCelebrations helper only accepts a fully materialized array, so callers that read the current pending list, append/prune outside the lock, and then call this helper can race: two concurrent writers can both read the same old list and the last update drops the other's celebration.

## Recommendation

Move pending celebration mutation inside the SELECT FOR UPDATE critical section. For example, make the helper accept a mergePendingCelebrations(currentPending) callback or provide append/prune helpers that compute from lockedRow.pendingCelebrations after the lock is acquired.

## Revalidation

**Verdict:** true-positive

Confirmed real. mergeHomeSurfaceCacheDataInTx acquires a SELECT ... FOR UPDATE row lock (lines 204-208) for the cardData merge, but pendingCelebrations is written wholesale from options.pendingCelebrations, ignoring lockedRow.pendingCelebrations whenever the option is provided (lines 226-229). The merge callback never touches pendingCelebrations. The exported writeHomeSurfacePendingCelebrations always supplies a fully-materialized array, so the lock serializes the WRITE but the array being written was computed from a read taken BEFORE the lock. Both production callers exhibit the lost-update pattern. queueCelebration (celebrations.ts:83-128) reads `existing` via findHomeSurfaceCache OUTSIDE any transaction, computes pendingCelebrations = [...existing, nextEntry], then opens a transaction and writes that precomputed array; two concurrent queues for the same profile both read [A], one writes [A,B] and commits, the second (which was blocked on FOR UPDATE) then overwrites with its stale [A,C], dropping B. getPendingCelebrations (celebrations.ts:155-175) reads `pending`, computes `pruned`, and writes pruned with no lock at all — a concurrent queue's new entry can be clobbered by the prune. The recordCelebrationEvent table is durable, but the pendingCelebrations list in the cache genuinely loses entries. The finding's high confidence and recommendation (mutate inside the critical section via a mergePendingCelebrations(current) callback computed from lockedRow.pendingCelebrations) are correct. BUG severity is appropriate: impact is a missed celebration animation in a TTL'd cache, not data integrity or access control — so no severity change.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-22)
