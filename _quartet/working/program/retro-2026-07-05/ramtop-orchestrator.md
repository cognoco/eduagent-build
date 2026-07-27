# Findings — ramtop / orchestrator / all lanes (WS-18/22/28/29)

Session span: 2026-07-04 ~16:00Z → 2026-07-05 ~08:30Z (still live at drain)
Agent: orchestrator, Claude Opus (1M ctx), Claude Code harness.

## 1. Incident timeline

- 2026-07-04 ~16:05Z — orchestrator rate-limit pause (~90 min) — detected: ~15 sweep prompts queued on resume — recovered: resumed self.
- 2026-07-04 ~16:07Z — WS-18 + bug-lane froze during that pause (F39 frozen-clock) — detected: outboxes ~100–115m silent, deadlines lapsed, no git push — recovered: WAKE directives; both self-recovered on resume (frozen, not dead), clocks re-synced.
- 2026-07-04 ~21:00–23:01Z — 2nd pause (~2h) — froze WS-18 (mid WI-1306 corpus-validation → 63 orphaned zombie db/jest procs) + WS-28 — detected: 2h+ silent — recovered: WS-18 answered wake in ~1 min, killed zombies, re-validated clean; WS-28 did NOT recover.
- 2026-07-04 23:20Z → 2026-07-05 07:43Z — WS-28 unresponsive to wake ~10h — detected: wake delivered, no reply past fuse — recovered: self-recovered only after operator `/reload-plugins` re-arm (~07:43Z); hb-102 loop-bound was the freeze. Escalated to operator as likely-dead; escalation later retracted.
- Low-impact throughout: WS-28 was build-gated on R1 the whole time, so ~10h dead cost nothing operationally.

## 2. Comms losses

- **WS-1565 close sign-off lost (my mis-brief).** Shepherd posted the Gate-2 close at *status* level (not pushed by escalation watcher); I read outbox **mtime not content** and told operator bug-lane was "stuck in the reviewer loop" when WI-1565 had CLOSED 82 min earlier. Channel: lane outbox. Fix adopted: read outbox HEAD **content** every sweep (used all session after).
- **Level mislabeling (recurring, mostly safe).** Shepherds tagged status reports as `decision`-level (over-escalation, harmless) but once tagged a lane-draining close as status-level (the dangerous direction — caused the mis-brief above). Convention since: push lane-draining closures at decision level (orch-135).
- **ENE double-write.** I updated `liveness.md` markdown but not always the Notion ENE field → repeated false ENE-breach events from the watcher (WS-18 several times). Channel: Notion row property vs local md.

## 3. Rulings & operator-action backlog

Moved here from session chat per directive. Every item I was sitting on at drain:

1. **WI-1306 merge GO** — DECISION, operator's second key. Blocked ~9h (23:10Z→drain). #1925 (physical DROP of 5 legacy tables) is CLEAN/MERGEABLE, all CI green, claude-review 0-findings, my Gate-1 fully verified incl. own-eyes on the 0132 SQL + rollback section. Within my remit? **NO** — correctly operator (irreversible drop; two-key gate is by design). Ready to merge the instant GO lands.
2. **R1 device test (Galaxy S10e vs update group c46e0177)** — operator ACTION. Blocked ~34h (~22:40Z 07-03→drain). Gates: WS-28 WI-1307 completion + WI-1308/M5 + V2-shell relaunch. Within my remit? **NO** — physical device run, no shepherd action unblocks it.
3. **WS-37 16 post-graduation Captured items (WI-1419–1434, 10×P2)** — DECISION (reopen as hardening-wave-2 lane vs re-home to bug-lane vs park). Within my remit? **PARTIALLY YES** — routing Captured items to a lane is an orchestration call; I surfaced it repeatedly instead of ruling. Honest gap: I could have routed these under standing directives and only escalated the "new lane vs park" strategy question.
4. **WS-29 parked compliance pair** — WI-1558 (name-minimisation: product+counsel) remains a decision. **WI-1559 is now RESOLVED:** the 2026-07-11 operator ruling names ZWIZZLY AS, org.nr 811696072, Fiskekroken 3B, 0139 Oslo, Norway, with Norwegian Datatilsynet as lead authority; active-document reconciliation is complete.
5. **WI-1310 / M6 `eas env:list production`** — operator ACTION. The 07-04 attempt misfired (`eas init` at monorepo root created a throwaway `@zuzanka14/eduagentsource` project; operator answered `n`, cleanup pending). Real prod-env check still outstanding. Within my remit? Partly — I diagnosed + gave exact recovery steps, but the check runs on the operator's machine.

