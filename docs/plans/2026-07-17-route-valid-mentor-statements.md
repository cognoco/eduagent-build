---
title: Route Valid Mentor Statements — Implementation Plan
date: 2026-07-17
profile: code
work_items: [WI-2094]
spec: _wip/mvp-roadmap/refinements/refine-BID-13-mentor.md
status: in-progress
---

# Route Valid Mentor Statements — Implementation Plan

**Goal:** Ensure every enabled learner Mentor submission produces an observable result while preserving closed-catalog jumps and existing question-to-freeform routing.
**Approach:** Drive the change through `LearnerMentorScreen` component behavior. Extend the deterministic matcher so substantive declaratives become Mentor turns while short, ambiguous, unsupported-catalog, and unmatched navigation-style inputs remain uncertain; render a visible clarification for the uncertain result instead of repeating the existing light-practice state.

## Scope

In scope:
- `apps/mobile/src/lib/bar-intent-match.ts` — distinguish substantive declaratives from uncertain navigation/ambiguity without broadening the closed route catalog.
- `apps/mobile/src/app/(app)/mentor.tsx` — route matcher outcomes and render learner-scope clarification state.
- `apps/mobile/src/app/(app)/mentor.test.tsx` — behavior-first coverage at the input/send/navigation boundary, including the 360px interaction case; convert its three pre-existing shadow internal mocks to `jest.requireActual()` plus targeted overrides under GC6.
- `docs/evidence/WI-2094-mentor-statements-red-green.md` — immutable baseline/candidate/revert/restore SHAs, exact commands, and raw outputs.
- `.workitem-artifacts/WI-2094/completion-summary.md` and `.workitem-artifacts/WI-2094/evidence.json` — AC-mapped completion drafts for the shepherd.
- This plan.

Out of scope:
- `MentorScreen` supporter-hub/person dispatch and shared setup.
- `SupportHubMentorTab`, session creation/persistence, Challenge Round behavior, and `WI-2112` challenge-mode routing.
- Batch properties, PR creation/merge, Cosmo completion, and cleanup.

## Tasks

- [ ] T1: Add learner Mentor boundary regressions before production changes — done when targeted Jest fails on the clean baseline because both exact neon declaratives do not navigate and ambiguous/unsupported inputs do not reveal clarification; the suite also covers arrow press, keyboard submit, editing then submit, exact freeform params, question behavior, a closed-catalog jump, and interactive 360px scroll containment.
- [ ] T2: Implement the minimum routing and clarification behavior — done when the T1 suite passes with exact `rawInput`, deterministic jumps unchanged, and uncertain submissions producing a visible `mentor-bar-clarification` state.
- [ ] T3: Preserve regression detection with immutable RED/GREEN/REVERT/RESTORE runs — done when a disposable production-fix revert commit reproduces the original failures, the restored candidate passes, and the evidence file names every immutable SHA and retains raw command output.
- [ ] T4: Verify the complete mobile change surface — done when all impacted suites plus `pnpm exec nx run @eduagent/mobile:typecheck`, `pnpm exec nx run @eduagent/mobile:lint`, `pnpm prepush`, and `pnpm format:check` exit zero; Node 24 versus the requested Node 22 is recorded if no Node 22 runtime is available.
- [ ] T5: Review and hand off — done when the deep runtime-assumption review finds no unresolved blocker, Cosmo draft artifacts pass local validation, and the repo commit skill commits and pushes only the scoped files to `origin/WI-2094` with hooks enabled and no PR.

## Tests

- T1: `pnpm --filter @eduagent/mobile exec jest 'src/app/(app)/mentor.test.tsx' --runInBand --no-coverage`
- T2: Repeat T1 and run all matcher/input-bar impacted suites.
- T3: Run the same targeted command at baseline-with-tests, candidate, production-revert, and restored candidate; record Jest suite/test counts and exit codes.
- T4: Run the full command set from the live item brief, then re-run the targeted regression after all formatting/artifact edits.
