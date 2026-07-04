# ORION Resume Checkpoint — 2026-07-04 ~11:05Z

**Role:** ORION = orchestrator of WS-31 (Safety&Eval), WS-33 (Mobile UX&Nav), WS-34 (Platform Hardening, parked), WS-39 (Launch Readiness). Ramtop owns 11 containment lanes — NEVER touch. On `main` (orchestrator); shepherds work in worktrees.

**Escalation:** authority-not-stakes (C1 canon-gap / C2 out-of-remit / C3 irreversible-outward) → else decide-execute-inform. Standing autonomy grant: execute autonomously, prompt only on genuine input-needed/stuck.

**Clacks:** `_quartet/working/lanes/<lane>/_state/{inbox,outbox}.jsonl`. Inbox write = jq `--rawfile` pattern (NEVER printf/backticks). Orchestrator sole inbox writer.

## Lane liveness (all ALIVE as of ~10:20–11:04Z)
Rate-limit episode resolved: account-wide weekly API limit throttled ALL lanes ~18:47Z(07-03)→~10:20Z(07-04). Was throttle, not session death. All three recovered.

- **WS-31 safety-eval** — last outbox `safety-eval-33` @ 10:19Z (timestamp now REAL UTC, prior 00:00:00Z skew fixed). ALIVE, HOLDING for in-seat operator dispatch go. Last inbox sent: `se-inbox-044` (dispatch-go relay).
- **WS-33 mobile-ux-nav** — last outbox `mobile-ux-nav-43` @ 10:26Z. ALIVE, WI-1393 READY, claiming+building. Last inbox: `muxnav-inbox-045`.
- **WS-39 launch-readiness** — last outbox `lr-out-055` @ 11:04Z. ALIVE, actively driving PRs. Last inbox: `lr-inbox-041`.

## Monitors / crons (re-verify on resume — Monitors die on session teardown)
**Re-armed clean ~16:05Z 07-04 (operator-directed full monitor cycle).** Outbox (script `outbox-watch.sh <LABEL> <path>`, emits new non-info lines): WS-31 `bo8ksklze`, WS-33 `bi9l5spyc`, WS-39 `bqv5gfhs5`. PM-channel `bxnagq2b1` (bash `ws-row-watch.sh`). WS-39 Cosmo stage `b3ygrzrqt` (`stage-watch.sh WS-39 3928bce9-1f7c-8179-b62e-e4c252a53747`). Crons: /loop `ad69793d`, 2h backstop `bbd2ce1b`. PM-watcher state file: `<scratchpad>/ws-row-watch.state.json` — DO NOT re-baseline/delete. Prior (dead) ids: outbox b0eykpqdl/bg3gt8uxw/bzop0bide, PM bjmf85xrg, stage bhzk0y1lu+bf6ka98zv. NOTE: TaskStop does NOT reap orphaned child bash trees on Windows — stage-watch had accumulated 17 orphan procs across teardowns; on any re-arm, kill stray `*stage-watch*`/`*outbox-watch*`/`*ws-row-watch*` procs via PowerShell Stop-Process, then verify counts (1 instance ≈ 3 procs).

## ENE dates
WS-31/33/39 = 2026-07-04 (due today, not breached). WS-34 = 2026-07-10.

## UPDATE ~19:15Z — LATEST, read this first (supersedes older blocks)

**AUTHORITY POSTURE CHANGE (critical, operator-ruled ~18:40Z).** Operator challenged me for asking merge approval: "why are you blocked from ruling on your own authority?" NEW STANDING RULE: merge Gate-1-cleared/verified work on OWN orchestrator authority; keep operator VISIBLE (tell them what landed), do NOT ask permission. Merge-to-main is NOT the irreversible/outward (C3) class — pre-launch integration branch, revertable. Escalate a merge only on genuine ambiguity (contested finding / cross-cutting risk / out-of-remit). An explicit operator "Hold" still binds until lifted. Recorded as memory `feedback_visibility_is_not_approval_merge_on_own_authority`. The ~14:40Z operator merge-HOLD is LIFTED (operator released the decision to me ~18:40Z).

