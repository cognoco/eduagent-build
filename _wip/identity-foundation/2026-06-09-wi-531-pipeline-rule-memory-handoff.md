---
title: WI-531 pipeline-rule memory handoff
date: 2026-06-09
status: HANDOFF FOR HARNESS HYGIENE EXECUTION
owner: Harness Hygiene / ZDX lifecycle toolchain
source_stream: Identity Foundation instruction-surface cleanup QA
---

# WI-531 Pipeline-Rule Memory Handoff

## Purpose

This handoff packages the memory rows that should be handled by `WI-531` before
the broad memory tidy in `WI-387`. The cleanup stream should not broadly prune
these rules until `WI-531` extracts any still-valuable pipeline behavior into
the owning substrate and proves parity.

Durable tracker:
`/Users/vetinari/nexus/_WIP/zdx-productionization/harness-hygiene-tracker.md`.

## Extraction Bias

Treat commit, hook, CI, PR, and review memories as left-ratchet material by
default. Keep only rules that are still valuable after the Harness Hygiene
substrate exists. Prefer deletion after extraction over live memory pointers.

Useful targets:

- Commit CORE and repo overlays for commit/staging rules.
- Change-class validation contract for test/eval/E2E scope.
- CI/workflow docs or hooks for pipeline mechanics.
- PR/ship/fix-ci skills for review and branch-protection workflows.
- `AGENTS.md` / `CLAUDE.md` convergence only for genuinely runtime-visible
  doctrine that must be reinforced.

## Candidate Cluster

| Memory | Current claim | Proposed WI-531 handling |
|---|---|---|
| `.claude/memory/feedback_agents_commit_push.md` | Subagents do not commit from coordinator worktree; coordinator owns `/commit`, with isolated-worktree exceptions. | Extract concurrency rule to Commit CORE or repo commit overlay; keep only a short doctrine reinforcement if needed. |
| `.claude/memory/feedback_partial_staging_stash.md` | Partial commits require stash handling because hooks see the whole worktree. | Verify against current commit skill. Delete if already covered by partial-staging flow and failure-recovery reference. |
| `.claude/memory/feedback_commit_skip_failing.md` | If pre-commit fails on some files, unstage them, commit passing files, fix failures later. | Presume obsolete unless Commit CORE deliberately supports this classification. Avoid encoding a broad skip habit. |
| `.claude/memory/feedback_nx_reset_before_commit.md` | Run `pnpm exec nx reset` for phantom module-boundary errors. | Tie to Nx cache correctness work. Delete once cache/hook substrate no longer needs human memory. |
| `.claude/memory/feedback_batch_pr_fixes.md` | Batch PR review fixes, validate locally, push once. | Move only if PR/ship/fix-ci workflow still needs it; otherwise delete as process preference. |
| `.claude/memory/feedback_verify_full_ci.md` | On CI failure, run full validation. | Replace with change-class validation and CI repair workflow; avoid blanket full-suite left ratchet. |
| `.claude/memory/feedback_pr_required_checks.md` | Missing required checks may be branch-protection or workflow-trigger drift. | Move to PR/CI diagnostic protocol if still current. |
| `.claude/memory/feedback_testing_no_mocks.md` | No new internal `jest.mock()`; external-boundary mocks allowed. | Keep only if not already covered by AGENTS/quality guardrails and CI rules. |
| `.claude/memory/feedback_e2e_never_skip.md` | Never skip E2E tests. | Presume obsolete as blanket policy; replace with change-class E2E gate. |
| `.claude/memory/feedback_e2e_release_gate.md` | Release-blocking E2E requires full suite, ledger, investigation, repeat green. | Move to release validation contract if still current. |
| `.claude/memory/project_commit_skill_drift.md` | `.claude/skills/commit` and `.agents/skills/commit` diverged before sync existed. | Route through Commit CORE adoption and skill sync convergence; delete memory when state is represented in tracker/docs. |
| `.claude/memory/project_ci_infrastructure.md` | CI path filters, E2E APK cache, Nx cache, pre-commit details. | Promote current facts to CI docs or ZDX config; delete dated infrastructure drift. |
| `.claude/memory/project_sync_script_extension.md` | Sync scripts should generalize only after a third sync need. | Route to agent-doc convergence/sync design; delete if stale after `WI-386`. |

## Already Handled In This Cleanup Stream

Do not reprocess these as `WI-531` work:

- `.claude/memory/feedback_precommit_typecheck.md` deleted as duplicate
  left-ratchet material.
- `.claude/memory/feedback_no_suppression.md` deleted as duplicate of current
  engineering rules.
- `.claude/memory/feedback_git_pathspec_literal_brackets.md`,
  `.claude/memory/feedback_git_stash_pop_kept.md`, and
  `.claude/memory/feedback_stash_untracked_protection.md` deleted after
  verifying the commit skill and failure-recovery reference cover the
  operational footguns.
- `.claude/memory/feedback_build_dedup.md`,
  `.claude/memory/feedback_eas_no_retry.md`,
  `.claude/memory/feedback_e2e_runbook.md`, and
  `.claude/memory/feedback_ota_env_vars.md` deleted after verifying build/E2E
  skills and OTA docs cover the durable behavior.

## Gate For WI-387

`WI-387` should stay pinned after this handoff until `WI-531` records, for each
candidate above, either:

- the target canonical/operational home and the commit that moved the rule, or
- an explicit decision that the memory was stale or left-ratchet material and
  should be deleted.
