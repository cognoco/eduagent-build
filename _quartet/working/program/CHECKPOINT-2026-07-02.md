# ORION Program Checkpoint — 2026-07-02 (token-budget save)

> Machine-local resume state. Read alongside `orchestrator-protocol.md` (re-read on resume),
> `program-roster.md`, `activation-queue.md`, `monitor-manifest.json`, and each lane's
> `execution-tracker.md`. Not committed.

## Scope (operator-assigned)
ORION owns **WS-31, WS-33, WS-34**. Ramtop owns the 11 containment lanes — never touch. Program
files machine-local, uncommitted. Cross-machine visibility absent (WI-1263) — coordinate via Cosmo + operator.

## LATEST RESUME STATE (2026-07-03 ~14:14Z — pre-compaction snapshot)

**Read this block first on resume; it supersedes older per-lane detail below where they conflict.**

- **LAUNCH-GATING SAFETY COMPLETE + VERIFIED.** Both P1 launch-blockers Closed with break tests I confirmed in-commit: WI-1349 (Gemini-under-18 age gate, `29dfc891a`), WI-1348 (minor-PII echo-back gate, `7595f889c`, 199-line negative-path test, both streaming+non-streaming seams). Operator ruled launch-gating = option A (2 P1s gate launch, rest fast-follow).
- **3 OPERATOR FORKS OPEN (all fast-follow, all builds HELD, awaiting operator ruling — do NOT default/auto-proceed; ADR-class):**
  1. **WI-1350 Fork 1** — suitability gate blocks `violation` only *(my rec)* vs `violation`+`concern`. Gates WI-1365 build.
  2. **WI-1350 Fork 2** — judge-unavailable: fail-open-with-alarm *(my rec)* vs fail-closed. Gates WI-1365 build.
  3. **WI-1351** — gate ADULTS for catastrophic CBRN/explosives how-to subset: YES-narrowly-scoped *(my rec)* vs NO-wontfix. Build held fork-blocked at Refining.
  - Ruling WI-1350 carries a lockstep **MMT-ADR-0016 §3 phase-5** amendment; numeric threshold is calibration-data-gated regardless of posture. WI-1351 = new adult-content policy (C1+C2+compliance).
  - **WI-1358** (§6(b) guardian-notification-on-abuse-disclosure) = 4th potential fork; shepherd doing canon check-then-flag on refine; NOT to build guardian-notification past undecided policy (guardian-is-abuser failure mode).
- **WS-31 fast-follow wave (shepherd pacing autonomously, no build past a flagged fork):** WI-1359/1360 (tripwire+battery engineering, ≥0.98-precision bar), WI-1361 (offline shadow audit), WI-1365 (suitability-gate impl, held on WI-1350), WI-1353 (doc), WI-1358 (policy-check), WI-1351 (held). **WI-1288** (migration `0129`) = deploy-gated HOLD (operator deploy window). WI-1316 (eval-harness FP) close-ruling posted; WI-1285/1350/1352 Closed.
- **WS-33: DONE bar WI-904.** 9 Closed, only WI-904 (dictation HITL, operator-handled) open. Shepherd ALIVE + idle-holding (confirmed 13:33; re-pinged 14:11 `muxnav-inbox-020`). No actionable work.
- **CLACKS SEQUENCE:** WS-31 inbox last = `se-inbox-026`; WS-33 inbox last = `muxnav-inbox-020`. Channel files `_quartet/working/lanes/<lane>/_state/{inbox,outbox}.jsonl`. Write inbox via `jq -nc --arg/--rawfile … >> file` (never printf/backticks — corruption risk). Validate each write with `tail -n1 | jq -e .id`.
- **MONITORS:** Cosmo-Stage watchers `bnutpcm1x` (WS-31) + `bwpfyfk0b` (WS-33) firing reliably (Stage read as SELECT not status). **Outbox watchers `bj10kh3t0`/`bj85k2iux` UNRELIABLE** — recent `needs-operator` messages (WI-1350/1351 forks) surfaced only via the /loop, not the watcher. Re-arm outbox watchers on resume; meanwhile the loop is the reliable catch.
- **/LOOP ACTIVE:** cron `422f47a8`, every 10 min (`*/10 * * * *`), session-only, auto-expires 7 days. Task: per shepherd, check last-loop activity (outbox + Cosmo edit), ping if dark. WS-33 idle-confirmed → space its liveness checks to ~30min. On each fire also scan both outboxes for unhandled `needs-operator`/`needs-orchestrator` (watcher gap).
- **REMIT CALIBRATION (operator, logged as WI-1354, Quartet MVP):** escalate on AUTHORITY not STAKES. Escalate only C1 (new policy/canon-gap), C2 (out-of-remit: launch/budget/positioning), C3 (irreversible/outward). Enforcing decided canon = execute+inform. The 3 open forks are correct C1/C2 escalations; the earlier P1-prioritization was over-escalation.

