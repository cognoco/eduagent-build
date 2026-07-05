# Orion orchestrator — relaunch packet (2026-07-05)

Read `README.md` (common preamble + version pins) first. You own WS-31 (Safety&Eval),
WS-33 (Mobile UX&Nav), WS-39 (Launch Readiness), WS-34 (parked), Coverage Debt.
Ramtop owns the containment lanes — never touch. Relaunch AFTER ramtop is stable
(a few hours), unless the operator says otherwise.

Your own last checkpoint is `../CHECKPOINT-2026-07-04.md` — this packet supersedes its
"open/next" list where they conflict (merges have since landed).

## Windows cautions (unchanged)
- On any monitor re-arm: kill stray `*stage-watch*`/`*outbox-watch*`/`*ws-row-watch*`
  orphan procs first (TaskStop doesn't reap child bash trees), then replay deltas
  (WI-1606 rule), never re-baseline `ws-row-watch.state.json`.
- Shepherd clocks ran ~2h behind real UTC pre-drain — clacks Z-stamps are authoritative
  until WI-1604 (clock skew, Tier B) lands.

## Verified merge state (checked against GitHub 2026-07-05)
- **#1907 (WI-1393 supporter-link, publish-blocker) — MERGED** `077caef4d`. Confirm
  `/cosmo:execute complete` ran (MX was mid-complete at your last checkpoint).
- **#1900 (WI-1505 kill switch) — MERGED** 07-04 19:27Z (`ca9f59a82` on main). The flaky
  re-run came back green. Run/confirm complete on WI-1505.
- **#1894 (WI-1504 activation instrumentation) — MERGED** `19739dd41`. NOTE: its 0131
  migration caused a 17h staging deploy blockage after an out-of-band staging apply
  during AC5 verification — PM fixed it (WI-1628, Bug Lane/ramtop owns the follow-up).
  Nothing for you to fix, but the WI-1504 close narrative should reference it.
- WI-1588 (launch-blocking end-to-end verification gate) stands, sequenced after
  migration-apply + WI-1570 + WI-1503.

## First acts, in order
0. **Plugin cache check (OPQ-17, P0)** — see README. Your machine is very likely pinned
   at cosmo 0.6.32 like the other two were; fix BEFORE any /cosmo:* command.
1. `[orch-ack]` on your WS rows: relaunched, canon @ nexus@92c9715, honest ENEs.
2. Reconcile WI-1393 / WI-1504 / WI-1505 lifecycle (completes → Reviewing) per above.
3. **WS-31 safety-eval respawn** (with operator): drain `se-054..059`;
   `se-inbox-056` is the authoritative BINDING dispatch go → fire the 4-build wave
   (WI-1376 + WI-1358 + WI-1351 + WI-1365 parallel worktrees; WI-1377 after 1376).
   Red-green-revert mandatory per build; WI-1365 = MMT-ADR-0016 §3 + canon + code one
   change-set; WI-1358 = DPIA lockstep; each stops at Gate-1.
4. WS-39: launch-ops queue (WI-1500/1503/1506) — the **Doppler prd secrets** OQ row
   (P1: WI-1336 Sentry, WI-1340 transactional email incl P0 consent-withdrawal) is still
   Open; nudge via the queue, don't block on it.

## Operator Queue rows that concern you
- Doppler prd secrets (P1, Open) — gates WS-39 items above.
- WS-37 routing of 16 post-graduation Captured items (WI-1419..1434) — awaiting ruling.
- SE respawn + lifecycle catch-up row (Open) — subsumed by First-act 3 once executed;
  tell the PM so it can be closed/folded.
- Coverage Debt (WI-1401..1414): NOT launch-gating — sequence behind WS-39/WS-33 ship work.
