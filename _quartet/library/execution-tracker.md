# Library — Execution Tracker (definition)

**What this is.** The *shape* of a lane's `execution-tracker.md` — the per-lane (per-initiative)
working artifact a shepherd reads on arrival and writes back at checkpoint cadence. This file
defines the shape; a live instance lives at `working/lanes/<lane>/execution-tracker.md`.

**Role:** the tracker is the lane's substance. The shepherd protocol (`roles/shepherd-protocol.md`)
carries *process only* and points here for the lane's specifics. The tracker is **disposable by
construction** (`planning-rules.md` §2.6): kill the shepherd session and a fresh one pointed at the
tracker loses nothing but warm cache.

## Sections (every lane tracker has these)

| Section | Holds |
|---|---|
| **Charter** | the lane's outcome — what "done" means for this workstream |
| **Canon authority** | which doc(s) are authoritative for this lane (the source plan / spec / register the work must conform to); any lane-specific review invariant (e.g. "canon wins over the source plan") |
| **How to use** | a one-paragraph orientation for a fresh shepherd |
| **Pointers** | the ratified plan, the Cosmo Workstream (WS-N + page id), the satellite register(s), the substrate operating rules |
| **Units / slice** | the WP/Item set with coarse status, the slice scan, and `Workstream Order` (×100 spacing) |
| **Sequence** | intra-lane dependency notes (the hard edges fall out of the ratified plan) |
| **Supervision / escalations** | model/effort escalations (which WI runs its plan-phase on the top tier), known risk units, destructive-step flags |
| **Current position** | where the shepherd is now (the resume pointer) |
| **Launch gate** | if the lane is gated, the condition that releases it (prime-and-hold) |
| **Change log** | dated checkpoints; the final entry is the graduation checkpoint + residue statement |

## Rules
- **One fact, one home** (`planning-rules.md` §1.4): the tracker holds the lane's *delivery state*;
  it does not duplicate the rules (`planning-rules.md`), the roster rows
  (`library/program-roster.md`), or live per-WI state (Cosmo). It *points* at those.
- **Checkpoint cadence:** the shepherd writes substrate changes immediately and the tracker at
  checkpoint cadence, so the disposable-shepherd invariant holds.
- **Graduation:** the last change-log entry records the close — every WI Closed, the residue
  statement, and the hand-back to the orchestrator (who closes the Cosmo Workstream container).
