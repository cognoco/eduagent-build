# mvp-roadmap session state — checkpoint 2026-07-15 (lockdown sitting close)

## CURRENT MANDATE (operator, 2026-07-15 — ACTIVE, read first)

**LOCKDOWN SITTING CLOSED — backlog fully scoped; execution posture next.** Ruling records: `2026-07-15-lockdown-lane-load-preread.md` (LD1–LD5 block at top), `2026-07-15-full-backlog-disposition-sweep.md` (§A/§B rulings inline), `2026-07-15-legal-dependency-plan.md` (§5 OPQ reconciliation), `2026-07-15-consolidated-scope-inventory.md` (sittings 1–2).

**Rulings this sitting:** LD1 split → **WS-54 Store, Billing & Release** (12 ship-chain items out of Launch Readiness). LD2 Option 1 → §3 spine + legal-dependency register adopted, clocks start week of 07-15; 14 Cosmo `Blocked by` edges live (three gates: WI-1577, WI-1335, WI-1506 — counsel blocks gates, not dev). WI-1559 AND WI-1111 both re-bucketed to counsel (operator: not internally rulable) — both ride the **OPQ-22 packet; its dispatch = the DPIA-path clock-start**. OPQ reconciliation ruled: wholly-operator legal items got rows **OPQ-102..115** (standing rule: wholly-operator item ⇒ OPQ row at capture); deadlines 07-24 on OPQ-102 (DPO) + OPQ-110 (DPA loops). LD3 fix-now (WI-1986; WI-1902 → V2 finalization). LD4 **superseded by the full-backlog disposition sweep** — operator rejected priority-as-scoping (sequence: deliver-at-all? → MVP/post-MVP → deps → grouping; P-labels have no scoping authority). Sweep: 116 never-ruled items → **MVP 50 / pen 62 / closed 3 / Zuzka 1**; 112 placements executed, 0 failures. WI-1898 split (floor MVP Safety & Eval; WI-2115 → pen). WI-1292 ruled MVP window (triple gate unchanged). Closes: WI-1452 Duplicate→WI-1704 (hand-applied Refining→Closed per lifecycle.md:92, operator-ruled), WI-1867 + WI-2013 Cancelled umbrellas. LD5 stands (no effort ceremony).

**Jørn's new clock-starts (deadlined 07-24):** OPQ-22 dispatch (carries WI-1559 entity + WI-1111 Art 9 — the whole DPIA path waits on it) · OPQ-102 DPO engagement · OPQ-110 DPA/TIA vendor loops. **Zuzka:** OPQ-117 (WI-1897 cap-hit UX: all-in vs split, Hex rec split) + existing 40 etc. **Parked:** Quartet Runtime lane retirement (WI-1708 + WI-546 need a ZDX-reboot home; 17 closed items' lane attribution at stake — rec: rename+close lane, don't trash). **Next session:** Stream-2/Wave-0 kickoff + batch shepherding under the new lane map; sweep's 81 Ready/Exec/InReview items presumed IN by stage-gate (operator may veto).

---

# (superseded) mvp-roadmap session state — checkpoint 2026-07-10 (session 2 close)

## CURRENT MANDATE (operator, 2026-07-11/12 — ACTIVE, read first)

**Role: OPQ burn-down assistant + batch-execution orchestrator support.** The 2026-07-11 marathon session resolved **15 OPQs** (52, 46, 45, 13, 44, 43, 23, 6→split 59/60/61, 36, 39, 38, 49, 53, 57, 64), triaged every ownerless row, and reshaped several. The old sequenced list is consumed — the queue now runs on **owners + triggers**, not a sequence:

