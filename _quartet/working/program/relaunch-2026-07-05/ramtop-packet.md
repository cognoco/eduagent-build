# Ramtop orchestrator — relaunch packet (2026-07-05)

Read `README.md` (common preamble + version pins) first. You own the MentoMate
containment lanes; orion owns WS-31/33/39 + Coverage Debt — never touch those.

## First acts, in order

0. **Substrate selftest (WI-1263 v1, added 2026-07-06).** The Quartet cloud substrate is live
   (Supabase, operator-ruled Option B). Resolve `QUARTET_SUBSTRATE_URL` + `QUARTET_SUBSTRATE_KEY`
   from Infisical `zwizzly-global/prod//quartet` (via `estate-secrets read`), set
   `QUARTET_ROLE=claude:ramtop-orchestrator`, then run the canonical client
   (`_quartet/substrate/clacks.py` on branch `WI-1263-substrate-v1`, nexus repo — instantiate a
   copy outside the git tree): `clacks selftest` → PASS, then `clacks heartbeat orch-ramtop`.
   Your selftest from a second machine completes WI-1263 v1 cross-machine acceptance — report
   the result on WI-1263.
1. Post `[orch-ack]` on your WS rows (V2 finalization, Bug Lane, Compliance—Engineering,
   Identity Cutover): relaunched, canon @ nexus@92c9715, ENE reset to a real checkpoint.
2. **WI-1306 (M2a legacy-table DROP) — finalize.** PR #1925 was merged BY THE OPERATOR
   directly (squash `bfcc8677a`, 08:47Z 07-05; OQ ruling recorded, OPQ-4 Closed). Staging
   apply is DONE and verified (5 tables + 5 enums gone, drizzle journal top = 0132).
   Run `/cosmo:execute complete` on WI-1306 with `--fixed-in bfcc8677a`.
3. Re-arm monitors per monitor-hygiene (replay rule — no silent seeding).

## Park/resume state per lane

**WS-28 V2 finalization**
- **R1 device re-run PASSED** (Zuzka, 2026-07-05 17:40Z, Galaxy S10e, group `c46e0177`;
  ruling on OQ row OPQ-1): both prior defects fixed, full smoke green against production
  (real sign-up → curriculum gen → session → streamed chat). The gate is CLEAR — fire the
  next-milestone kickoff you declared ready-on-R1.
- Riders from the run, both filed: **WI-1640** (one-time white-screen crash on `/ready`
  when the mentor-birth animation completes; recovers on restart) — triage into WS-28 or
  bug lane; **WI-1641** (prod worker secrets drift: Doppler-only additions never reach
  the worker; took prod hard-down until mid-run sync) — launch-relevant, likely WS-39.
- WI-1307 was Executing at drain — verify its worktree/branch state before resuming.

**Bug Lane**
- WI-1565 (staging deploy blocker #1) delivered + merged (#1903, `68be453fb`), staging
  verified green pre-drain; one mechanical Gate-2 bounce was being re-finalized —
  finish that finalization. WI-1571 (seed-helper root cause) is the captured follow-up.
- **NEW: WI-1628 (P1)** — staging deploy blocker #2, found + fixed by the PM while you
  were down: 0131 (WI-1504) DDL had been applied to staging out-of-band without its
  drizzle journal row → every deploy 18:45Z 07-04 → 12:00Z 07-05 failed 42P07. PM
  inserted the missing journal row, reran Deploy → green, verified 0132 applied. Lane
  owns: (a) confirm staging health/smoke, (b) the systemic guard — this is the 3rd
  journal-divergence incident; consider a deploy-preflight that diffs catalog reality
  (to_regclass) vs journal and fails LOUD with the drift named. Full record on WI-1628.

**Compliance — Engineering (WS-29)**
- Session died pre-drain. WI-1507 EARLY PASS is delivered + merged (`0d4cf37cf`, #1896).
  Outstanding: `/cosmo:execute complete` on WI-1507 + capture the FINAL-GATE sibling WI.
  The relaunch kickoff prompt was already handed to the operator — coordinate, don't race.

**Identity Cutover**
- Outstanding from before the drain: current chain position (WI-1364 dead-sweep landed,
  `5f973e07e`), the promised re-wire confirmation (new bucket-(c) WI id), and the
  WI-586/0129 FK verdict. Post an honest [orch-status] with chain position + real ENE.

**WS-37 Seam Hardening** — graduated + Closed 07-03. Nothing to do.

## Operator Queue rows that concern you
- **R1 device re-run** (P0, Open) — your WS-28 gate; watch for its close.
- **OPQ-16** (P1, Open) — reviewer-harness wrong-repo commit-check; ZDX-side, FYI only.
