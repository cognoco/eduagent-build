# ZDX Productization backlog audit — 2026-07-05 (PM, pre-hand-back)

Scope: all 62 non-closed WIs in WS-23 (21), WS-24 (9), WS-26 (29), WS-40 (1), WS-43 (2).
Source: full paginated Cosmo dump (no row cap). Purpose: operator hand-back decision —
what the ZDX orchestrator gets told to run, in what order, and what gets closed/parked
instead. Codex second-opinion pass appended at the end.

Disposition vocabulary: **FIRST-WAVE** (dispatch on hand-back) · **RE-FINALIZE** (work done,
lifecycle stuck) · **KEEP** (backlog as-is) · **REFINE** (needs AC/scope before Ready) ·
**PARK** (deliberate hold) · **CLOSE?** (candidate for Duplicate/Wontfix/Overtaken — needs the
named verification first) · **REPAIR** (metadata broken).

## Cross-cutting findings (read these first)

1. **F-A: WI-1525 is overtaken by delivered work.** It asks for `/cosmo:next` + queue-health;
   WI-1631 (#54) and WI-1632 (#56) shipped both this week. CLOSE? as Duplicate → 1631/1632
   unless a residual sliver (ranking nuances) survives comparison.
2. **F-B: the Reviewing trio (WI-1282/1284/1295, Windows claude-CLI judge bugs) may be mooted**
   by WI-1626 (codex-default judge) + WI-1634 (codex flag fix). If codex is the sanctioned
   default, these are fallback-path bugs at best. Verify then CLOSE?/downgrade — they're also
   all stuck "Awaiting Info" with no reviewer running.
3. **F-C: WI-1600 has NO Stage and NO State** — a raw page-create that bypassed capture.ts.
   It is living proof of WI-1332 (stage-less orphan guard). REPAIR to Captured + cite it as
   WI-1332's evidence.
4. **F-D: cross-workstream WP bundles blur ownership.** WP-1515 (WS-23, Ready) bundles WS-24's
   WI-1294 as PRIMARY; WP-1518 (WS-26, Ready) bundles WS-23's WI-1312. Worse: WI-1356 is
   bundled in WP-1515 while separately Executing with a live claim + open PR #61. Reconcile
   before dispatching either WP: either the WP owns its children or it doesn't.
5. **F-E: retro capture-stubs have empty descriptions** — WI-1604/1607/1608 (and the 4 stranded
   items carry context in the AC field instead of Description). Hygiene, but it means REFINE
   is mandatory before any of them dispatch.
6. **F-F: WI-1543 (WS-43) has a live codex claim edited TODAY 18:43Z** — during the "fleet
   down" window. Someone/something is active. Reconcile the claim before hand-back.
7. **F-G: priority gaps** — WI-1236 and WI-1229 have no Priority set.
8. **F-H: the tooling repo has no CI** (WI-1264): cognoco/zdx-marketplace — the repo every
   lifecycle tool ships from, merging trunk-based with zero required checks, while this week's
   incidents were all tooling-regression classes. Underpriced at P3.

## WS-23 — Cosmo improvements (21)

| WI | Stage | P | Disposition | Note |
|---|---|---|---|---|
| 1634 | Executing | P1 | RE-FINALIZE | stranded; codex `--ask-for-approval` flag bug (fix WI-1634 = judge usable) |
| 1630 | Executing | P1 | RE-FINALIZE | stranded; branchMergedIntoOrigin full-tree diff false-negative |
| 1629 | Executing | P1 | RE-FINALIZE | stranded; qa cwd repo-guard fix; on finalize → PM does the one independent close (OPQ-16 bootstrap) |
| 1605 | Executing | P2 | RE-FINALIZE | stranded; dashed-UUID in related_items |
| 1356 | Executing | P2 | RE-FINALIZE | live claim + PR #61 OPEN — merge + finalize; ALSO bundled in WP-1515 (F-D: un-bundle) |
| 1245 | Executing | P0 | IN MOTION | cutover ruled (OPQ-19); finalizes after the window |
| 1295 | Reviewing | P3 | CLOSE? | F-B: verify codex-default moots it |
| 1284 | Reviewing | P2 | CLOSE? | F-B: same; API-key-precedence may still matter for codex? verify |
| 1282 | Reviewing | P2 | CLOSE? | F-B: same (`which` ENOENT) |
| 1515 | Ready | P2 | REFINE | WP coherence broken (F-D); re-scope after 1356 finalizes, 1318 unblocks |
| 1296 | Ready | P2 | FIRST-WAVE | summary append→replace; kills the rework re-bounce loop |
| 1236 | Ready | — | REFINE | set Priority (suggest P2); orchestrator-boot monitor arming — pairs with relaunch discipline |
| 1635 | Captured | P1 | FIRST-WAVE | Executed-By stamping — UNBLOCKED (OPQ-18 ruled; schema half done by PM) |
| 1525 | Captured | P2 | CLOSE? | F-A: overtaken by WI-1631/1632 |
| 1633 | Backlog | P3 | KEEP | fuzzy repo-inference follow-up |
| 1592 | Backlog | P3 | KEEP | doc resync; cheap idle-filler |
| 1369 | Backlog | P3→P2 | FIRST-WAVE | Bug-AC red-green-revert template — kills a recurring Gate-2 bounce class (3 bounces in one day; operator memory confirms recurrence) |
| 1325 | Backlog | P2 | KEEP | reviewer file-checker bracket paths; same family as WI-851 — consider bundling |
| 1318 | Backlog | P3 | KEEP | in WP-1515; Blocked (enum change) |
| 1312 | Backlog | P3→P2 | KEEP | zombie-Executing guard — TODAY's stranded-items class; in WP-1518 |
| 1215 | Backlog | P3 | PARK | blocked on Notion GitHub connector working |

## WS-24 — NEX/ZDX improvements (9)

| WI | Stage | P | Disposition | Note |
|---|---|---|---|---|
| 1297 | Executing | P3 | RE-FINALIZE or re-claim | claim `claude:hex:WI-1297` likely dead with the machine; project-label audit pass |
| 1294 | Ready | P3 | REFINE | PRIMARY of WP-1515 but lives in WS-24 (F-D) |
| 1594 | Captured | P2 | REFINE | AC-amendment-with-provenance convention; pairs with 1356 close |
| 1287 | Backlog | P2 | KEEP | ZDX-ADR for Pipeline state machine |
| 1267 | Backlog | P2 | KEEP | worktree shared-.git/config hardening — real estate-wide class |
| 519 | Backlog | P3 | PARK | strategic; revisit trigger = ZDX productionization |
| 448 | Backlog | P2 | PARK | already Parked state; propagation engine |
| 439 | Backlog | P2 | PARK | already Parked state; rules-snippet sync |
| 404 | Backlog | P2 | KEEP | plan-skill promotion; strategic, not urgent |

## WS-26 — Quartet MVP (29)

| WI | Stage | P | Disposition | Note |
|---|---|---|---|---|
| 1600 | **none** | P2 | REPAIR | F-C: stage-less; set Captured, triage; evidences WI-1332 |
| 851 | Ready | P1 | FIRST-WAVE | reviewer-clone harness (Windows-doppler-on-Mac + evidence parser) — the false-bounce machine; unblocks the 2 waiting Gate-2 closes staying trustworthy |
| 1225 | Ready | P2 | FIRST-WAVE | dispatch rails (isolation, CI-repro, verify-at-source) — direct retro relevance |
| 1224 | Ready | P2 | KEEP | Brain hardening; good wave-2 |
| 1159 | Ready | P2 | FIRST-WAVE | reviewer read-only sandbox — a reviewer with full-machine write is a live risk |
| 1158 | Ready | P3 | KEEP→bump if Codex pilot approved | runner-adapter contract — direct precursor to the Codex pilot |
| 1518 | Ready | P2 | REFINE | WP blocked on WI-1216 landing; F-D cross-WS child |
| 1511 | Backlog | P3→P2 | KEEP | hollow-green claude-review on nexus — trust bug in the merge gate |
| 1510 | Backlog | P3 | KEEP | doc gotcha; cheap |
| 1509 | Backlog | P2 | KEEP | in WP-1518 |
| 1367 | Backlog | P3 | KEEP | PM-move provenance rule; canon, small |
| 1332 | Backlog | P3 | KEEP | in WP-1518; F-C is its evidence |
| 1264 | Backlog | P3→**P1** | FIRST-WAVE | F-H: CI + branch protection on the tooling repo |
| 1263 | Backlog | P3 | REFINE→spike | portable lane-state substrate (refined today; decision-doc deliverable) |
| 1237 | Backlog | P2 | KEEP | orphan-adoption design; head of WP-1518 |
| 1230 | Backlog | P2 | KEEP | channel schema enforcement design |
| 1229 | Backlog | — | REFINE | set Priority; multi-WS shepherd design |
| 1226 | Backlog | P3 | KEEP | standing-lane lifecycle + cutover-owner gate |
| 850 | Backlog | P2 | REFINE | check overlap with landed WI-1606 replay rule + existing monitor-manifest.json before dispatch |
| 1638 | Captured | P3 | REFINE | OQ classifier wiring (two open seams) |
| 1621 | Captured | P3 | KEEP | macOS watchdog validation on Ramtop; pairs with 1614 |
| 1614 | Captured | P1 | REFINE + schedule | recovery validation vs a REAL rate-limit death — opportunistic by nature; define the drill |
| 1609 | Captured | P2 | REFINE | machine-readable HOLD — high leverage (today's WI-1245/stranded confusion) |
| 1608 | Captured | P3 | REFINE | empty stub (F-E) |
| 1607 | Captured | P2 | REFINE | empty stub (F-E); respawn-into-healthy-window |
| 1604 | Captured | P2 | REFINE | empty stub (F-E); clock-skew self-check |
| 1526 | Captured | P2 | FIRST-WAVE (refine→ready) | flow-stewardship duty — operator-ratified spec appended 2026-07-05; the accountability fix |
| 1370 | Captured | P2 | KEEP | ownership-prose sweep |
| 1281 | Captured | P3 | KEEP | kickoff-template pruning |

## WS-40 — Program Layer (1)

| WI | Stage | P | Disposition | Note |
|---|---|---|---|---|
| 1366 | Captured | P3 | KEEP | schema.md lockstep catch-up for the 3 WS-DB properties |

## WS-43 — Codexification (2)

| WI | Stage | P | Disposition | Note |
|---|---|---|---|---|
| 1543 | Executing | P2 | RECONCILE CLAIM (F-F) | codex Brain binding; claim touched today during "fleet down" |
| 1544 | Captured | P2 | REFINE→FIRST-WAVE if Codex pilot approved | Codex end-to-end lifecycle smoke — the gate for the operator's Codex-delivery idea |

## Codex second-opinion pass (2026-07-05) — verdict + PM adjudication

Full review in `CODEX-VERDICT.md` (codex exec, read-only, against this file + the raw
62-item JSON slice). **Verdict: CONCUR-WITH-AMENDMENTS** — 7 amendments, adjudicated:

1. *No closes from the slice alone (1525, 1282/1284/1295)* — **ACCEPT**; consistent with the
   audit's own CLOSE?-means-verify-first framing. Closes are NOT pre-authorized; the named
   comparisons (vs 1631/1632, vs codex-default judge) are mandatory and are judgment work,
   not "minutes each" — step-2 estimate corrected.
2. *WI-1296 before the re-finalize wave* — **ACCEPT, genuine catch.** Re-finalizing bounced
   items while completion-summary append→replace is unfixed risks reproducing the exact
   re-bounce loop the wave is meant to clear. 1296 becomes step 0.
3. *1635/1526 not dispatch-ready per Cosmo fields* — **PARTIAL.** Codex's slice predates the
   OPQ-18 ruling; WI-1635 IS unblocked in reality. But the repair rider stands: fix its Cosmo
   fields (State Blocked→Active, empty description, title's "do not dispatch") BEFORE dispatch.
   1526 confirmed as refine→ready→dispatch, never straight execution.
4. *Metadata/content repairs for 1594, 1609, 1614, 1370* — **ACCEPT**; added to step 2
   (state="-" on seven items; 1370 is a contentless Captured — audit missed it).
5. *Promote 1609 + 1236 after repair* — **ACCEPT.** Machine-readable HOLD (1609) before broad
   finalize/liveness activity; monitor-arming (1236) before flow-stewardship prose.
6. *1614 = scheduled P1 drill, not refine backlog* — **ACCEPT.**
7. *Unclaimed-Executing items (1634/1630/1629/1605) cited as WI-1312 evidence* — **ACCEPT**;
   they are the zombie-Executing class exhibit, not just cleanup.

## Recommended hand-back package (REVISED post-Codex; order matters)

0. **WI-1296 alone first** — summary append→replace; gates the wave below (amendment 2).
1. **Re-finalize wave** (after 1296 lands): 1634, 1630, 1629 (+PM independent close), 1605,
   1356 (merge #61), 1297 (re-claim). Pure completion, no new build. Each unclaimed-Executing
   item is logged as WI-1312 evidence in passing.
2. **Repairs/verifications** (mixed effort — field repairs are minutes, the verifications are
   judgment work): 1600 stage repair; 1635 field repair (State→Active, description, title);
   state fields on 1594/1609/1614; content for 1370; priorities 1236/1229; 1543 claim
   reconcile; THEN 1525 vs 1631/1632 comparison and 1282/1284/1295 vs codex-default verdict.
3. **First-wave dispatch**: 1264 (P1-bump), 851, 1369 (P2-bump), 1225, 1159; plus 1635, 1236,
   1609 once their step-2 repairs land; 1526 refine→ready→dispatch.
4. **Refine queue** for the wave after: 1607, 1604, 1614 (scheduled drill, per amendment 6),
   1518/1515 (WP re-scope), 1594, 1638, 1263 (spike), 850 (overlap check), 1544 (Codex-pilot
   gate — promote if the pilot is approved).
5. Everything else KEEP/PARK as tabled.
