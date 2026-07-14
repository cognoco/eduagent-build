# Plan workspace

`docs/plans/` contains plans that are still executable, intentionally deferred,
or needed as current product/roadmap references. Completed and superseded plans
belong under `docs/_archive/plans/`.

Last reconciled against source code: **2026-07-14**. See
[`2026-07-14-cleanup-dispositions.md`](2026-07-14-cleanup-dispositions.md) for
the per-document ruling.

## Active or intentionally deferred

| Plan | Current state | Next gate |
|---|---|---|
| [`2026-05-12-shared-test-utility-framework-plan.md`](2026-05-12-shared-test-utility-framework-plan.md) | Framework shipped; existing-suite migration remains. | Refresh the generated inventory, then execute the remaining cleanup batches. |
| [`2026-07-10-mvp-roadmap/RUNWAY.md`](2026-07-10-mvp-roadmap/RUNWAY.md) | Accepted roadmap of record. | Refresh work-item execution status without changing ratified scope rulings. |
| [`2026-07-12-one-way-door-risk-drain.md`](2026-07-12-one-way-door-risk-drain.md) | Draft; 11 owner/gate tasks remain. | Dedupe current work items, then route each gate to its owner artifact. |
| [`v2-plan/2026-06-10-s6-cutover-deletions.md`](v2-plan/2026-06-10-s6-cutover-deletions.md) | Deferred and irreversible. | Do not execute until all retirement gates pass and a human explicitly confirms loss of flag-flip rollback. |

## Current reference

| Document | Role |
|---|---|
| [`2026-07-10-mvp-roadmap/MVP-DEFINITION.md`](2026-07-10-mvp-roadmap/MVP-DEFINITION.md) | Ratified launch-scope and capability rulings. Individual work-item status may drift; product rulings remain the reference. |
| [`2026-07-14-cleanup-dispositions.md`](2026-07-14-cleanup-dispositions.md) | Code-verified fate of the 58-plan starting estate. |

## Archive convention

- Implemented plans: [`docs/_archive/plans/done/`](../_archive/plans/done/)
- Superseded plans and design snapshots from this pass:
  [`docs/_archive/plans/2026-07-14-superseded/`](../_archive/plans/2026-07-14-superseded/)

Before adding a plan, link its spec or work item, give it a status, and define a
verifiable completion condition. Before trusting an old plan's status, inspect
current code and tests.