**MERGES (operator released merge decision to me; I ruled):**
- **#1894 (WI-1504 activation instrumentation): MERGED** squash `19739dd4` @18:45Z. `/cosmo:execute complete` ran clean → Reviewing, then LEGITIMATELY bounced Reviewing→Executing via Gate-2 `/cosmo:review` rework (AC5 unmet — see AC re-scope below). Code is SAFE in main. Not a failure.
- **#1900 (WI-1505 kill-switch):** rebased clean onto new main (head `c530b7439`); post-rebase CI RED on a MOBILE FLAKY (`session/index.test.tsx` 58s timing test; #1900 is API-only so disjoint). I authorized ONE confirmation re-run (lr-inbox-062): GREEN→merge; RED-AGAIN→STOP, check if red on main independently, report, NO 2nd re-run, never weaken test. NOT yet merged. Re-run in flight.
- **#1907 (WI-1393 supporter-link, publish-blocker): Gate-1 CLEARED by me** (I diff-verified: nav-preserve holds [no legacy shell/eas.json], GC1 clean [2 added mocks are react-i18next external boundary], core fix verified [pushLinkNewForManagedPerson always carries supporteePersonId, 0-eligible→add-child]). Merge-go given (muxnav-inbox-058). Still OPEN, mobile-ux-nav merging (~25 min as of 19:13Z).

**AC-5 RE-SCOPE RULING (mine, lr-inbox-061/062):** WI-1504 AC5 (real activation rows in Neon, staging build) + WI-1505 staging-rehearsal AC are DEPLOY-TIME verification, structurally unmeetable at code-merge (need migration-applied-to-remote [gated deploy step] + WI-1570 mobile dispatch). RULED: re-scope OUT of code-merge close-gate; both WIs close on verified code+schema deliverable; verification PRESERVED as **WI-1588** (LAUNCH-BLOCKING, Task/P1, WS-39, sequenced after migration-apply + WI-1570 + WI-1503 dogfood). NOT loosening-to-pass (gate preserved+tracked). Guardrail: applies ONLY to genuinely deploy-gated ACs, never a "defer inconvenient AC" loophole.

**WS-31 SAFETY WAVE DISPATCHED (operator authorized binding relay ~18:40Z):** relayed dispatch go se-inbox-056 for WI-1376+1358+1351+1365 (parallel worktrees) + WI-1377 after 1376. HIGH-safety: red-green-revert mandatory per build; WI-1365 = MMT-ADR-0016 §3 + canon + code ONE change-set lockstep; WI-1358 = DPIA lockstep. **⚠ SE APPEARS RE-TORN-DOWN: no safety-build worktrees on disk, 3 unanswered pings (se-056/057/058), 32+ min silent. NEEDS OPERATOR RESPAWN.** On respawn: drains se-054..058, se-056 is authoritative go, FIRE wave.

**MONITORS re-armed ~16:05Z (operator-directed full cycle), CLEAN single instances, SURVIVED all throttle gaps (verified alive 19:13Z: ws-row=3, outbox=10, stage=3):** Outbox WS-31 `bo8ksklze`, WS-33 `bi9l5spyc`, WS-39 `bqv5gfhs5` (`outbox-watch.sh <LABEL> <path>`); PM-channel `bxnagq2b1` (`ws-row-watch.sh`); WS-39 stage `b3ygrzrqt` (`stage-watch.sh WS-39 3928bce9-1f7c-8179-b62e-e4c252a53747`). TaskStop does NOT reap orphaned child bash trees on Windows → on re-arm, PowerShell Stop-Process stray `*stage-watch*`/`*outbox-watch*`/`*ws-row-watch*` then verify (1 instance ≈ 3 procs). Crons: /loop `ad69793d`, 2h backstop `bbd2ce1b`.

**THROTTLE PATTERN (recurring):** account/session throttle froze ALL lanes + orion session ≥2x (~11:15-13:00Z, ~16:43-18:03Z). Signature = /loop backlog + all lanes silent simultaneously. WS-39 SELF-RECOVERS; WS-31 + WS-33 are FRAGILE, need operator respawn each time. Shepherd clocks run ~2h behind real UTC — clacks Z-stamps are authoritative.

**main SYNCED with origin (operator request ~19:10Z):** fast-forwarded 18 commits → `a284c725d` (0/0). Live clacks state (`_quartet/working/lanes/**` uncommitted mods) PRESERVED (incoming touched only `_quartet/working/program/*` + code, no overlap). Do NOT commit the lanes/ clacks mods — live channel state.