**Jørn's open rows (all trigger-gated, nothing actionable while triggers pending):** OPQ-66 (deploy-day checklist — fires when Batch 5 lands the WI-1850 fix deploy; that one sitting advances 66 + 27-Phase-2 + 38's Resend live check; checklist is in the row) · OPQ-27 (Phase 1 DONE — 3 Sentry rules live in NEW project mentomate-api, email routing; Phase 2 = Inngest buckets, rides 66) · OPQ-68 (retention-purge tickler, Deadline 2026-10-01; automation captured as WI-1859 P3 unbatched) · OPQ-71 (NEW — V0-retirement ruling split out of 37; S6 gate, IRREVERSIBLE, removes flag-flip rollback; deliberate, no deadline) · OPQ-25 (fires on counsel's OPQ-24 values, dl 2026-07-25) · OPQ-62 (ruled APPROVE-TRIMMED — 3 WIs + 8 dispositions; execution brief is IN THE ROW; Batch-7 agent executes).

**Zuzka's queue:** 40 (trust design — highest leverage, 5 builds DoR-blocked) · 26 (REFRAMED: rule MVP MFA posture — Clerk plan has no MFA, fixtures moot; rec = no-MFA + DPIA line) · 30 (RLS posture — reassigned to her as product risk; rec Option B risk-acceptance on record) · 37 (trimmed: Play creds + EAS 'Entity not authorized' fix + Config-T) · 55 (Batch-4 device pass; all 5 B4 WIs Closed, actionable) · 58/59/60/61 · 11 · 50/51. **3rd-party:** 8, 22, 24 (dl 07-25), 41.

**Key discoveries 2026-07-11 (all recorded in the relevant rows/WIs):** (1) **WI-1850** — ALL ~99 Inngest functions broken on Workers since ba09fe740 (2026-06-12): middleware uses AsyncLocalStorage.enterWith(), unimplemented in workerd; Node tests blind to it; routed Batch 5 P1; WI-1338 Blocked-by 1850; the fix deploy also carries the new Sentry DSN + real webhook secrets → highest-value pending deploy. (2) **Sentry DSN mis-wire** — API never had its own project (DSN was mobile's; stg had NONE); new project `mentomate-api` created, DSN in Doppler dev/stg/prd, live at that deploy. (3) **No Play developer account exists** — signup screen reached; account type choice entangled with counsel entity question (OPQ-8); personal = owner ID verification + 20-tester/14-day tax; org = D-U-N-S; finding written into OPQ-60/37; now the longest lead in the store chain. (4) Prod Inngest env stood up: keys verified correct, app synced 99 functions (OPQ-36 closed; green-cron check = OPQ-66).

**Uncommitted in the working tree (code, NOT covered by docs-only authorization):** `apps/api/eval-llm/flows/language-detect.ts` (new blind-spot fixture `german-practice-via-politics-topic`) + refreshed snapshots from the OPQ-49 live-eval run (14/14 green). Needs a normal hooked commit from a worktree, or an operator call.

Standing context: 8 batches live (Sprint rows; membership + IDs below); HITL: lines on every open AC; OPERATOR-GATE-LEDGER.md = ruling-session record; PGM-1 has the 2026-07-11 checkpoint; 1652→1792/1797 hold self-clears. Gotchas: capture needs --out-file + a resolvable Project (pass --origin-wi); quote-dense python via scratchpad file + `rtk python3`, never inline heredoc; pre-write collision guard on Cosmo fan-outs; OPQ `Project` is a rollup off Work Items; Notion rich_text segments ≤1900 chars; Sentry is now Monitors&Alerts (count thresholds = Metric monitors, not issue alerts); staging Clerk = Development instance (pk_test).


## CURRENT MANDATE (operator, 2026-07-10 night — ACTIVE, read first)

**WAVES ARE SCRAPPED (operator ruling).** Replaced by **5 parallel agent batches**, all startable now; Sprint rows are membership SoR (wave rows archived). Operator/legal/manual items (DPO/DPIA 1105/1106, AI-Act self-assessment 1659, compliance docs 1107/1108/1111/1192/1193/1194, counsel consumers 1559/1109, conditionals 1663/1664, flag-combo ruling 1334, trust design 1767) are OUT of agent queues — tag `manual-external`, no Sprint. Trust builds 1497/1498/1499/1501/1502 held sprint-less behind 1767; join Batch 4 when design lands.

| Batch | Sprint page | Members |
|---|---|---|
| 1 — Verified-learning engine & proof | 3998bce9-1f7c-8170-99ea-c813067e5ae0 | 1438,1469,1445,1446,1464,1754,1666,1703,1121,1658,1705 |
| 2 — Language vertical | 3998bce9-1f7c-8120-81b2-c330290c7d34 | 1447,1777,1755,1552,1547,1756,1553 |
| 3 — Platform / LLM cutover (= the live delivery lane, ex-wave-0, `_quartet/working/lanes/wave-0/`) | 3998bce9-1f7c-815f-b5e8-dab473b3ceb5 | 1167,1685,1779,1686,1505 |
| 4 — Supporter, activation & ratified bugs | 3998bce9-1f7c-8127-8988-e24fe7649b26 | 1127,1135,1137,1753,1441,1451,1461,1466,1496,1689 |
| 5 — Hardening, ops & billing | 3998bce9-1f7c-81e6-96a6-d7704bcb1d0e | 1288,1371,1379,1162,1651,1652,1400,1406,1555,1399,1780,1500,1690,1691,1195 |

All Blocked-by edges set + audited 2026-07-10: every open blocker is intra-batch (chains: 1438/1469→1445/1446→1464→1754; 1658→1705; 1447→1777; 1547→1756; 1167→1685→1779/1686; 1127→1135→1137→1753; 1651→1652→1400/1406). "Later — Publish & beta (post-batch; ex-Wave 3)" row keeps the publish/beta items.

**2026-07-11 gate sweep + ruling session + Batches 6-8 (all executed).** Full-backlog HITL sweep done (see `OPERATOR-GATE-LEDGER.md`): every open item gate-declared or accounted in-flight; 14 OPQ rows filed. Ruling session: 7/8 ruled and folded back (1685 operator-approves-prod-flip; 1461 ratified retroactively; 1796 = C now + WI-1812 post-launch A experiment in WS-52 pen; 787 blocked-by-default; 1665 IN → Batch 1 behind 1658; 1324 closed Fixed-In 96168d6c5 + residual WI-1810; 1141 closed Superseded). **OPQ-30 (DB-RLS posture, WI-1196+1002) PINNED — long-lead; 1196 + 1002-RLS-half out of batches, 1002 FK-index half carved claimable, hard deadline = DPIA signing.** New batches: **Batch 6 Launch-ops (5: 1640,1641,1761,1762,1341 · row 39a8bce9-1f7c-81f8-9db8-e10035aab355-ish — query Sprints DB by name)** · **Batch 7 Dev-infra & CI (21: 1643,1792,1797,1791,1798,1345,1810,1164,1268,1311,1355,1513,1576,1363,1252,649,1134,1244,1309,1299,1201)** · **Batch 8 Product fill (5: 787,1002,1259,1554,1667)**. Pure-operator items 1338/1772/1642/1764 tagged manual-external (OPQ actions). Governance cluster 757+895-900 → estate-track tag (operator-routed, out of MentoMate batches). Trust builds 1497/98/99/1502 join Batch 4/8 when the WI-1767 design lands.

**Role: batch-prep engine.** Batch 3 is a NORMAL batch (its executor was stood down 2026-07-10; WI-1167 sits Executing, claim clear). **Batches 3/4/5 PREP DONE 2026-07-11** (3 Sonnet refiners, sanctioned CLIs only): all members at Stage=Ready except WI-1167 (Executing, in-flight) and WI-1555 (held Refining — confirmed duplicate of bundle WP WI-1780's absorbed T1/WI-1474; triage duplicate-close refused at Refining per the WI-1773 gap, field evidence commented there; needs operator force-close). WI-1505 was found Closed and removed from Batch 3 (now 4 items). Workstream Order = intra-batch claim sequence set on all 26 (chains ascending, gaps of 10). Notable refine outputs: 1441/1461 root causes established by code-read; 1689 AC rebuilt on the 6 clientActivationEventTypeSchema events (mobile has zero call sites today); 1137 AC gained the ratified teen-path person-picker clause; 1779/1780 bundle AC properties populated from body briefs. Open operator items: 1555 force-close ruling; WI-1466 is Type=Design while grouped in the "ratified-13 bug set" (flag only). REMAINING PREP: Batches 1 and 2.

**Supersedes the pre-compaction snapshot (below the divider) and the 2026-07-09 snapshot.**

## Freeze status

**LIFTED 2026-07-10 (operator ruling, explicit: "You are to lift the freeze across all of Mentomate").** Delivery model correction from the operator: NOT per-workstream orchestrator spawning — **one dedicated Wave-0 delivery lane** (`_quartet/working/lanes/wave-0/execution-tracker.md`); workstreams are bookkeeping axes. Waves recorded as Cosmo Sprint rows (Wave 0: 11 · Wave 1: 29 · Wave 2: 27 · Wave 3: 11); legal/DPO paths moving in parallel, not waited on.

## What this session did (all complete)

1. **QC reconciliation of Zuzka's 2026-07-10 ratification session** — PASSED. Report: `_wip/mvp-roadmap/RECONCILIATION-REPORT.md` (committed 58d513f28). All 10 questions ruled consistently; 153 touched Cosmo WIs all trace to documented causes; no context-poor bulk-edit evidence. Two defects found and FIXED on operator instruction: WI-1692 rescoped (guardian-notification wording struck per Q8), stale "Not ratified" header fixed in both MVP-DEFINITION copies (commit cabfad13c).
2. **Workstream portfolio reshape** (operator-approved, executed in Cosmo): WS-4/22/34/37/44 closed, WS-32 reopened, WS-52 "Post-MVP pen" created (12 fast-follow members), 42+ orphans assigned along runway clusters, initiative links repaired, trust package folded into WS-39 (tag `trust-package`, ruled over a dedicated WS). 6 killed WIs closed via sanctioned triage (1476/1477/1478/1483/1491/1494, Resolution=Cancelled). Only WI-1299 (machinery) deliberately workstream-less. Detail: `_wip/mvp-roadmap/WORKSTREAM-PORTFOLIO-PROPOSAL.md`.
3. **Bundle dogfood** (operator-directed, meta-eye on the ADR-0014 tooling): 4 bundles formed, tag `bundle` — WI-1772 (webhook secrets 747+748, canary), WI-1777 (speaking slice 1548+1549, carries Blocked-by WI-1447), WI-1779 (prompt caching 1687+1688), WI-1780 (billing-failure 1474+1475). All briefs filled (absorb test passes). **Zero bundle defects found.** Track these 4 for PR/review-churn performance.
4. **Kill formalities via 2 Sonnet subagents** — 8 WIs closed (4 duplicates: 1757/1570/1117/1492; 4 ruling-artifact: 1662/1657/1493/1416). **5 lifecycle tooling gaps found and captured**: WI-1773 (no Duplicate/Wontfix close at Ready/Backlog), WI-1774 (close leaves State uncleared), WI-1782 (Parked blocks every exit from Ready), WI-1783 (solo-agent ruling closure vs producer-is-not-closer gate — convention needed), WI-1784 (no guard on orphaned execution provenance). All related to WI-1515 (dispositions WP family).
5. **Program views regenerated + committed** (58d513f28): `_quartet/working/program/dashboard.html` (new flight deck) + `mentomate-roadmap.html` (rebuilt on runway waves; S6 corrected to post-launch per F4; gate ledger rewritten). Local server was on :8931 (dies with session).
6. **PGM-1 Cosmo page updated**: dated 2026-07-10 checkpoint section inserted after the lead callout with supersession notes for the stale July-3 narrative (M4 done, S6 post-launch, five-lane picture replaced by the reshaped portfolio).

## Cosmo state deltas (for the next session's orientation)

- MVP-DEFINITION + RUNWAY are the roadmap-of-record at `docs/plans/2026-07-10-mvp-roadmap/`, header now says RATIFIED.
- Live workstream board: WS-39(36 open)/WS-46(22)/WS-28(17)/WS-30(13)/WS-18(13)/WS-32(11)/WS-38(10)/WS-33(10)/WS-31(6) open; WS-29/35/36/52 on hold.
- 14 WIs closed this session (6 killed + 8 formalities), 8 absorbed into bundles, 5 tooling-gap WIs + WI-1772/1777/1779/1780 created. 3 accidental duplicate captures (1785/1786/1787) closed Duplicate — cause: non-idempotent capture re-run after an output-pipe crash; LESSON: use --out-file, never re-run capture on a parse failure.
- Zombie WI-904 note: went to WS-33 in the reshape.

## Open threads

- **Freeze lift** — operator decision, pending explicit ruling.
- **OPQ-22 counsel packet dispatch** — Wave 0.1, operator action; dispatch status still UNCONFIRMED (the one REST probe 400'd, never retried).
- **DPO appointment path (0.2)** — operator action, longest lead with counsel.
- **Calendar anchoring + lane/agent allocation** — explicitly deferred by operator in RUNWAY.md.
- WI-1562 has an empty Project field (noticed during reshape; left as-is).
- inventory.jsonl row-count drift (213 expected vs 204) — stale working snapshot, Cosmo is SoR, cosmetic.
- Nexus spine: session pushed as stream `mentomate-program` (new roster row).

---

*(prior pre-compaction snapshot and 2026-07-09 snapshot removed at this checkpoint — their content is fully superseded by the above + the committed reports; recover from git history if needed: this file's previous revision.)*
