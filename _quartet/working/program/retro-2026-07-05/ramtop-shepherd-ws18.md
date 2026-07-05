# Findings — ramtop / shepherd / WS-18 (identity-cutover)

Session span: 2026-07-04 ~15:44Z → 2026-07-05 08:30Z (still live, quiescing)
Agent: shepherd, Claude Code (Opus, 1M ctx). Lane: PRG-06 / WS-18 identity-cutover.
Scope this span: drove M2a to near-complete — WI-1524, WI-1398, WI-1139 Closed; WI-1306 (physical DROP) pushed + green, parked at operator gate.

## 1. Incident timeline

- ~16:23Z — SESSION FREEZE #1 (F39): clock froze at 16:23Z while real time advanced to ~18:04Z (~100 min) — detected only when orchestrator WAKE (ic-orch-427) said "115m silent" + `date -u` jumped on resume — recovered by re-sync, no state lost.
- ~16:01Z — MACHINERY RESET (ic-orch-426, operator): monitors re-armed — detected via inbox monitor delivering the reset ping — recovered clean (my inbox monitor survived).
- ~16:05–16:20Z — builder-1139c repeated idle-notifications / poll-loop drops after a tool-availability reset — detected via idle pings + mtime checks — recovered by re-nudging; builder was validating on shared stg, runs truncated 2–3× by resets.
- ~20:56Z→23:02Z — SESSION FREEZE #2 (F39, ~126 min): same frozen-clock signature — detected via orchestrator WAKE (ic-orch-435) — recovered by re-sync; WI-1306 authoring intact, corpus-validation run had completed exit-0 during the freeze (looked like 63 zombie procs, were actually done).
- 08:2xZ — CHANNEL-INTEGRITY GLITCH during `/reload-plugins`: inbox.jsonl SHRANK 343→289, monitor re-fired stale July-3 msgs (ic-orch-389..395) — detected via monitor alert + tail check — recovered on its own (files back to current heads inbox=ic-orch-442 / outbox=prg06ic-573); did NOT act on stale re-fires.
- Prior-session precedent (same lane, logged in handoff): identical `_state/` revert to a stale committed snapshot on a concurrent main-advance (WI-1245, 41ada5464) + a verifier's tree-wide `git checkout <sha> -- .` — recurring failure mode.

## 2. Comms losses

