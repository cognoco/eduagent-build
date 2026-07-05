# Findings — ramtop / shepherd / WS-22 (Bug Lane) [+ WS-25 Review Backlog, drained early]

Session span: ~2026-07-03 11:40Z → 2026-07-05 08:30Z (still live at quiesce; survived 1 compaction + 1 reboot + 1 login/rate-limit gap)
Agent: shepherd, Claude Code / Opus 4.8 (1M ctx).
Lane outcome at quiesce: **fully drained, dormant, zero pending backlog.** 5 items driven to Closed this span (WI-1176, WI-1415, WI-1565, WI-1571, WI-1582).

## 1. Incident timeline

- `07-03 ~12:54Z` — DUPLICATE shepherd occupancy (2 sessions activated, both ran activation) — detected via occupancy question on outbox — recovered: orch-114 ruled session-B owns, session-A stood down (idempotent PATCHes, no damage).
- `07-03 ~13:15Z` — CHANNEL REVERT (WI-1245): git-tracked `_state/*.jsonl` reverted by a concurrent main advance (inbox 110→87, outbox to old snapshot) — detected by re-reading files, posts vanished — recovered: re-posted from UNTRACKED SESSION-HANDOFF.md; hazard class ended when WI-1245 (untrack _state) landed.
- `07-03 shutdown→reboot` — session restart post-reboot — recovered cleanly via SESSION-HANDOFF.md (re-armed monitors, verified parked-item homing).
- `07-04 ~13:0xZ` — WI-1565 LIVENESS LAPSE (self-owned): builder idled post-review WITHOUT a SUCCESS/PR report; I HELD instead of polling; orch merged #1903 ~2.5h later without my route-signal — detected only when orch-134 mis-briefed the item as stuck — recovered: adopted a bounded PR-poll watcher on builder dispatch.
- `07-04 ~16:29→18:02Z` — WI-1582 SILENT GAP (~93 min): PR #1906 went CLEAN at ~16:29Z, but my `run_in_background` while-true PR-poll watcher is WRITE-ONLY (bg task only notifies on EXIT; while-true never exits) so it never woke me — detected only when orch-138 sent a SOL ping at 18:02Z — recovered: manual PR check + routed; replaced watcher with an until-loop that exits on merge.
- `07-0x` — COMPACTION (context window exhausted) — recovered via harness summary + SESSION-HANDOFF.md top block; no work lost.
- `07-04 (mid-span)` — LOGIN / rate-limit gap: session went dormant, required operator "wake up and ping the orchestrator" to resume — no auto-recovery.

## 2. Comms losses

- **WI-1565 close sign-off rotted.** My close sign-off was posted at `level=status` on the outbox; the orchestrator's escalation watcher only PUSHES needs-*/blocked/decision, so a status-level close was never surfaced → orch carried "awaiting 3rd verdict" as stale state → orch-134 phantom-review mis-brief (~82 min stale). Channel: outbox. Fix adopted both sides: orch now reads outbox HEAD each sweep (orch-135); I now emit lane-draining closures at `level=decision`.
- **WI-1582 green-PR event lost to a write-only watcher.** The transition to CLEAN was written to the bg task's output file but never delivered as a notification (see §1). Channel: bg task stdout (non-waking). Fix: Monitor tool or until-loop.
- **orch-139 resume crossed my orch-138 route in flight** — near-miss, not a true loss (orch resent a wake ~2 min before my route landed; their outbox-HEAD read reconciled it). Symptom of no shared "in-flight ack" handshake.

## 3. Rulings & operator-action backlog

**Current pending backlog I am sitting on at quiesce: NONE.** Lane fully drained; every ruling received and executed (orch-137 forks, orch-140 merge-confirm, orch-141 ack). Zero open asks. The 3 parked HELD items (WI-1258 git-fixture path-clobber / WI-1252 RevenueCat GC6 mock / WI-1244 god-screen decomp) are held by orch-109/110 and are NOT awaiting any action from me.

Halts during the span (all resolved):
- **WI-1565 P1 deploy blocker** → escalated needs-operator; the AC-prescribed post-0130 forward migration was logically impossible (fail-fast migrate aborts on 0130 first). Ruled Option A (edit unapplied 0130 + allowlist). **Could I have self-ruled? NO** — editing a migration + BUG-886 immutability allowlist is a schema-safety/operator-authorization call. Correctly escalated.
- **WI-1176 re-home attribution** (unattributed integration token re-homed it into WS-22, contradicting orch-112) → orch-117 escalated to operator → GO. **Self-rule? NO** — cross-workstream ownership attribution is above shepherd remit. Correctly escalated.
- **WI-1571 GATE-0 disposition** (close-as-duplicate + spin-off capture) → routed needs-orchestrator → orch-137 ruled both forks. **Self-rule? Partial** — the CLOSE is orchestrator/reviewer's by canon (never self-close), correctly routed; the spin-off CAPTURE (WI-1582) I could arguably have done under autonomous-speccing, but forking a new WI during a drain warranted the confirm. Minor over-ask.
- **Duplicate occupancy** → orch-114 (operator-adjacent) ruling. Not self-rulable (needs cross-session authority).

