# Mentor-Memory Read-Path Consolidation — Shared Backbone

**Date:** 2026-05-08
**Owner:** ZK
**Size:** S
**Status:** Spec — not yet implemented

## Goal

Eliminate drift between the learner self-view and the parent child-view of mentor-memory by routing both through a single canonical projection. New memory fields, categories, or filtering rules added once flow to both views automatically.

**Not goal:** consolidate the two endpoints into one, or change either view's presentation. Both keep their existing shape and audience.

## Why this is needed

Today, two paths read the same underlying data:

| View | Hook | Endpoint | Service | Shape |
|---|---|---|---|---|
| Learner self (`(app)/mentor-memory.tsx`) | `useLearnerProfile()` | `GET /learner-profile` | `getLearningProfile()` | Raw `learning_profiles` JSONB row |
| Parent child (`child/[profileId]/mentor-memory.tsx`) | `useChildLearnerProfile()` + `useChildMemory()` | `GET /dashboard/children/:profileId/memory` | `buildCuratedMemoryViewForProfile()` | `CuratedMemoryView` (categorized) |

Both ultimately hydrate from `learning_profiles` (and `memory_facts` when the read flag is on, via `memory-facts.ts`), but the parent path runs the data through a categorization layer (`CATEGORY_CONFIG`, `STYLE_FIELD_LABELS`, strength/struggle/interest builders) that the learner path bypasses entirely.

**Risk:** when a new field is added to `learning_profiles` (e.g., a new "communication note" sub-type, a new struggle metadata column, a confidence band on strengths), the parent view gets it via `buildCuratedMemoryViewForProfile`'s explicit wiring; the learner view either silently drops it or requires a parallel wiring change to `mentor-memory.tsx`. The two paths drift, and neither test suite catches it because the drift is one-sided.

This is not a data-correctness bug today. It is a maintenance trap that gets worse as the memory model gains fields.

## What this PR adds

### Shared canonical projection

Define `MemoryProjection` as the single canonical in-memory shape for one profile's memory state. Already partially present in `services/memory/backfill-mapping.ts` — extend if needed.

Both paths read through this projection:

```
learning_profiles row + memory_facts (when flag on)
        ↓
   getMemoryProjection(db, profileId)   ← single source of truth
        ↓
   ┌────────────┴────────────┐
   ↓                         ↓
toLearnerSelfView()    toCuratedView()
   ↓                         ↓
GET /learner-profile   GET /dashboard/children/:id/memory
```

### Service changes

In `services/memory/` (or `services/curated-memory.ts`, depending on what reads cleanest):

- `getMemoryProjection(db, profileId)` — single function that hydrates a profile's memory state into the canonical projection. Reuses `getLearningProfile()` + `readMemorySnapshotFromFacts()` internally; reading order respects the existing `MEMORY_FACTS_READ_ENABLED` env flag.
- `toLearnerSelfView(projection)` — current learner-profile response shape, derived from the projection. Replaces the direct JSONB read in the route.
- `toCuratedView(projection)` — current `CuratedMemoryView` shape, derived from the projection. Replaces the body of `buildCuratedMemoryViewForProfile()`.

### Route changes

Two routes get smaller:

- `GET /learner-profile` (`apps/api/src/routes/learner-profile.ts:47`) — calls `getMemoryProjection` then `toLearnerSelfView`.
- `GET /dashboard/children/:profileId/memory` (`apps/api/src/routes/dashboard.ts:196`) — same projection plus `toCuratedView`. The existing `assertParentAccess` and `assertChildDashboardDataVisible` guards stay exactly as today.

No public response-shape changes. Mobile hooks, screens, and components remain on their existing contracts.

### Drift guard

Add one cross-projection test in `services/memory/projection.test.ts`:

