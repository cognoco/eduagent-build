# Findings — ramtop / shepherd / WS-28 (v2-finalization)

> **Orchestrator-reconstructed** (orchestrator:ramtop) from the WS-28 channel/outbox
> per the retro README's dead/dormant-session rule. The WS-28 session recovered from its
> freeze into a degraded heartbeat-only state and did not self-report before the drain
> deadline (see §1). If the session later writes its own doc, that supersedes this one.

Session span: ~2026-07-04 15:00Z → froze ~21:00Z; re-armed 2026-07-05 07:43Z; degraded at drain.
Agent: shepherd (v2-finalization lane), reconstructed by orchestrator.

## 1. Incident timeline

- 2026-07-04 ~21:00Z — WS-28 froze mid-hold (last real heartbeat hb-102). F39 fleet-freeze during the ~2h orchestrator pause — detected by orchestrator: 2h+ silent, then wake v2f-orch-208 drew nothing.
- 2026-07-04 23:20Z — orchestrator wake fuse passed with no response; WS-28 escalated to operator as likely-dead. Root: hb-102 heartbeat loop hit its iteration bound and the session did not re-arm on its own (unlike WS-18, which self-recovered on wake).
- 2026-07-04 23:20Z → 2026-07-05 07:43Z — WS-28 dead/unresponsive ~10h. LOW operational impact: build-gated on the operator R1 device test the whole time, so no work was blocked by its absence.
- 2026-07-05 07:43Z — recovered ONLY after the operator ran `/reload-plugins` (re-arm). Posted v2-finalization-103 (alive, F39 confirmed). Escalation retracted.
- 2026-07-05 ~08:27Z→drain — recovered into a DEGRADED state: emitted heartbeats (hb-104/105) but did NOT process the FLEET QUIESCE inbox directives (v2f-orch-210 relay + v2f-orch-211 nudge) within ~13 min. Heartbeat-only loop, inbox-action starved. This doc reconstructed as a result.

## 2. Comms losses

- Orchestrator wake v2f-orch-208 (23:01Z) — DELIVERED to lane inbox, never actioned (session frozen ~10h). Channel: lane inbox.
- FLEET QUIESCE relay v2f-orch-210 + nudge v2f-orch-211 — DELIVERED, not actioned before drain. The recovered session's loop kept heartbeating (holding-pattern) without draining the inbox — a recovered-but-degraded comms failure, distinct from the freeze.

## 3. Rulings & operator-action backlog

- **R1 device re-run (Galaxy S10e vs update group c46e0177)** — operator ACTION, open ~34h. This is WS-28's sole gate: it blocks WI-1307 (M4/C7 fallback-channel remediation, already FULLY DELIVERED — PR #1876 merged, OTA success, both defects fixed) completion, AND WI-1308 (M5). No shepherd action unblocks it. Within remit? NO — physical device test, operator-only.
- Fill-work WI-1334 (dev/preview flag-combo sanction) triaged → Backlog (done, no block).

## 4. Token / rate-limit events

- The ~2h orchestrator pause froze this session (F39). Unlike WS-18, it did NOT auto-recover on wake — it stayed dead ~10h until the operator reload. Near-zero burn while dead (idle). After recovery it burned heartbeat cycles without draining inbox — low but non-productive.

## 5. Root-cause hypotheses

- **H1 (rate-limit kills sessions, no auto-recovery): STRONGEST evidence of any lane.** WS-28 is the case that did NOT self-recover — ~10h dead, required a manual operator `/reload-plugins`. And even that recovery was partial (degraded heartbeat-only loop). No auto-recovery, and manual recovery incomplete.
- **H2 (too many lanes / burn): weak here** — WS-28 was build-gated idle, so it cost little; but its dead-then-degraded state shows the holding pattern itself is fragile.
- **H3 (canon drift): no data** (session did no canon-touching work post-recovery).
- **H4 (recent changes regressed behavior): SUPPORT.** `/reload-plugins` was both the recovery trigger AND left the session degraded (heartbeat-only, inbox-starved). The reboot/reload path does not cleanly restore a frozen shepherd to full function.
- **H5: n/a** (single-lane concern).

## 6. What would have saved WS-28 (ranked)

1. **Supervisor watchdog with auto-restart.** WS-28 sat dead ~10h; a watchdog respawning on "no heartbeat past N cycles" recovers it in minutes and is the single highest-value fix (this lane is the proof case).
2. **Heartbeat-loop-bound alarm.** The freeze was hb-102 hitting its loop iteration bound. Emit a distinct signal when the loop bound is reached (vs silently stopping) so it's detectable as "loop exhausted," not "frozen."
3. **Inbox-drain guarantee in the holding loop.** The recovered session heartbeated without processing inbox directives — the holding loop must drain + action the inbox every cycle, not just emit a heartbeat.

## 7. Keep / kill / fix

- **KEEP:** the build-gate discipline (WS-28 correctly held on R1 and never crossed the gate — its ~10h absence cost nothing precisely because it was correctly parked).
- **KILL:** the silent heartbeat-loop iteration bound that ends a session with no signal (the freeze mechanism).
- **FIX:** recovery-into-degraded-state — a reloaded/re-armed shepherd must fully re-enter its process loop (drain inbox + act), not just resume heartbeats. Wire the §6.1 watchdog behind the escalation fuse so "dead" auto-restarts.
