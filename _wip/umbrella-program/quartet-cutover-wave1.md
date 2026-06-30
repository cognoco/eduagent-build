# Quartet Cutover — Wave 1 (orchestrator-Brain repoint)

> **Status: EXECUTED + verified 2026-06-29.** The rehydration hook is repointed (working-tree-only,
> uncommitted by design — hook line 8); dry-run confirmed (a)/(c) → `_quartet/`, (b) kept live, the
> Working-state binding line prints. The scoped first wave of
> `quartet-cutover-plan.md`, executing **Approach D** (prove-in-place, drain the rest). It repoints
> only the **orchestrator's Brain** (protocols) to `_quartet/` while keeping all **Working state**
> on its live `_wip/` paths, and **defers every lane-level referrer** to drain. The full referrer
> map + Class A/B/C is in `quartet-cutover-plan.md`; this is the executable first step.

## The principle this wave establishes
**Brain → `_quartet/`; Working state → stays on `_wip/`.** The orchestrator reads its *protocols*
(how to act) from `_quartet/`, but its *live instances* (roster, channels, anchor) stay where the
running program keeps them (`_wip/`). The hook is where that binding is expressed. This is the
Brain/Library vs Working split made operational — and the reason Wave 1 is safe.

## Sole target
`_wip/identity-cutover/_state/quartet-hooks/rehydrate.sh` — the PRG-06 orchestrator/shepherd
SessionStart rehydration injector. **Working-tree-only** (line 8: never committed / never `git add`),
**role-gated** (only `QUARTET_ROLE`/roles.json sessions; everything else is a silent no-op, line 26),
**fail-open** (must never disrupt a session). Only the **orchestrator** branch (lines 40–47) carries
a protocol re-read list; the shepherd branch does not — so this wave touches the orchestrator only.

## Exact changes (orchestrator re-read list, lines 41–45)
| Line | Now | Wave-1 | Why |
|---|---|---|---|
| 42 (a) | `_wip/umbrella-program/orchestrator-protocol.md` | `_quartet/roles/orchestrator-protocol.md` | **Brain** → `_quartet/` (the `_quartet/` copy is the cleaned superset — carries the folded E5 compaction-reread + monitor-hygiene discipline) |
| 44 (c) | `_wip/umbrella-program/planning-reference.md` | `_quartet/planning-rules.md` | **Brain** → `_quartet/` |
| 43 (b) | `_wip/umbrella-program/program-roster.md` | **KEEP** (unchanged) | **Working state** — the live roster; stays on `_wip/` (Class C) |

**ADD — a Working-state binding line** (immediately after the re-read list, before the anchor) so
the orchestrator does **not** follow the `_quartet/` protocol's generic `working/program/…` pointer
to the stale `_quartet/working/` snapshot:

> `   ⚠ Working-state root for THIS program = _wip/ — roster at _wip/umbrella-program/program-roster.md (b above); channels + anchor under _wip/identity-cutover/_state/. The _quartet/ protocols describe the SHAPE; read the LIVE instances at these _wip/ paths, never _quartet/working/.`

**Optional (E6 alignment)** — line 64 `Resume monitoring posture` → `Reconcile your monitors against
the manifest (_quartet/clacks/monitor-hygiene.md) before trusting any watcher's silence; resume
monitoring posture.`

## Explicitly NOT touched in Wave 1
- `roles.json` — session-id→role data, no paths. No change.
- `AGENTS.md` / `CLAUDE.md` — verified 0 protocol path-pointers. No change.
- **All lane referrers — deferred to drain:** every shepherd/reviewer **kickoff** + **execution-tracker**
  (`flow-remediation`, `identity-cutover`, `new-llm-integration`, …) and the `_wip/identity-foundation/`
  shepherd/executor/reviewer **protocol originals**. In-flight lanes keep reading their `_wip/`
  copies; retire each as its lane graduates (per `quartet-cutover-plan.md` Class B).

## Risk + reversibility
- **Blast radius:** one **uncommitted, working-tree-only** file; orchestrator-role sessions only; fail-open.
- **Content risk:** near-zero — the repoint target is a cleaned **superset** of the `_wip/` original.
- **The one hazard** (orchestrator reading the stale `_quartet/working/` snapshot instead of the live
  `_wip/` roster) is closed by the Working-state binding line above.
- **Rollback:** restore the two paths in the hook (it's working-tree-only, so a manual revert or
  `git checkout` of the file — if even tracked — fully reverts; nothing downstream depends on it).

## Verification (before declaring the wave done)
1. **Dry-run the hook** with a synthetic orchestrator SessionStart:
   `printf '{"session_id":"70f541f3-fdda-4b86-9098-8a8cf1398fca","source":"resume"}' | QUARTET_ROLE=orchestrator bash _wip/identity-cutover/_state/quartet-hooks/rehydrate.sh`
   → confirm it prints `_quartet/roles/orchestrator-protocol.md` + `_quartet/planning-rules.md` as
   (a)/(c), the **live** `_wip/…/program-roster.md` as (b), and the Working-state binding line.
2. **Next real orchestrator resume:** confirm it reads the `_quartet/` protocols + the live `_wip/`
   roster/channels (not `_quartet/working/`).
3. **Rollback drill:** confirm restoring the two paths returns the prior output.

## After Wave 1
The orchestrator now runs on the `_quartet/` Brain against live `_wip/` Working state. **Next:** stand
up the next NEW lane entirely from `_quartet/roles/kickoffs/` (greenfield, in place) — the real PoC —
while existing `_wip/` lanes drain. Promotion to Nexus stays a separate, later step.
