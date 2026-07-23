---
title: WI-1704 Evidence Links Bounce Repair — Implementation Plan
date: 2026-07-23
profile: code
work_items: [WI-1704]
spec: docs/specs/2026-07-06-verified-learning-loop.md
status: in-progress
---

# WI-1704 Evidence Links Bounce Repair — Implementation Plan

**Goal:** Repair PR #2532 so the evidence-links substrate is migration-compatible,
implements the full shared learner-source contract, and cannot expose or mutate
server-owned verified Challenge evidence incorrectly.

**Approach:** Rebase the owned branch onto current `origin/main`, regenerate the
branch-only migration chain, and keep the artifact-source column nullable for the
compatible-writer rollout. Add each missing behavior through a focused failing
regression, then verify the complete branch against a freshly fetched base before
committing, pushing, and updating the existing PR body.

## Scope

In scope:

- `apps/api/drizzle/` branch migration SQL, snapshots, journal, and rollback note
- `packages/schemas/src/` evidence-link, learner-source, proof/recap/progress contracts and tests
- `packages/database/src/schema/` artifact/evidence-link storage and database repository tests
- `apps/api/src/services/` learner-source assembly, evidence resolution, Challenge persistence,
  proof/recap mapping, library search, learner note CRUD, and focused tests
- `apps/mobile/src/` proof consumers and focused tests where typed availability reaches rendering
- `docs/plans/2026-07-23-wi-1704-bounce-repair.md`
- PR #2532 body and branch `WI-1704`

Out of scope:

- Distinguishing `loadVerifiedProofMap` legitimate absence from infrastructure outage
- Live/staging/production database access
- Paid/live LLM evaluation, production flag changes, deployment, merge, or Cosmo lifecycle writes
- The later artifact-source `NOT NULL` contraction before every deployed writer emits non-null values

## Tasks

- [x] T1: Rebase and regenerate migration ancestry — done when branch migrations follow current
  main's `0152_wi2386_consent_purpose_required`, journal ordinals and snapshot `prevId` values form
  one chain, the artifact-source expansion remains nullable, and migration compatibility checks pass.
- [x] T2: Implement the full shared `LearnerSource` substrate — done when schema tests first fail and
  then pass for all four discriminants and metadata, assembler tests cover every source store plus
  cross-profile isolation, and evidence-link endpoints/constraints represent the required directional
  citation and artifact-provenance relationships without transcript content.
- [x] T3: Block mixed-state whole-event verification — done when the same-answer-event
  solid-plus-misconception regression fails at the old behavior and passes with no verified artifact
  persisted from that event.
- [x] T4: Propagate unavailable evidence safely — done when fresh verified notes without links and
  purged targets retain the verified fact but expose a null quote plus typed `evidenceAvailability`
  through API/recap/mobile consumers, with no transcript fallback.
- [x] T5: Isolate server-owned Challenge artifacts from learner surfaces — done when negative search,
  update, and delete regressions fail at the old behavior and pass only for learner-authored,
  unverified rows.
- [ ] T6: Verify and deliver the exact branch state — done when focused suites, TypeScript/schema
  checks, the repository's full unbypassed pre-push gate, `git diff --check`, current-main migration
  ancestry/mergeability checks, and worktree cleanliness all pass; the repo-standard commit workflow
  pushes the exact head and PR #2532 truthfully records repairs, caveat/follow-up, evidence, and
  execution boundaries.

## Tests

- **T1:** migration/journal checker plus schema/database migration-focused tests; direct journal ordinal
  and snapshot ancestry assertions against current `origin/main`.
- **T2:** `packages/schemas/src/evidence-links.test.ts`,
  `apps/api/src/services/learner-source.test.ts`, and `apps/api/src/services/evidence-links.test.ts`.
- **T3:** `apps/api/src/services/session/session-exchange-challenge-finalize.test.ts` same-event
  solid-plus-misconception case.
- **T4:** `apps/api/src/services/parent-proof.test.ts`, recap mapper/schema tests, and proof-component
  tests for missing/purged evidence.
- **T5:** `apps/api/src/services/library-search.test.ts` plus note service/route update-delete negatives.
- **T6:** focused commands recorded during red/green loops, then the repo's complete pre-push command
  with hooks/gates unbypassed.
