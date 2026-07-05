# Phase-D decision pack — fleet refit scope

Inputs: CONSOLIDATED.md (17 incidents, H1-H5 verdicts, 24 ranked fixes), ws-backlog-scoring.md
(51 open WS-23/26/43 items scored; 11 FAST-TRACK; 8 gaps → captured as WI-1601..1608).
All fixes now have a WI. Owner: ZDX orchestrator lanes (WS-23/26) unless noted; canon edits via
the WI-1597 pattern (PM branch → operator merge).

## Tier A — before relaunch (Phase-E gate)

Without these, the relaunched fleet re-runs last week.

| Fix | WI | Note |
|---|---|---|
| #1 Supervisor watchdog (auto-recover window-killed sessions) | WI-1563 (WS-40) | THE fix; 7/10 docs. Route to ZDX orch. Include #13 healthy-window respawn (WI-1607) as a requirement. |
| #2 `_state` untrack permanence + re-add guard | WI-1245 (WS-23, P0, Executing) | Both hosts fixed the symptom; this closes the class fleet-wide. |
| #3 `complete` draft-PR fallback sweep scoping | WI-1601 (WS-23, P1) | Unanimous-HURT tool bug; corrupts lanes on every dead-shepherd `complete`. |
| #4 Idle-lane heartbeat backoff | WI-1602 (WS-26, P1) | The H2 burn fix — protects the token budget the whole fleet runs on. |
| #14 Fleet-state protocol PAUSE/DRAIN/SHUTDOWN | WI-1599 + WI-1564 (WS-26) | Operator-named pain; canon edit, small. |
| #24/#H5-flag Merge-authority classes canonized | WI-1585 (WS-26) | Needs operator ruling (below), then a one-line canon edit. |
| #16 Version-skew: releases land at respawn boundaries only | new canon line (no WI needed — fold into WI-1585's canon pass or WI-1599's) | Needs operator ruling (below). |
| #5 Resume-anchor standardization | WI-1603 (WS-26, P2) | Doc-only; cheap; every doc that had one survived every incident. |
| #11 Monitor-restart delta replay | WI-1606 (WS-26, P2) | PM fixes own script immediately; canon line with it. |

## Tier B — first post-relaunch wave (not gating)

#6 WI-1236 (orchestrator monitor arming) · #7 WI-1604 (clock skew) · #8 WI-851 (validate/evidence
parser trip-wires) · #9 WI-1605 (UUID stamping) · #12 WI-1518 bundle (orphan/Executing handling,
incl WI-1509/1237/1312) · #15 WI-1608 (ENE single-writer) · #21 WI-850 (monitor hygiene).

## Tier C — backlog as normal

#18 per-lane token telemetry · #19 git identity enforcement · #20 WI-1246 docs-lane · #22 ps -W
liveness · #23 jq backtick · Windows judge cluster (WI-1374/1295/1284/1282).

## Operator rulings needed

1. Tier-A scope: approve as cut above (or amend).
2. Merge authority (H5 divergence): recommend class-based — irreversible/schema-destructive =
   two-key with operator; ordinary pre-launch merge = orchestrator self-rules. → WI-1585.
3. Version-skew policy: adopt "canon/skill/plugin releases only at respawn boundaries" as canon.
4. WI-1563 supervisor executor: ZDX orchestrator lane (recommended) vs PM-executed.

## Phase-E readiness checklist (draft)

- Tier A landed (or explicitly waived per item).
- Priming packets built: canon pointers + precedent register + Operator Queue convention +
  park/resume state per orchestrator (ramtop first act: Operator-Queue row "WI-1306 merge GO").
- PM watcher re-armed (with #11 replay fix) + backstop cron.
- Operator Queue items marked pre-relaunch (Doppler prd secrets WI-1336/1340) done, so the
  respawned WS-39 lane unblocks immediately.
- Ramtop relaunch → stable a few hours → orion relaunch.
