# Codex Pilot Shepherd Findings — Coverage Debt

## 2026-07-06 — Status requests became a pause point

What happened / observed: After the operator asked for a status report, I answered accurately but stopped instead of continuing lane processing. The active Codex instruction says status requests should be answered and work should continue unless explicitly paused.

Scope: General Codex shepherd behavior gap, amplified by Quartet/Cosmo protocol density.

Proposed fix: Add a Codex runtime-binding rule: "status/reporting turns are non-pausing; after responding, resume the current lane action unless the user explicitly says pause/stop/report only."

Severity for lane throughput: High. It can idle a lane even when there are ready next actions.

## 2026-07-06 — F35 landing gate over-applied before execution

What happened / observed: I treated the F35 rhythm as a broad caution point instead of the narrower rule it is. F35 blocks `/cosmo:execute complete` until the orchestrator lands the PR and returns the squash SHA; it does not block builder dispatch, refinement, research, or opening the PR.

Scope: General Quartet/Cosmo protocol clarity gap for Codex-hosted shepherds.

Proposed fix: Amend the shepherd/runbook wording with a short F35 checklist: "build/open PR continues; complete waits for `[orch-land]`."

Severity for lane throughput: High. It can stop execution before the actual gate.

## 2026-07-06 — Backlog refinement was under-pipelined

What happened / observed: I triaged and ordered the P2 backlog, then advanced only the immediate next item instead of keeping later Backlog items moving through refine while the active item was executing or waiting on external gates.

Scope: General shepherd behavior gap; not Codex-runtime-specific.

Proposed fix: Add an explicit lane-driving invariant: when execution is delegated or gate-waiting, the shepherd should continue refining/ordering the next eligible items unless a hard dependency or WIP limit forbids it.

Severity for lane throughput: High. It serializes work that the lane charter expects to flow.

## 2026-07-06 — Attended-only execution; no self-wake on inbox/timers

What happened / observed: The session did not advance during the 22:21Z-06:30Z quiet window and resumed only after a human interaction. External watchers can append logs and detect Clacks changes, but this Codex shepherd session does not autonomously wake and reason on inbox lines or timers while unattended.

Scope: Codex runtime-specific limitation for this pilot configuration.

Proposed fix: Orchestrator layer should compensate with external wake/dispatch or treat Codex shepherds as attended actors. If unattended autonomy is required, introduce a separate scheduler that launches Codex with a fresh prompt on inbox changes/timers.

Severity for lane throughput: Critical for overnight or unattended lane ownership.

## 2026-07-06 — Nested Codex exec cannot reach Notion over REST/API/CLI

What happened / observed: The main shepherd shell can query Notion through REST and the 4ier `notion` CLI. Nested `codex exec` sessions see `NOTION_TOKEN`, but REST fails with `HttpRequestException` and no HTTP status; read-only reported connection refused at `127.0.0.1:9`. The `notion` CLI is visible inside exec but query exits 1.

Scope: Codex runtime-specific executor sandbox/network behavior.

Proposed fix: Until runtime egress/proxy behavior is fixed, keep all Cosmo lifecycle mechanics in the shepherd shell and pass lifecycle state into builders via briefs/artifacts. Codex exec should not be expected to claim, complete, or query Notion.

Severity for lane throughput: Medium-high. Work can proceed, but lifecycle I/O must be centralized and cannot be delegated to executors.

## 2026-07-05 — Windows worktree setup via Bash produced native-Git/pnpm friction

What happened / observed: Bash worktree setup produced an MSYS `/mnt/c` gitdir path that native Git treated as invalid, and `pnpm install` hit an MSYS-path `EACCES` rename. Recovery required `git worktree repair` plus native PowerShell `pnpm install --frozen-lockfile` and `pnpm env:sync`.

Scope: Codex-on-Windows runtime/repo tooling gap.

Proposed fix: Prefer native PowerShell worktree setup on Windows, or make the Codex binding run a native repair/verification step before dispatch. Also guard against `pnpm env:sync` modifying `apps/mobile/eas.json`.

Severity for lane throughput: Medium. Recoverable, but each new parallel worktree pays setup tax and risk.

## 2026-07-05 — Codex exec parent timeout is not reliable completion state

What happened / observed: A builder `codex exec` parent process hit a one-hour timeout while the underlying session later completed and wrote its report. Correct reconciliation required reading the `-o` report plus direct Git/Cosmo checks.

Scope: Codex runtime-specific long-run behavior.

Proposed fix: Codex binding should define timeout reconciliation: check report file, process state, worktree diff, PR state, and Cosmo state before retrying or declaring failure.

Severity for lane throughput: Medium. Without this rule, the shepherd may duplicate work or abandon successful executor runs.

