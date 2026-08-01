---
title: Windows Worktree Setup Recovery — Implementation Plan
date: 2026-08-01
profile: code
work_items: [WI-2828]
status: complete
---

# Windows Worktree Setup Recovery — Implementation Plan

**Goal:** Make the sanctioned Windows entry path use Git for Windows Bash and make retries after partial branch creation safe without deleting ambiguous state.
**Approach:** Add executable regression coverage around the real setup scripts, reject WSL before any Git mutation, and teach the existing helper to reuse only a branch that is provably an untouched `origin/main` baseline. Keep dependency installation, environment sync, and non-Windows behavior unchanged.

## Scope

In scope:

- `scripts/setup-worktree.sh` — pre-mutation WSL refusal and validated partial-branch recovery.
- `scripts/setup-worktree.ps1` — explicit PowerShell entry point that selects Git for Windows Bash.
- `scripts/setup-worktree-windows-recovery.test.ts` — executable Windows/runtime and retry regression coverage.
- `.agents/skills/worktree-setup/SKILL.md` and generated `.claude/skills/worktree-setup/SKILL.md` — Windows invocation and recovery guidance.
- This plan.

Out of scope:

- Changing canonical `.worktrees/<branch>` placement.
- Skipping `pnpm install` or `pnpm env:sync`.
- Deleting dirty, non-baseline, remotely published, registered, or otherwise ambiguous branch/worktree state.
- Changing general Git, worktree, or stash policy outside this setup path.

## Tasks

- [x] T1: Add real-script regressions for WSL refusal, native Windows metadata, successful bootstrap, safe baseline-branch retry, and unsafe-state preservation — done when the new focused suite fails against the pre-fix scripts for the missing runtime/retry behavior.
- [x] T2: Add the PowerShell launcher and pre-mutation WSL guard — done when the focused suite proves the Windows entry uses Git for Windows Bash, produces native-readable worktree metadata, and a simulated WSL invocation leaves no branch or worktree.
- [x] T3: Add validated partial-branch recovery — done when an unpublished, unregistered branch exactly at `origin/main` is reused, while divergent/published/registered branches and unvalidated directories are preserved and refused.
- [x] T4: Update and synchronize the worktree-setup skill — done when the canonical skill documents the PowerShell entry and safe retry behavior, generated skill copies match, and skill synchronization is clean.
- [x] T5: Run focused and repository validation — done when setup-worktree suites, PowerShell contract checks, lint/type/change-class checks, red-green-revert evidence, and the repository commit/push gates pass.
