---
title: WI-104 E2E Cleanup Run ID — Implementation Plan
date: 2026-05-29
profile: code
work_items: [WI-104]
spec: https://www.notion.so/3678bce91f7c81a7b97bfa73ea1f5798
status: in-progress
---

# WI-104 E2E Cleanup Run ID — Implementation Plan

**Goal:** Ensure the per-run Playwright web cleanup step deletes the same seed accounts that the Playwright suite creates.
**Approach:** Pin the workflow contract with a structural Jest test first. Then make `.github/workflows/e2e-web.yml` expose a deterministic `PLAYWRIGHT_RUN_ID` to both the test process and the later cleanup shell step, and remove the silent `fallback` prefix path that can miss seeded accounts.

## Scope

In scope:
- `.github/workflows/e2e-web.yml` — Playwright web workflow env and cleanup prefix derivation.
- `scripts/e2e-web-cleanup.test.ts` — structural regression tests for workflow cleanup wiring.
- `docs/plans/2026-05-29-wi-104-e2e-cleanup-run-id.md` — this execution plan.

Out of scope:
- `.github/workflows/e2e-web-cleanup.yml` nightly workflow behavior; it intentionally calls `/v1/__test/reset` without a prefix.
- `apps/api/src/services/test-seed.ts` and `/v1/__test/reset`; existing tests already cover no-prefix and prefix-scoped deletion safety.
- Playwright journey behavior.
- Database schema, seed scenarios, Clerk cleanup internals, and Doppler config.

## Tasks

- [x] T1: Add a failing structural test proving the workflow gives the cleanup step a non-fallback run ID — done when `scripts/e2e-web-cleanup.test.ts` fails because `run-smoke.env.PLAYWRIGHT_RUN_ID` is absent and/or the reset shell still contains `fallback`.
- [x] T2: Update `.github/workflows/e2e-web.yml` so `PLAYWRIGHT_RUN_ID` is defined at job scope from GitHub run metadata and the reset step errors instead of inventing `pw-fallback-` — done when the T1 test passes.
- [x] T3: Run scoped validation for the changed workflow/test surface — done when `pnpm exec jest --config apps/api/jest.config.cjs --testMatch '**/scripts/e2e-web-cleanup.test.ts' --runInBand --no-coverage` passes, and `git diff --check` reports no whitespace errors.
- [ ] T4: Commit through the repo commit workflow — done when the branch has a pushed commit for WI-104.
- [ ] T5: Complete adversarial review loop — done when a subagent review finds no valid blocker, must-fix, or should-fix issues.
- [ ] T6: Open PR and monitor CI/reviews — done when CI passes and no valid blocker, must-fix, or should-fix automated review findings remain.

## Tests

T1 adds structural expectations to `scripts/e2e-web-cleanup.test.ts`:

- `run-smoke.env.PLAYWRIGHT_RUN_ID` exists and is based on `${{ github.run_id }}` plus `${{ github.run_attempt }}`.
- The reset step does not contain the literal fallback prefix path.
- The reset step explicitly errors when it cannot derive a cleanup prefix.

## Spec Coverage

- WI-104 original finding: cleanup can use a fallback prefix that does not match the Playwright run. Covered by T1 and T2.
- Safety constraint: do not broaden the per-run cleanup to unrelated parallel runs. Covered by keeping prefix-scoped reset for `e2e-web.yml`; nightly no-prefix cleanup remains out of scope and already relies on API seed-account guards.
