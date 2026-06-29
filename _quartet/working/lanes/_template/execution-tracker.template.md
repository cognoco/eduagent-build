<!-- TEMPLATE — lane skeleton. Copy this `_template/` dir to `working/lanes/<lane-slug>/`, rename this file to execution-tracker.md (strip `.template`), swap «PLACEHOLDER», delete this comment. Then provision `_state/inbox.jsonl` + `_state/outbox.jsonl` (empty) and a `_state/monitor-manifest.json` (shape: ../../program/monitor-manifest.template.json). Shape: ../../../library/execution-tracker.md. -->

# «LANE NAME» — Execution Tracker

> The lane's substance. The shepherd protocol (`../../../roles/shepherd-protocol.md`) carries process
> only and points here for specifics. **Disposable by construction** — a fresh shepherd pointed at
> this tracker loses nothing but warm cache. One fact, one home: this holds *delivery state*; it
> points at the rules (`planning-rules.md`), the roster (`library/program-roster.md`), and live
> per-WI state (Cosmo) — never duplicates them.

## Charter
«The lane's outcome — what "done" means for this Cosmo workstream.»

## Canon authority
«Which doc(s) are authoritative (source plan / spec / register the work must conform to). Any
lane-specific review invariant — e.g. "canon wins over the source plan."»

## How to use
«One paragraph orienting a fresh shepherd: where to start, what the slice is, what's in flight.»

## Pointers
- Ratified plan: «path»
- Cosmo Workstream: WS-«N» · «page id»
- Satellite register(s): «path / none»
- Substrate operating rules: `planning-rules.md`

## Units / slice
| WI | Altitude | Coarse status | Workstream Order |
|---|---|---|---|
| WI-«NN» | «WP/Item» | «backlog/refining/executing/reviewing/closed» | «100, 200, … (×100 spacing)» |

Slice scan: «what's in / out of this slice and why».

## Sequence
«Intra-lane hard edges (fall out of the ratified plan).»

## Supervision / escalations
«Which WI runs its plan-phase on the top tier (reasoning-hard, not severity); known risk units;
destructive-step flags.»

## Current position
«Where the shepherd is now — the resume pointer.»

## Launch gate
«If gated: the condition that releases it (prime-and-hold). Else: ungated.»

## Change log
- «YYYY-MM-DD» — «checkpoint». (Final entry = graduation: every WI Closed + residue statement +
  hand-back to the orchestrator, who closes the Workstream container.)
