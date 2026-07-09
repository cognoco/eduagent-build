# Seam Hardening — Execution Tracker

> Lane-specific working state for WS-37. The shepherd protocol
> (`../../../roles/shepherd-protocol.md`) carries process; this file carries only
> the lane facts and resume pointer.

## Charter
Original M1 seam-hardening slice: deliver and close the five M1 owner/profile seam hardening
items, then graduate WS-37. That slice is already complete.

Current question: WS-37 now contains 16 post-graduation Captured items (WI-1419..WI-1434).
Those are not automatically executable under the closed M1 charter. They require an
orchestrator routing decision before a shepherd dispatches executors.

## Canon authority
- Repo operating rules: `AGENTS.md`
- Domain vocabulary: `CONTEXT.md`
- Quartet shepherd process: `/home/vetinari/nexus/_quartet/roles/shepherd-protocol.md`
- Executor rails and Codex binding: `/home/vetinari/nexus/_quartet/roles/executor/executor-protocol.md`
  and `/home/vetinari/nexus/_quartet/roles/runtime-bindings/codex.md`
- Cosmo live state is authoritative for WI membership and lifecycle.

## How to use
Boot the Codex shepherd against this tracker and the live WS-37 page. Reconcile WS-37 member
WIs first. Do not execute WI-1419..WI-1434 until the orchestrator rules whether to reopen
WS-37 as a second hardening wave, re-home those items, or park them.

## Pointers
- Cosmo Workstream: WS-37 · `3918bce9-1f7c-8164-a1e8-c910f1c451c7`
- Workstream name: Seam Hardening
- Project repo: `/home/vetinari/nexus/_dev/eduagent-build`
- Channel: `_quartet/working/lanes/seam-hardening/_state/{inbox,outbox}.jsonl`
- Runtime: Codex shepherd; Codex executors require non-Codex reviewer coverage.

## Units / slice
| WI | Coarse status | Note |
|---|---|---|
| WI-1301 | Closed/Done | Original M1 slice; Fixed In `ec95a7ebb7dcba16f357c0746626f382823a499e`. |
| WI-1302 | Closed/Done | Original M1 slice; Fixed In `63c0c05e0e768db9ce10be7f3e72d3c45b2ca764`. |
| WI-1303 | Closed/Done | Original M1 slice; Fixed In `0a1f0a11a861b4545ed7c5808c09df740502615d`. |
| WI-1304 | Closed/Done | Original M1 slice; Fixed In `cbfd073325e2a963e54c819c1db7f5e061f10509`. |
| WI-1305 | Closed/Done | Original M1 slice; Fixed In `31e5c714c030b0d1c0ca84d99fb49630961307ca`. |
| WI-1419..WI-1434 | Captured/Active | Post-graduation captured items; require routing before execution. |

Slice scan: original M1 slice is closed. The open question is routing and prioritization for
WI-1419..WI-1434, not implementation.

## Sequence
1. Emit sign-of-life / needs-orchestrator on the channel.
2. Await routing directive for WI-1419..WI-1434.
3. If routed back into WS-37, refine/triage selected items to Ready before any execution.
4. Dispatch Codex builder executors from isolated worktrees, one WI at a time.
5. Ensure non-Codex reviewer coverage before any Codex-executed WI can close.

## Supervision / escalations
- Routing the 16 Captured items is an orchestrator decision; do not self-adopt them.
- Any destructive schema or production-facing change remains two-key/operator-gated per the
  shepherd protocol.
- Reviewer != executor is hard: Codex executor output must be reviewed by a non-Codex reviewer.

## Current position
Channel provisioned for shepherd boot. Waiting for shepherd sign-of-life and routing question.

## Launch gate
Prime-and-hold. Shepherd may reconcile and ask the routing question, but execution waits for
an orchestrator directive.

## Change log
- 2026-07-07 — Codex orchestrator provisioned WS-37 channel/tracker after operator clarified
  that Clacks means the file-backed inbox/outbox + monitors/watchers substrate.
