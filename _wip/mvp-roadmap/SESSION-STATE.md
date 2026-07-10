# mvp-roadmap session state — checkpoint 2026-07-10 (session 2 close)

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

**Role: batch-prep engine.** Remaining prep = refine batch members to Stage=Ready (description/AC/DoR, mining MVP-DEFINITION.md ruling text) via sanctioned /cosmo:triage → /cosmo:refine, heads first; surface ambiguities for operator ruling; flag (don't clear) Parked holds (WI-1782 gap). Batch 3 items belong to the live executor lane — coordinate, don't claim.

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