**LAST inbox/outbox per lane (~19:15Z):**
- WS-31 safety-eval: inbox→se-inbox-058 (final ping); outbox=safety-eval-38 @18:41Z (pre-dispatch; SILENT since = likely down).
- WS-33 mobile-ux-nav: inbox→muxnav-inbox-058 (Gate-1 clear+merge go); outbox=mobile-ux-nav-50 @18:48Z (merge-ready; merging #1907).
- WS-39 launch-readiness: inbox→lr-inbox-062 (flaky+AC ruling); outbox=lr-out-082 @~19:13Z (ACK, executing #1900 re-run + WI-1588 captured).

**FOLLOW-UP WIs:** WI-1566 (kill-switch isolate-race deferral), WI-1570 (mobile activation dispatch), WI-1574 (activation recording-logic dedup refactor), WI-1575 (fold whole-tree ratchets into change-class checker), WI-1580 (option-2 cross-account-invite for WI-1393), WI-1588 (LAUNCH-BLOCKING end-to-end verification gate for WI-1504/1505).

**OPEN / NEXT:** (1) OPERATOR: respawn safety-eval → fires safety wave. (2) #1900 flaky re-run result → merge or investigate. (3) #1907 merge completion. (4) WI-1504/1505 close on code deliverable + confirm WI-1588. (5) ENE all today (WS-34=07-10); WS-31 builds may run into 07-05.

---

## UPDATE ~14:40Z — state deltas since 11:05Z (superseded by 19:15Z block above)
- **#1894 (WI-1504) — Gate-1 CLEARED by orion (diff-verified: 6-type client enum, server-owned excluded, forgery-guard test). Deferred-sweep confirmations done (WI-1574 owner+target 2026-07-31 + 4 sites; body documents it + WI-1570 note). Branch head `70f4e528b`.** → status now **HELD by operator** (operator ruled "Hold" ~14:40Z via AskUserQuestion). Merge-ready, NOT merging.
- **#1900 (WI-1505) — Gate-1 CLEARED by orion (diff-verified: routeAndStream test b2 @ llm-kill-switch.test.ts:144-164 asserts provider==='kill-switch'; volume tests vol-a/b/c real-path GC1-clean; Sentry decouple intact). Branch head `524308181` (5 commits).** Deferrals: isolate-race→WI-1566, ratchet-gap→WI-1575 (both in body). Volume-alert AC = structured logger.warn hook; operator rule = WI-1500 7th item. → status **HELD by operator** (same "Hold" ruling). Merge-ready, NOT merging.
- **Merge ordering when go comes:** disjoint areas, either order; SECOND PR rebases on main + re-runs CI before merge. WS-39 prepped to land back-to-back. After both: WS-39 runs `/cosmo:execute complete` on each → Reviewing, then launch-ops queue (WI-1500/1503/1506).
- **WS-33 mobile-ux-nav — REVIVED ~14:44Z** (operator respawned; was dead ~4h from 10:26Z). Monitors restarted (inbox b1540j9e5, stage bgjyi95l9). HONEST STATE: WI-1393 Ready but NEVER claimed/dispatched — no builder ran (ended pre-dispatch before the freeze). Now proceeding: capture option-2 cross-account-invite follow-on → claim WI-1393 → dispatch builder to `.worktrees/WI-1393` (Windows haste caution) → Gate-1 hold on push. Last inbox muxnav-inbox-049.
- **WS-31 safety-eval — REVIVED ~14:44Z** (operator respawned; was dead ~4h from 10:19Z). Monitors re-armed (inbox bdm9diaa9, stage bsfwqh62q). Correctly STILL HOLDING for explicit operator dispatch go (operator said "restart monitors + inform," not a go). Last inbox se-inbox-048.
- **WS-39 launch-readiness — ALIVE, idle-waiting** on operator merge-go (last lr-out-066 @ ~14:00Z; last inbox lr-inbox-049).
- **Operator posture ~14:40–14:44Z:** ruled "Hold" on merge (explicit); answered dead-session Q by ACTION (respawned both WS-31 + WS-33); did NOT give WS-31 dispatch go. Coherent: keep dev work flowing (MX on WI-1393 publish-blocker), hold the irreversible/outward gates (merge + safety-dispatch). Q1 merge=HOLD, Q2 respawn=DONE, Q3 WS-31 dispatch=still holding. RE-ASK merge + WS-31 dispatch when operator signals readiness.
- Rate-limit episode #2: ~11:15–13:00Z account/session throttle froze all lanes + orion session (11-deep /loop backlog); WS-39 recovered at 3pm-Oslo (13:00Z) reset, SE/MX did not. Shepherd clocks run ~2h behind real UTC — clacks Z-stamps are authoritative (WS-39 adopted this).

## OPEN GATES / DECISIONS
1. **WS-31 dispatch go (operator).** 4 ruled safety builds queued: WI-1376 (P1 signal-binding) + WI-1358 (telemetry+DPIA) + WI-1351 (adult-CBRN) + WI-1365 (judge-gate) parallel worktrees; WI-1377 after 1376. WS-31 distinguishes in-seat operator go from orion relay — will hold until operator gives go IN ITS SESSION or operator authorizes orion to relay as binding. HIGH-safety: red-green-revert mandatory; WI-1365 carries MMT-ADR-0016 §3 amendment lockstep (ADR+canon one change-set).
2. **WS-39 #1894 (WI-1504 activation instrumentation) — Gate-1 HELD.** CI 14/0 green, RLS migration correct (nullable-aware policy). Advisory claude-review CHANGES_REQUESTED → REQUIRED before merge: (a) schema-boundary `clientActivationEventTypeSchema=z.enum(6 client types)` as ingest eventType + red-green test (server-owned type must 4xx at Zod) + remove redundant `CLIENT_DRIVEN_EVENT_TYPES` route filter; (b) verify server-owned call sites reached (account/sessions/profiles/session-filing-dispatch); (c) WI-1570 (mobile dispatch follow-up) noted in PR body. Branch WI-1504, re-pushing. After clean → orion clears Gate-1 → operator merge visibility → merge.
3. **WS-39 #1900 (WI-1505 kill switch) — final CI round.** Real regression already caught+fixed (Sentry captureMessage coupled into router graph; replaced w/ structured `logger.warn llm.volume.daily_threshold_exceeded`). Volume-alert rule folds into WI-1500 as 7th operator-console item. Shepherd triages advisory before declaring merge-ready (standing norm). Branch WI-1505.
4. **WS-33 WI-1393 (V2 supporter-link, PUBLISH-BLOCKER).** Ready, claiming+building in `.worktrees/WI-1393`. Option(1) MVP = picker of existing managed persons → `/link/new?supporteePersonId=..&relation=..`, graceful-degrade at 0-eligible; option(2) cross-account invite DEFERRED to WS-33 follow-on WI (owed). Gate-1 pattern applies. Mobile jest-in-worktree haste caution given.

## WS-39 operator-action checklist (launch-ops, least-gated first)
FCM/WI-1337 (expo.dev creds) → Sentry/WI-1336 → Resend/WI-1340 → Inngest/WI-1338 → RevenueCat/WI-1328 → store records/WI-1335. Plus WI-1500 alert rules: 6 launch-health buckets (payment-failures, LLM-routing-errors, grader-failures, notification-failures, deletion-audit/retain, privacy-gate+stranded) + 7th = `llm.volume.daily_threshold_exceeded`. Code agents CANNOT create alert rules → operator console.

## Charter / new items (WS-39: 10→13→14)
Operator-greenlit via PM: WI-1500 (alerts-only, 8 signals in 6 buckets, no dashboard MVP, absorbs WI-1399), WI-1503 (dogfood, device-pass prime-and-hold on WI-1341), WI-1504, WI-1505, WI-1506 (refine-hold pending greenlight confirmation). WI-1570 = mobile activation follow-up.

## PM coordination
program-manager:fable via WS-row comments ([pm-directive]→[orch-ack]/[orch-status]). Posted low-slack orch-status. Phase-4 14-item MVP shortlist pending sequencing. WI-1341 store submission held for SPINE M6 (Ramtop lands). Config-T flip: WS-39 prepares diff, Ramtop lands M6.

## Standing norms
Merge flow: shepherd triages advisory review (claude-review newest-head + CodeRabbit) + posts PR+CI+diff → orion Gate-1 review → operator merge visibility → merge. Nothing merges without operator visibility. Executors: run-what-CI-runs for change class before push (RLS both guards + metering + flag-on integration). Zero users pre-launch (all DB data disposable).
