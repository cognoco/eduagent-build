# Liveness expectations (orchestrator-maintained; see orchestrator-protocol.md on Nexus main)

Machinery: outbox escalation watcher b6x8ykxz4 (4 lanes) (id-cursor, replay-immune) · WS-row delta watcher b6piitifp (PM-directives + ENE breaches) · crons aa9443b7 (:18/:48 sweep), 3b81180b (10m heartbeat loop), 68f88a83 (2h backstop :41). PM layer live; ENE mirrored on Workstream rows.

Rule: probe at deadline+15m grace (outbox mtime, Cosmo stage, git activity on lane branches).
Silent → wake directive. Silent after wake → escalate to operator. Any active lane silent ~2h = suspect.

| Lane | Channel | Status | Last sign | Expect sign-of-life by | Notes |
|---|---|---|---|---|---|
| WS-18 identity-cutover | _wip/identity-cutover/_state/ | ACTIVE — WI-1306 #1925 READY: CLEAN/MERGEABLE, all CI green, claude-review 0-findings, my Gate-1 fully verified. HOLDING SOLELY for operator 2nd-key GO. On GO → I merge → WS-18 finalizes | 2026-07-04 ~23:15Z (prg06ic-569) | n/a — operator GO gates | ONLY operator key remains |
| WS-28 v2-finalization | _quartet/working/lanes/v2-finalization/_state/ | HOLDING — RECOVERED from F39 freeze (v2-finalization-103, re-armed). WI-1307 (M4/C7 fallback remediation) FULLY DELIVERED, gated solely on operator R1 (c46e0177); on R1 PASS→complete→WI-1308 (M5). No shepherd action unblocks | 2026-07-05 ~07:43Z (v2-finalization-103) | n/a — R1 on operator | escalation retracted; self-recovered |
| bug-lane (WS-22) | _wip/bug-lane/_state/ | DORMANT — lane fully DRAINED (WI-1582 Closed Gate-2 18:13Z; WI-1571 Closed/Duplicate). Both WI-1571-fork items resolved. No pullable work | 2026-07-04 ~18:13Z (bug-lane-1783189200) | n/a (dormant, ping-on-arrival) | relaunch on fresh WS-22 work |
| WS-29 launch-compliance | _quartet/working/lanes/launch-compliance/_state/ | DORMANT — in-lane backlog CLEARED; WI-1557/1560/1507 all in Gate-2 reviewer queue; 3 parked (WI-1558/1559 need product+counsel, WI-1561→WI-1577); no pullable work | 2026-07-04 ~16:24Z (lc-10) | n/a (dormant, ping-on-arrival) | SOL-clock FIXED (was copied-template ts); relaunch on WI-1577 or operator ruling |