> Every field in `MemoryProjection` is reachable from both `toLearnerSelfView()` and `toCuratedView()` outputs (or is explicitly listed in a `PROJECTION_OPT_OUT` set with a one-line reason). Adding a new field to `MemoryProjection` without wiring it into both views fails this test in CI.

This is the actual drift fix. Without it, the refactor is just moving the problem.

## Walkthrough per surface

**Learner self-view, no memory yet:** unchanged. Empty projection → empty view. Risk: zero.

**Learner self-view, populated:** unchanged. Same fields appear. Risk: low (regression risk on the projection mapping; covered by tests).

**Parent child-view, no memory:** unchanged. Empty projection → empty curated view. The existing "no profile" branch (returns settings-only) stays as-is.

**Parent child-view, populated:** unchanged. Same categories, same items, same statements.

**Parent child-view, child consent restricted:** unchanged. The existing `assertChildDashboardDataVisible` guard short-circuits before any projection read.

**`MEMORY_FACTS_READ_ENABLED` flag flips:** projection function honors the flag identically to today's read path. Both views switch in lockstep — currently they could diverge if one route read the flag and the other didn't.

**New field added to `learning_profiles` after this PR:** projection extends, both views render the new field automatically (or fail the drift-guard test until the wiring is added).

**Edit/delete/suppress/tellMentor mutations from learner screen:** out of scope. Mutations continue to write to `learning_profiles` directly via the existing service paths. This PR is read-side only.

## Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Projection mapping bug | Refactor regression | Field disappears or shows wrong value in one or both views | Caught by drift guard + existing route tests |
| `MEMORY_FACTS_READ_ENABLED` mismatch between env and projection | Env flag drift | Stale or empty memory items | Existing flag-aware logic centralized → only one read path to fix |
| New field added but not in projection | Future PR | Field absent from both views (consistent) | Drift guard fails CI; PR blocked |
| New field in projection but missing from one view | Future PR | Field present in one view, absent in other | Drift guard fails CI; PR blocked |
| Parent without family link reads child memory | IDOR attempt | 403 from `assertParentAccess` (unchanged) | Existing guard |

## Tests

Break tests required:

1. `getMemoryProjection` returns the same data shape for a known fixture profile under flag-on and flag-off (sourced from `memory_facts` vs JSONB).
2. `toLearnerSelfView(projection)` matches the legacy `getLearningProfile()` route response byte-for-byte for a fixture profile.
3. `toCuratedView(projection)` matches the legacy `buildCuratedMemoryViewForProfile()` output byte-for-byte for a fixture profile.
4. Drift guard: adding a hypothetical field to `MemoryProjection` without wiring it into both views fails the cross-projection test (verified by introducing a deliberately-unwired field in the test, asserting failure, removing it).
5. Empty profile: both views return their canonical empty shape from an empty projection.
6. Consent-restricted child: existing guard short-circuits before projection runs (no regression to the child-view consent gate).

## Sequencing

1. Define `MemoryProjection` (or extend the existing one in `backfill-mapping.ts`) with explicit field types.
2. Implement `getMemoryProjection()` and the two `toX` adapters.
3. Wire `GET /learner-profile` and `GET /dashboard/children/:profileId/memory` to the new path. Existing route tests must stay green with no assertion changes.
4. Add the drift-guard test.
5. Delete the now-dead body of `buildCuratedMemoryViewForProfile` if the projection adapter fully subsumes it; otherwise keep as a thin wrapper.

## Rollback

Pure refactor on the read side. Revert is safe at any commit boundary because:
- No schema changes.
- No mobile contract changes.
- No mutation paths touched.
- Both routes' response shapes are byte-stable per tests 2 and 3.

## Out of scope

- Mutation consolidation (edit/delete/suppress/tellMentor). These already share a single write path via `learning_profiles` writes; not part of this drift problem.
- UI changes on either screen.
- Adding `confidence` or supersession metadata to either view (separate backlog item).
- Merging the two endpoints into one. Different audiences, different shapes — keeping both is correct.