## 4. Token / rate-limit events

- Two orchestrator pauses (~90 min + ~2h); each froze every active shepherd under me (F39). No auto-recovery.
- **Idle-hold burn.** WS-18 held ~9h for the operator GO with nothing to do, yet the 10-min sign-of-life sweep + :18/:48 liveness + 2h freeze-checks kept running against 4 lanes the whole time. Cadence did not adapt to "all lanes blocked on operator" → steady overhead with zero throughput. Direct H2 evidence.
- No infinite retry loops on my side; the burn was cadence overhead, not runaway regeneration.

## 5. Root-cause hypotheses

- **H1 (rate-limit kills sessions, no auto-recovery): STRONG SUPPORT.** Both pauses froze sessions with frozen clocks (F39). Frozen sessions self-recover on resume IF the pause clears cleanly (WS-18 twice); WS-28 stayed dead ~10h and only recovered on a manual operator re-arm. Nothing auto-restarts a dead session — the single biggest gap.
- **H2 (too many lanes / burn spiral): PARTIAL SUPPORT.** 4 lanes × 10-min sweeps + freeze-checks = constant overhead, most wasteful during the long operator-blocked idle-hold. The sweep cadence is fixed, not adaptive.
- **H3 (canon drift): NO SUPPORT / CONTRARY.** Shepherds stayed on-canon all session (F35 two-key gate, GATE-0 premise-check, red-green-revert guard, honest rollback sections). Frozen-clock produced stale *timestamps*, not canon drift.
- **H4 (recent ZDX/Cosmo/Quartet changes regressed behavior): ONE CONCRETE.** The mid-session `/reload-plugins` **touched `_state` outbox files, updating mtime with no new content** → a false-fresh signal (WS-18 + bug-lane both showed age=1m with unchanged HEAD ids). Reading content (not mtime) caught it, but an mtime-only orchestrator would have mis-fired. Otherwise no behavior regression observed.
- **H5 (two orchestrators + shared checkout): SOME SUPPORT.** Managed main-branch races with ff-only syncs + incoming/local intersection checks (no clobbers). The ENE markdown-vs-Notion split (my own two-writer bug) caused repeated false breaches — a single-source-of-truth would kill it.

## 6. What would have saved me (ranked)

1. **Supervisor watchdog that auto-restarts a dead/frozen session.** WS-28 sat dead ~10h; an external watchdog detecting "no heartbeat past N × cadence" and respawning would have recovered it in minutes. Addresses H1 directly.
2. **Adaptive sweep cadence.** When every lane is parked/blocked-on-operator, back off from 10-min to (say) 30–60 min heartbeat. Kills the idle-hold burn (H2) without losing coverage.
3. **Automatic frozen-clock detection.** Compare each session's self-reported clock to wall-clock on every message; flag drift ≥ pause-length automatically instead of my manual F39 diagnosis. Turns a 2h-suspect guess into a deterministic signal.

## 7. Keep / kill / fix

- **KEEP:** F35 two-key merge gate (worked flawlessly on the irreversible WI-1306 drop — my Gate-1 + operator GO). Read-outbox-HEAD-**content**-not-mtime. GATE-0 premise-check (caught WI-1571 as a phantom already fixed by WI-1303 → zero wasted build). Graduated escalation (light status-check → wake → operator), which recovered both frozen lanes without false alarms.
- **KILL:** 10-min sign-of-life pinging of lanes that are idle-blocked-on-operator — pure noise + burn. Dormant/held lanes should be event-driven, not polled.
- **FIX:** ENE lives in two places (liveness.md + Notion) → make Notion the single writer, mirror read-only. Frozen-clock detection is manual → automate (see §6.3). Escalation fuse for a "dead" session had no auto-restart behind it → wire §6.1.
