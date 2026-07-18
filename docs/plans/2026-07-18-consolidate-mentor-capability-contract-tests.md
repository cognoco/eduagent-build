---
title: Consolidate Mentor Capability Contract Tests — Implementation Plan
date: 2026-07-18
profile: change
work_items: [WI-2222]
spec: .workitem-artifacts/WI-2222/workitem.json
status: ready-to-publish
---

# Consolidate Mentor Capability Contract Tests — Implementation Plan

**Goal:** Make one test-only Mentor capability table drive the existing deterministic matcher, closed-route, learner-scope, adversarial, and session-composition boundaries without adding product behavior or a second corpus.
**Approach:** Export a small discriminated case contract from `@eduagent/test-utils`, then replace only the duplicated deterministic rows in each existing suite with table-driven assertions. Keep the adversarial fuzz corpus intact, reuse the current mobile development dependency and project reference, and prove detection power with a disposable wrong-expectation mutation followed by exact restoration.

## Scope

In scope:
- `packages/test-utils/src/lib/mentor-capability-cases.ts` — define `MentorCapabilityCase` and the five deterministic cases: catalog jump, freeform Mentor session, clarification, unsupported route, and wrong-scope denial.
- `packages/test-utils/src/index.ts` — expose the test-only contract through the package barrel.
- `apps/mobile/src/lib/bar-intent-match.test.ts` — consume the shared matcher expectations and exact raw inputs.
- `apps/mobile/src/lib/bar-intent-match.adversarial.test.ts` — include the shared deterministic rows in the existing property corpus and assert their mapped matcher outcomes without removing fuzz coverage.
- `apps/mobile/src/lib/now-deep-link.test.ts` — expand the shared catalog-jump route through the closed deep-link mapper.
- `apps/mobile/src/app/(app)/mentor.test.tsx` — exercise learner jump/session/clarification behavior and person-scope denial from the shared rows.
- `tests/integration/learning-session.integration.test.ts` — use the shared freeform row as the deterministic Mentor opener for the existing mobile/API/session composition proof.
- `docs/evidence/WI-2222/verification.md` — record exact baseline, mutation, restored, and final commands with observed suite/test counts.
- `.workitem-artifacts/WI-2222/completion-summary.md` and `.workitem-artifacts/WI-2222/evidence.json` — local, non-finalizing artifacts required by `complete --validate`.
- This plan.

Out of scope:
- Product code, backend wire contracts, schemas, migrations, prompts, live-LLM expansion, and new Maestro or Playwright journeys.
- Gate notes, BID-13, WI-2094, WI-2099, supporter surfaces, flow inventory, and downstream journey items.
- Package, Jest, TypeScript, workspace, or lockfile edits unless a focused test proves the existing mobile `devDependency` and project reference cannot resolve `@eduagent/test-utils`.

## Tasks

- [x] T1: Capture the pre-change boundary baseline — done when the four existing mobile consumer suites pass together under `apps/mobile/jest.config.cjs` with exact suite/test counts recorded, and the existing learning-session composition suite is identified by its focused test name.
- [x] T2: Add the shared test-only case contract and convert deterministic consumers — done when all five required outcomes have explicit matcher expectation, scope, expected route (or explicit denial), and exact raw input where applicable; every named consumer executes assertions derived from the table; duplicated deterministic rows are removed while unrelated variants and the adversarial/property corpus remain.
- [x] T3: Prove mutation detection and restore exactly — done when one expected outcome is deliberately changed only in the working tree, every boundary that consumes that mapped outcome fails for the expected mismatch, the candidate bytes are restored without a mutation commit, and the same focused suites return green.
- [x] T4: Verify the complete delivery surface — done when impacted Jest suites, the focused learning-session integration test, mobile typecheck, mobile lint, `pnpm prepush`, `pnpm format:check`, `git diff --check`, and non-mutating `complete --validate` all exit zero with commands and counts recorded.
- [ ] T5: Commit and push without lifecycle finalization — done when the surgical file set is committed with hooks enabled, `HEAD` is pushed explicitly to `wi-2222-mentor-capability-contract-tests` without force, the live claim remains `Executing` for `builder:codex:WI-2222`, and no PR or `complete`/review/close mutation is performed.

## Evidence commands

```bash
rtk pnpm exec jest --config apps/mobile/jest.config.cjs --runTestsByPath \
  "$PWD/apps/mobile/src/lib/bar-intent-match.test.ts" \
  "$PWD/apps/mobile/src/lib/bar-intent-match.adversarial.test.ts" \
  "$PWD/apps/mobile/src/lib/now-deep-link.test.ts" \
  "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" \
  --runInBand --forceExit --no-coverage
rtk pnpm exec jest --config tests/integration/jest.config.cjs --runTestsByPath \
  "$PWD/tests/integration/learning-session.integration.test.ts" \
  --runInBand --forceExit --no-coverage \
  --testNamePattern 'persists a question opener before a Yes follow-up'
rtk pnpm exec nx run @eduagent/mobile:typecheck
rtk pnpm exec nx run @eduagent/mobile:lint
rtk pnpm prepush
rtk pnpm format:check
rtk git diff --check
rtk bun /home/vetinari/.codex/plugins/cache/zdx-marketplace/cosmo/0.8.2/skills/execute/execute.ts complete .workitem-artifacts/WI-2222 green --validate
```