- Info-level outbox notes are POLLED, not pushed (orchestrator's own words) → my progress notes lagged; orchestrator issued repeated status-checks/wakes to compensate. Channel = lane outbox JSONL.
- Both F39 freezes made me appear dead (115m / 126m silent) — orchestrator was one pulse from declaring me dead. No message was truly lost; the channel + Cosmo/gh let both sides re-sync.
- No orchestrator↔shepherd message dropped in content — the failure is LATENCY (poll cadence) + the ephemeral channel's revert hazard, not delivery.
- Operator↔shepherd: the WI-1306 operator-GO ask (AskUserQuestion) timed out (operator away) — expected, not a loss.

## 3. Rulings & operator-action backlog

- **LIVE — WI-1306 #1925 merge: BLOCKED on OPERATOR GO** (two-key gate: orchestrator Gate-1 turned, operator key outstanding). Blocked ~9h+ (23:14Z → now). Within my remit? **NO** — irreversible physical DROP of 5 tables; correctly operator-gated per ic-orch-433; I could not and should not rule it. This is the ONLY pending operator-action I'm sitting on. Resume state: on GO → orchestrator merges #1925 → I finalize WI-1306 → Gate-2.
- RESOLVED (escalated, ruled, did NOT sit): stub-vs-delete (WI-1139) → orchestrator ruled DELETE; stale-base worktree (WI-1139) → ruled REDO; WI-1306 timing/premise (0130 vs 0132, un-freeze vs author-fresh) → partial GO + premise correction. All actioned same-session.
- Everything else drove autonomously under standing directives (F35 merge-gate, merge-first, valid-should-fix-fix-now) — no unnecessary halts.

## 4. Token / rate-limit events

- 2× long freezes (§1) = almost certainly rate-limit/pause windows (F39). Each resume re-reads full context UNCACHED (5-min cache TTL long blown) — the single biggest avoidable burn.
- Earlier builder (builder-1139-2) DIED on account session limit — per-file sub-agent fan-out burned ~500–700K with little output (flagged as fleet risk at the time).
- Repeated full-corpus re-validations (WI-1139 37-file sweep, WI-1306 drop) on shared stg + local PG clusters — heavy but necessary; some re-runs wasted by reset-truncation.
- Low-value burn: builder idle-notification churn; my liveness-ack git-fetch/status polls every 2h (small, but N×lanes fleet-wide adds up).

## 5. Root-cause hypotheses

- **H1 (rate-limit kills sessions, no auto-recover): STRONG SUPPORT.** 2 F39 freezes this span; the ONLY recovery mechanism was the orchestrator's manual WAKE pings. Nothing auto-detected the frozen clock. Without the orchestrator I stay frozen indefinitely.
- **H2 (too many lanes / burn spiral): PARTIAL.** Wake/probe/liveness overhead real but modest for me. Bigger burn = full-corpus re-validations + a builder dying on session limit. The uncached re-reads after freezes (H1) dwarf probe overhead.
- **H3 (long-session canon drift): LOW for me.** Stayed grounded (re-read handoff, verified migration premise, cited file:line). BUT my durable resume anchor (SESSION-HANDOFF.md) got reverted once — mitigated only because I also leaned on Cosmo/gh/task-list.
- **H4 (recent ZDX/Cosmo/Quartet changes regressed behavior): MIXED, one named regression.** NAMED: the `_state/` JSONL as comms substrate reverts on main-advance / tree-wide-checkout / reload-plugins (channel-integrity hazard) — recurred 2×. Completion-summary trip-wire `\btests?\b.{0,40}(green|pass|clean)` is over-broad (flagged "test helpers that seed and clean") — cost one finalize cycle. HELPED: the new two-key operator gate + `complete --validate` pre-flight both worked well.
- **H5 (two-orchestrator / shared-checkout friction): SUPPORTED.** main advanced 4 commits under the WI-1306 branch (stale-base scare, 66-file 2-dot diff vs 1-file 3-dot); the `/reload-plugins` revert; a prior verifier's tree-wide checkout reverting the channel. Shared working tree is a real friction source.

## 6. What would have saved me (ranked)

1. **Frozen-session self-watchdog.** On every wake, self-check `date -u` vs last-known + expected cadence; if skew > threshold, self-flag "I was frozen N min" and re-sync BEFORE acting. Today only the orchestrator's manual ping caught it. Highest leverage — directly kills H1's blast radius.
2. **Durable, append-only, push-based comms** (not ephemeral working-tree JSONL). Cosmo comments or a DB-backed channel that cannot revert on a git operation. Kills the H4/H5 channel-revert hazard + the poll latency.
3. **Cosmo/gh/task-list as the SOLE resume anchor** (formalized), with the handoff file explicitly demoted to a convenience mirror. I already drifted toward this; make it doctrine so a reverted file is a non-event.

## 7. Keep / kill / fix

- **KEEP:** two-key operator gate for irreversible migrations (flawless); merge-first / never-complete-before-merge (Gate-2 landed-DoD); tables-ABSENT validation as the drop-readiness gate (caught the ungated UPDATE); verify-migration-premise-before-authoring (caught 0130→0132 + 0117-superseded-by-0129); `complete --validate` pre-flight; CI-settle monitor pattern.
- **KILL:** treating the `_state/` JSONL as the durable comms/handoff substrate; per-file builder sub-agent fan-out that exhausts session limits.
- **FIX:** freeze recovery — right in spirit (2h liveness pings) but wrong mechanics (manual, orchestrator-driven, 2h blind window) → one-line fix: agent self-checks clock skew on every wake + emits a freeze marker automatically. Completion-summary count trip-wire — right intent (block qa live-re-run) but regex too broad → require a numeric/verdict token adjacent, not any `clean`.
