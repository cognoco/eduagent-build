# Plan workspace

`docs/plans/` contains plans that are still executable, intentionally deferred,
or needed as current product/roadmap references. Completed and superseded plans
belong under `docs/_archive/plans/`.

Last reconciled against `origin/main`: **2026-07-22**. The 2026-07-14 estate
disposition remains authoritative; later landed plans are listed separately below. See
[`2026-07-14-cleanup-dispositions.md`](2026-07-14-cleanup-dispositions.md) for
the per-document ruling.

## Active or intentionally deferred

| Plan | Current state | Next gate |
|---|---|---|
| [`2026-05-12-shared-test-utility-framework-plan.md`](2026-05-12-shared-test-utility-framework-plan.md) | Framework shipped; existing-suite migration remains. | Refresh the generated inventory, then execute the remaining cleanup batches. |
| [`2026-07-10-mvp-roadmap/RUNWAY.md`](2026-07-10-mvp-roadmap/RUNWAY.md) | Accepted roadmap of record. | Refresh work-item execution status without changing ratified scope rulings. |
| [`2026-07-12-one-way-door-risk-drain.md`](2026-07-12-one-way-door-risk-drain.md) | Draft; 11 owner/gate tasks remain. | Dedupe current work items, then route each gate to its owner artifact. |
| [`v2-plan/2026-06-10-s6-cutover-deletions.md`](v2-plan/2026-06-10-s6-cutover-deletions.md) | Deferred and irreversible. | Do not execute until all retirement gates pass and a human explicitly confirms loss of flag-flip rollback. |

## Landed plans awaiting archival

These plans are complete on `origin/main`; they remain here only as implementation
and evidence records and carry no open execution scope.

| Plan | Landed evidence |
|---|---|
| [`2026-07-17-route-valid-mentor-statements.md`](2026-07-17-route-valid-mentor-statements.md) | Landed in `e9a6b960c` (PR #2230); plan status is `complete`. |
| [`2026-07-18-consolidate-mentor-capability-contract-tests.md`](2026-07-18-consolidate-mentor-capability-contract-tests.md) | WI-2222 (consolidate Mentor capability contract tests), landed in `99649dd9a` (PR #2236). |
| [`2026-07-20-answer-evaluation-signal.md`](2026-07-20-answer-evaluation-signal.md) | WI-1443 (add per-turn answer evaluation), landed in `3adb80d19` (PR #2418); plan status is `complete`. |

## Current reference

| Document | Role |
|---|---|
| [`2026-07-10-mvp-roadmap/MVP-DEFINITION.md`](2026-07-10-mvp-roadmap/MVP-DEFINITION.md) | Ratified launch-scope and capability rulings. Individual work-item status may drift; product rulings remain the reference. |
| [`2026-07-14-cleanup-dispositions.md`](2026-07-14-cleanup-dispositions.md) | Code-verified fate of the 58-plan starting estate. |

## Archive convention

- Implemented plans: [`docs/_archive/plans/done/`](../_archive/plans/done/)
- Superseded plans and design snapshots from this pass:
  [`docs/_archive/plans/2026-07-14-superseded/`](../_archive/plans/2026-07-14-superseded/)
- Pre-ratification mentor-notice implementation plans reconciled by `MMT-ADR-0036`:
  [`docs/_archive/plans/2026-07-21-mentor-notice-reconciliation/`](../_archive/plans/2026-07-21-mentor-notice-reconciliation/)

Before adding a plan, link its spec or work item, give it a status, and define a
verifiable completion condition. Before trusting an old plan's status, inspect
current code and tests.