## Lane state
### WS-33 · Mobile UX & Navigation (`mobile-ux-nav`) — NAV-CORE SLICE CLOSED; WORKSTREAM NOT GRADUATED (3 items open)
- **CORRECTION 2026-07-03:** the shepherd announced whole-workstream "🎓 graduation" but only the 7-WI nav-core SLICE closed. Operator caught it. LESSON: verify a shepherd's done/graduated claim against a FULL Cosmo workstream query before relaying — never trust the outbox assertion. Graduation = every WS-33 item Closed or explicitly deferred out of lane.
- **Nav-core slice CLOSED (7):** WI-1204, WI-1212, WI-1210, WI-1142, WI-1209, WI-1208, **WI-1283** (closed 06:27Z via the [orchestrator:ruling] Cosmo-comment relay — mechanism VALIDATED).
- **WS-33 VERIFIED 12:06Z (full Cosmo query): 9 Closed, 1 open.** Closed(9): WI-1142/1184/1204/1208/1209/1210/1212/1283/**1317** (e2e coverage, merged PR#1850 strict-green, closed on squash 742732d3). Open(1): **WI-904** only (Backlog, dictation-playback HITL, operator-handled). WS-33 FULLY GRADUATES once WI-904 is dispositioned. WI-1248 remains re-homed→WS-34.
- **WI-1184 CLOSED 2026-07-03** via operator-authorized (option A) documented MANUAL close: Stage=Closed, State cleared, Resolution=Cancelled (closest enum), Resolved=2026-07-03, provenance comment on page (true disposition=not-reproducible; HEAD 9e42b9ea3; cites WI-1318 for missing Not-Reproducible value + no-close-from-Refining path). One-off exception to "no agent-asserted closes," justified by verified-not-reproducible + real tool gap + P3; operator-ruled. Re-tag Not-Reproducible when WI-1318 lands.
- **Closed:** WI-1212, WI-1204.
- **Reviewing:** WI-1208 (verified already-fixed; ruled honest option-b close (`muxnav-inbox-008`); may park on tooling gaps WI-1293/WI-1296 if reviewer can't express already-fixed), WI-1210, WI-1142, WI-1209 (merged `5d0677a5`, landed in Reviewing on resume).
- **Executing (last active nav-core unit):** WI-1283 (incidental shelf `[subjectId]` Back-nav bug; shepherd's own capture; refined→Ready→claimed→building on resume). When it closes + siblings clear review, WS-33 graduates.
- **Re-homed → WS-34:** WI-1248 (mis-refined Button sweep; Backlog; blocked-by WI-1298).
- **Parked-documented (not-reproducible) at Refining:** WI-1184 — verified NOT-REPRODUCIBLE on resume (HEAD `9e42b9ea3`, 3 clean useQuery hooks, only route-hitting spec `parent-ux-pass.spec.ts:113-119` unwired). Ruled option-c park (`muxnav-inbox-013`): no false Cancelled, no tool forced; WS-33 may graduate with it parked. Honest close blocked on new tooling WI-1318. Child-subject e2e coverage gap → captured **WI-1317** (WS-33, Hygiene P3, Captured).
- Reviewer: **live** (closed WI-1212/1204).
- **⚠ WI-904 — ORPHANED-EXECUTING, needs triage on resume.** "Dictation playback: rework pacing around clear speech and phrase/sentence pauses." Stage=Executing, State=Active, **Claimed By=none**, Workstream=WS-33. Direct-read 2026-07-03. Surfaced via the WS-33 Cosmo-Stage monitor as `NEW=Executing` at 20:13Z — i.e. its Workstream relation was *just* set to WS-33 while already mid-Executing elsewhere. NOT in the shepherd's tracked slice; NOT dispatched by this ORION (shepherd was holding since 19:32). Resume action: triage its true state — either an abandoned claim to reset to Backlog/Ready, or an in-flight item from another instance re-homed here. Do NOT assume it's this lane's work; verify claim + author before touching. No code at risk (Cosmo-state only).

### WS-31 · Safety & Eval (`safety-eval`) — CORE CLOSED; audit (WI-1285) delivered 6 findings; 2 new P1s building
- **WI-1285 audit executed** → 6 findings WI-1348..1353 (2×P1, 3×P2, 1×P3). WI-1285 itself bounced at review (LEGIT: asserted 8-site inventory not durably on page — evidence-not-assertion; shepherd appending real artifact, se-inbox-021).
- **LAUNCH-GATING RULED (operator, option A, 2026-07-03):** WI-1348 (minor-PII echo-back gate) + WI-1349 (Gemini-under-18 age classification) = LAUNCH-BLOCKERS, building now with full Gate-1 rigor. WI-1350/1351/1352/1353 = FAST-FOLLOW (not launch-gating). WI-1351 (adult catastrophic/CBRN gate) may carry a genuine adult-product-posture fork — shepherd to flag if it emerges.
- **Remit lesson (operator 2026-07-03):** I over-escalated P1 prioritization — both P1s enforce ALREADY-DECIDED canon (Gemini-under-18 ban; minor server-side-gate posture), so they are execution, not new-policy calls. Accountability = make the call. Only genuine operator decision here was launch-gating (touches launch strategy I don't own).
### (prior WS-31 close state ↓)
- **VERIFIED via full Cosmo workstream query 2026-07-03 (5 items):** Closed(3) = WI-1154 (P1), WI-1155 (P2), WI-1315 (dedup dup). Captured-deferred(2) = WI-1316 (eval-harness HW02 FP, optional-refine), WI-1285 (systemic prompt-only-safety audit, refine-later). Core safety work DONE end-to-end; remainders intentionally parked per se-inbox-016.
- **Data note:** WI-781 (Closed) and WI-1288 (parked, migration 0129, deploy-gated) do NOT appear under the WS-31 workstream relation — confirm WI-1288's workstream home so it isn't orphaned (not urgent; parked).
- **WI-1154 (P1 safety leak): MERGED** — PR #1833 → `6bcb042c9`, 9/9 green, break test verified. In Reviewing awaiting reviewer close. Was a regression of closed WI-558 (prior fix `223f636d` was prompt-only, snapshot-verified, no break test).
- **WI-781** (flag flip, code-only): **MERGED** `2fedbd627` → Reviewing awaiting reviewer close. Split executed — schema half is WI-1288.
- **WI-1155** (envelope discipline): EXECUTING on resume. A1 (SGA04 server-side `insufficient=true` on strip, red-green proven, live-passes) + A2 (HW04 homework incomplete-source prompt, live `insufficient=true`) DONE; snapshot over-regen fixed (275→18 files, relocated to homework block). Shepherd RULING 1: B1 prompt-only failed 4/4 live → authorized B2 (server-side `runTeachBackGrader`, fail-open, mirrors `runChallengeRoundGrader`) within mandate — ORION ACKed, no override. RULING 2: HW02 model behavior is CORRECT; only the harness check false-fires → split to **WI-1316** (eval-harness correctness, P2, related WI-1155). **WI-1315** = accidental dedup double-fire of WI-1316 (WI-1284 manifestation) → mark Duplicate at triage (WI-1316 canonical).
- **WI-1288** (schema-hygiene: concept-mastery FK repoint + migration `0129`): Captured, parked-last. **`0129` reviewed + APPROVED by ORION** (`se-inbox-007`); prod on operator deploy gate.
- **WI-1285** (systemic audit: prompt-only safety guards w/o server-side gate + deterministic test): Captured, parked.
- Reviewer: **UNCONFIRMED — OPEN OPERATOR ASK.** WI-781 + WI-1154 await it. Kickoff: `safety-eval/reviewer-kickoff.md`.

### WS-34 · Platform Hardening (`platform-hardening`) — PARKED
- 14 original WIs + inbound **WI-1248** + **WI-1298** (Button.tsx style/className override + danger variant). Release gated on: WS-31/33 attention freed + Ramtop file-overlap deconfliction (WI-1183/1179/1069/1098) + operator go. No monitors while parked.

## Monitors (manifest: `monitor-manifest.json`) — reconcile on resume
- WS-33 Cosmo-Stage `bwpfyfk0b` · WS-33 outbox `bj85k2iux` · WS-31 Cosmo-Stage `bnutpcm1x` · WS-31 outbox `bj10kh3t0`. All persistent.

## Meta-watch captures today (Quartet/Cosmo dogfooding → Cosmo improvements DS)
- WI-1282 (triage Windows `which` ENOENT) · WI-1284 (judge subprocess auth broken both providers) · WI-1293 (no already-fixed disposition in review/qa) · WI-1296 (complete append-not-replace deadlock). Product: WI-1285. Design-system: WI-1298.
- **Added 2026-07-03 resume:** WI-1312 (zombie Executing — Stage=Executing w/ no claim; live ex. WI-904) · WI-1318 (no not-reproducible close path at Stage=Refining; live ex. WI-1184) · WI-1325 (review/qa file-existence checker mishandles Expo [param] bracket paths + misreads route literals as file cites; live ex. WI-1283) · WI-1326 (dod.bug.regression_guard_declared phrasing-sensitive false-negative; WI-1283 RED vs sibling WI-1208 clean). All Cosmo improvements, related WI-1266/1293/1296/1263.
- **WI-904 (operator ruling 2026-07-03): OWNED by ORION into WS-33.** Was already WS-33 + zombie-Executing → I reset Stage=Executing→Backlog (corrective, claim fields null). Now legit WS-33 net-new backlog (Enhancement P2, dictation-playback pacing); WS-33 shepherd to triage/refine/sequence AFTER nav-core graduation — must not re-block nav-core close.
- **WI-1283 (2026-07-03): RULED review-tool false-negative** (files exist; guard declared+executed 27/27; sibling WI-1208 identical class closed clean = phrasing-sensitive parser inconsistency). Reviewer-facing [orchestrator:ruling] comment posted to WI-1283's Cosmo page (id 3928bce9-1f7c-819d-a613-001d9993e300) authorizing close. Contingency if reviewer re-bounces: align AC guard phrasing to WI-1208's accepted form + re-complete (parser-compatible, not weakening). SOLE nav-core graduation blocker.
- **WI-1293 CORRECTION 2026-07-03:** WI-1208 was a MISDIAGNOSIS, not a true instance — its real fix is recent green commit `eb9423945`/PR#1827 (MODE_NAV_V2-aware `handleBack` + regression tests) that the first builder summary wrongly denied. WI-1208 closed honestly. WI-1293/1296 remain valid but now UNEVIDENCED by a live case. Learning: verify Fixed In in code (git show), never from builder prose.
- **WI-1315==WI-1316 dedup double-fire** (broken judge, WI-1284 manifestation): WI-1316 canonical (eval-harness HW02 false-fire, wired→WI-1155); WI-1315 Closed as Duplicate.
- Standing workaround for all Cosmo captures on this host: `--judge-provider claude`; capture degrades to structured-recall dedup.
- **NOTE:** roster meta-watch log was externally reverted 2026-07-03 (lost the above additions there); this CHECKPOINT is now the durable home for the resume-session captures. Canonical source of truth is Cosmo itself (the WIs exist regardless).

## Open items for resumed ORION
1. **WS-31 reviewer spawn** — the one hard blocker (P1 WI-1154 + WI-781 awaiting close). Operator ask, unanswered.
2. WI-1208 — confirm honest already-fixed close succeeds or park on WI-1293/1296.
3. WI-1184 — staging repro or `blocked`.
4. WS-34 unpark — deferred (operator-held; Ramtop deconfliction).
5. Await both shepherds' final checkpoint `decision` lines (requested via `muxnav-inbox-011` / `se-inbox-010`).

## ORION in-seat rulings this session (not all reflected in Cosmo yet)
Two dedicated shepherds not one overloaded (WS-31 activate, WS-34 park). WI-781/0129 split. `0129` approved. Honest already-fixed close (WI-1208 option-b). Defer WI-1248 → WS-34. Prod-flag mechanism-gate (code-default = normal pipeline). Prompt-only-safety-fix regression lesson → server-side gate + deterministic break test.

## Polling alignment (2026-07-03 ~15:30Z — protocol f8e68eb)
SESSION-LOCAL, ALL MORTAL — re-arm on resume:
- PM-channel watcher: Monitor `bh1a5en2n` runs `<scratchpad>/ws-row-watch.sh` (4.5-min poll, raw REST,
  delta-only: new WS-row comments + Expected Next Event breaches; state `ws-row-watch.state.json` — do
  not delete/re-baseline). Replaces flat agent-poll per program-manager-protocol.md (f8e68eb).
- Backstop: session cron `bbd2ce1b` (every 2h at :43) verifies/re-arms the watcher + refreshes ENE dates.
- Lane outbox watchers: `b1mvk3xb1` (WS-31), `btg66bhe0` (WS-33); WS-39 lane live (shepherd session
  eb4593fb, monitors bkid4rfjo/beru2atzr on its side). Cosmo stage monitors: `bnutpcm1x`/`bwpfyfk0b`.
- /loop cron `422f47a8` (10m shepherd sign-of-life) still running.
- ENE dates set 2026-07-03: WS-31=07-04, WS-33=07-07, WS-34=07-10, WS-39=07-04. Keep real at every
  transition — PM liveness layer keys off them.
- Discipline: ack PM `[pm-directive]` row comments with `[orch-ack]` (receipt + position); PM sees acks
  in ~4 min. No [pm-directive] comments existed as of 15:25Z (verified all 4 rows).

## Post-crash monitor roster (2026-07-03 ~17:35Z — after IDE crash + session resume)
Session id changed to 1cea8fc2-... on resume; scratchpad watcher scripts still at the 0464aa76 path.
LIVE monitors (all persistent):
- b0eykpqdl — WS-31 outbox watcher
- bg3gt8uxw — WS-33 outbox watcher (survived crash)
- bzop0bide — WS-39 outbox watcher (NEW this recovery)
- bjmf85xrg — PM-channel watcher (ws-row-watch.sh; killed 2 orphan writers + 1 self-inflicted before clean re-arm)
- bf6ka98zv — WS-31 Cosmo Stage watcher (stage-watch.sh WS-31 <page>)
- bhzk0y1lu — WS-39 Cosmo Stage watcher (stage-watch.sh WS-39 <page>)
Crons (session-only, die on exit):
- ad69793d — /loop 10-min shepherd sign-of-life (re-armed; old 422f47a8 died in crash)
- bbd2ce1b — 2h PM-watcher backstop sweep (survived)
New script: <scratchpad>/stage-watch.sh <label> <ws-page-id>.
Shepherd resume acks: WS-33 mobile-ux-nav-38 (reconciled -030), WS-31 safety-eval-29 (4 rulings acked, parallel build plan), WS-39 pinged lr-inbox-011 (awaiting ack).
ENE dates unchanged/valid: WS-31=07-04, WS-33=07-07, WS-34=07-10, WS-39=07-04.