## 4. Token / rate-limit events

- One LOGIN/rate-limit gap put the session dormant with no auto-recovery (operator had to wake it). Supports H1.
- One compaction (context exhaustion) on a ~2-day-long session — context-window, not rate-limit, but same "long session" root (H3).
- No model-token retry-loops from my seat. NOTE: my bg PR-poll watchers (`byhk6rypk`, `bmieoxptm`) ran `sleep 60` gh-poll loops — these burn NO model tokens (background bash), so low cost, but they gave FALSE reassurance of coverage while delivering zero notifications. Cost was in wall-clock silence, not budget.
- Cannot corroborate the fleet-wide ~65% burn from my lane; my drives were productive (5 closes), wake/probe overhead modest (2 Cosmo stage monitors + 1 inbox poller + transient PR watchers).

## 5. Root-cause hypotheses

- **H1 (rate-limit kills sessions, no auto-recover): SUPPORTED.** The login gap dormanted the session; recovery required an operator "wake up" ping. The ~93-min WI-1582 gap had the same SYMPTOM (silent, externally re-pinged) via a different cause (watcher). Common thread: no self-healing wake when a shepherd goes quiet with open state.
- **H2 (too many lanes / burn spiral): WEAK from my seat.** I nominally owned 2 lanes (WS-22 + WS-25) but WS-25 drained early → effectively 1. No crowding observed. Monitor/watcher wake overhead exists but is background bash, not token burn.
- **H3 (long session drifts from canon, no respawn): SUPPORTED.** ~2-day session across compaction + reboot + login gap. Both process misses (status-level close sign-off; write-only watcher) read as late-session degradation an earlier respawn/re-grounding would have caught. Compaction re-grounded partially; there is no deliberate re-grounding cadence.
- **H4 (recent Quartet/Cosmo/ZDX change regressed behavior): SUPPORTED, named.** (a) **Merge-authority flip mid-session** — orch-124→125 moved Gate-1 merge from shepherd to orchestrator (F35), CONTRADICTING the then-current shepherd-protocol.md ("you own the merge"); I had already self-merged WI-1176/#1854 under the old rule → momentary doc-vs-directive confusion (reconciled WI-1357). Net SAFER, but the mid-flight switch HURT clarity. (b) **Gate-2 red-green-revert guard** bounced every Type=Bug whose AC didn't co-locate the guard in ONE clause (WI-1176 once, WI-1565 twice — multi-sentence form still bounced). Not a regression, but an under-documented gate that cost 3 bounce cycles until the single-clause form was learned (now pre-declared at refine, F36).
- **H5 (two orchestrators + shared checkout friction): STRONGLY SUPPORTED.** WI-1245 channel-revert (tracked `_state` clobbered by main advances); duplicate-occupancy; a `core.bare=true` ambient-config mutation from a git-exercising test that fatal-ed `git status`; and `gh` attributing my merges to the shared operator account (jojorgen). All are shared-checkout / shared-identity friction.

## 6. What would have saved me (ranked)

1. **A heartbeat/watchdog that pings a shepherd holding an open in-flight item after N min of silence.** Directly prevents BOTH the WI-1565 and WI-1582 silent gaps regardless of cause (rate-limit, watcher bug, drift). Highest leverage — it catches the symptom class, not one cause.
2. **A canonical per-event wake primitive (Monitor tool) as the ONLY sanctioned PR/CI watcher**, banning bare while-true bg loops. Removes the write-only-watcher foot-gun that caused the 93-min gap.
3. **Untracked SESSION-HANDOFF.md as authoritative durable state (already adopted via WI-1245).** This SAVED me across compaction + reboot + login gap — the single best recovery mechanism I had. Keep and standardize it as a required shepherd artifact.

## 7. Keep / kill / fix

- **KEEP:** untracked SESSION-HANDOFF.md as authoritative recovery state; decision-level lane-draining closures (orch-135); pre-declared single-clause red-green-revert guard at refine (F36); refine surface-read (caught a builder 17-vs-8 site miscount before it hardened into an AC); GATE-0 premise-check (caught WI-1571 as already-resolved before any code); orchestrator reading outbox HEAD each sweep.
- **KILL:** bare `while true; do … sleep; done` `run_in_background` loop as a wake source — it is WRITE-ONLY and silently never notifies. It gives false coverage.
- **FIX:**
  - PR/CI watch mechanics → Monitor tool (per-line events) or a bg until-loop that EXITS on the terminal condition (right intent, wrong mechanism).
  - Protocol changes mid-flight (F35 merge-authority flip) → version + announce at a checkpoint boundary; never flip an in-flight rule silently against a live doc.
  - Status-vs-decision signalling for lane closures → already corrected, but promote from tribal fix to a documented channel convention (close sign-offs are decision-level so the escalation watcher surfaces them).
  - Late-session drift → add a lightweight re-grounding cadence (re-read protocol + canon at each compaction/reboot, or a periodic respawn) so degradation doesn't accumulate over multi-day sessions.
