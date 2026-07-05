# Findings — ramtop / program-manager / cross-lane (PGM-1)

Session span: 2026-07-03 → 2026-07-05 (continuous, 2 compactions)
Agent: program manager (program-manager:fable), Claude Code on Ramtop.

## 1. Incident timeline

- 07-03 ~23:30Z — WS-18 ENE lapse; commits fresh → stale marker — probe, ack in 5m — resolved.
- 07-04 00:34Z — WS-18 shepherd session death (overnight window) — found by orchestrator 04:41Z — relaunch.
- 07-04 09:40Z→13:03Z — WS-29 session death (~3.4h silent) — orch escalation — operator relaunch needed (sat unactioned ~1 day).
- 07-04 ~11:00–16:15Z — 4 consecutive WS-18 ENE false alarms (all alive) — root cause: ENE mirrored shepherd 30-min expect_sol_by windows — cadence tuning note fixed it.
- 07-04 ~14:30–18:00Z — ramtop orchestrator ITSELF rate-limited ~90m; its comments queued and landed at 18:04Z; WS-18 shepherd + bug-lane WI-1582 session went silent in the same window.
- 07-04 15:00Z→07-05 — WS-28 R1 human gate slipped 3+ ENE windows (Friday evening; expected).
- 07-05 08:27Z — FLEET QUIESCE posted as row comments — orion NEVER RECEIVED it (property-only watcher); delivered by operator relay.
- 07-05 ~08:43Z — ramtop DRAINED status SWALLOWED BY MY OWN WATCHER: event landed in the v4.3→v4.4 monitor-restart gap; caught only by manual re-check after operator prompt.

## 2. Comms losses

- Quiesce directive → orion: sent (WS-39 row comment) but not received — watcher polls ENE/Stage properties only. Canon fix landed (nexus@3bad56f): comment-polling mandate + positive-ack for fleet-wide directives.
- DRAINED status → PM: emitted by ramtop, lost in PM monitor restart handoff (old monitor stopped after last delivered event; new monitor's seed pass consumes deltas silently). Fix candidate: seed pass must REPLAY unseen deltas as events, not just record them; or overlap old/new watchers.
- WS-29 relaunch request → operator: "kickoff prompt handed to operator" lived in a row comment + session chat; unactioned ~1 day. This class is what the Operator Queue (WI-1596/1597) now owns.

## 3. Rulings & operator-action backlog

PM-side queue at quiesce: R1 device run (Zuzka, critical path), WS-29 relaunch (defer to Phase E), WS-39 respawn (defer to Phase E) — all now Operator Queue rows. Walkthrough Phase-3 rulings (7 items, Zuzka) still open — separate instrument. Within-remit escalations I bounced this period seeded the precedent register (5 entries).

## 4. Token / rate-limit events

- Operator datum: ~65% of a Max-20x day consumed in 24h for ~12 WI closes (baseline ~2/supervised-hour).
- Observed burn-without-output: wake/probe/relaunch overhead after every window; ramtop's queued-cron backlog clearing; my liveness probes on false alarms (4 on WS-18 alone before cadence fix).
- Every confirmed session death in the period maps onto a rate-limit window (WS-29, WS-18, WI-1582, WS-28 F39 freeze per ramtop's doc). None auto-recovered.

## 5. Root-cause hypotheses

- H1 (rate-limit death, no recovery): STRONG SUPPORT — all deaths window-correlated; recovery always manual (operator or orchestrator wake), latency 2h–1day.
- H2 (over-concurrency burn spiral): SUPPORTED — probe/wake/relaunch overhead compounded as lane count rose; the 24h burn datum. No direct token telemetry per lane — a fix candidate itself.
- H3 (canon drift in long sessions): PARTIAL — ENE-cadence misuse and stale row notes ("dormant" that wasn't) are drift-shaped; but ramtop's protocol behavior stayed coherent over ~2 days.
- H4 (recent ZDX/Quartet changes): MIXED — version skew is real (plugin skills load at session start; canon at grounding → fleet ran mixed versions all week). WS-28's partial /reload-plugins recovery (ramtop doc) is direct H4 evidence. No evidence the changes themselves are regressions; the ABSORPTION MODEL is the defect — canon/skill releases must be fleet events at respawn boundaries.
- H5 (two orchestrators / shared checkout): WEAK-MODERATE — no inter-orchestrator confusion observed; friction is real but hygiene-class ("Test User" unconfigured git identity across multiple sessions incl. mine via another session; WI-1246 guard vs retro-directive friction; stash/shelter dances for main pushes on the shared tree).

## 6. What would have saved you

1. Shepherd/session supervisor (WI-1563): non-agent watchdog, heartbeat file, window-death detection, resume-relaunch after reset. Would have cut every recovery from hours to minutes.
2. Operator Queue (now built, WI-1596/1597): would have prevented the WS-29 1-day stall and the R1 drift.
3. Fleet-state protocol (WI-1599): PAUSED with watchers-up as the default halt reading — would have prevented the pause-executed-as-shutdown incidents.

## 7. Keep / kill / fix

- KEEP: code-watcher + event-driven agent wake (v4 pattern) — cheap, reliable once armed; row-comment coordination protocol (worked whenever both sides polled); drain-not-kill quiesce (clean parks everywhere, WI-1306 preserved mid-flight).
- KILL: ENE mirroring shepherd micro-windows (alarm churn); property-only watchers; ambiguous halt directives.
- FIX: monitor restart handoff must replay unseen deltas (my own defect); fleet-wide directives need positive-ack (canon-landed); version-skew — canon/skill releases only at respawn boundaries; per-lane token telemetry so H2 is measurable next time; git identity enforcement per session (the "Test User" commits); WI-1246 guard needs a sanctioned docs-path lane so retro/program docs don't require --no-verify.
