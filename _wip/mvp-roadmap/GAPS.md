# Gaps & structural flags — Phase 3

**Generated:** 2026-07-09 · Companion to `COVERAGE.md`. A **gap** = MVP-DEFINITION says IN (or ruled) but no inventory WI closes it and it isn't verified-shipped. A **flag** = mapping surfaced a conflict/duplicate that Phase 4 or Phase 5 must resolve.

## Gaps (no WI exists)

**None remaining — all gaps closed 2026-07-10 (see Resolved).**

## Resolved gaps

| # | Closing WI | What changed |
|---|---|---|
| G1 | WI-1754 | Challenge Round beta/prod flip now has an explicit launch-gating execution item. |
| G2 | WI-1761 | Consent-denial behavior audit (counsel-independent) created 2026-07-10; build WI follows counsel Q2. |
| G3 | WI-1762 | First-party activation-analytics sink + minimal query surface created 2026-07-10. |
| G4 | WI-1763 | Voice-floor coverage audit across V2 surfaces created 2026-07-10 (Q6 confirmed the floor). |
| G5 | WI-1764 | Locale-correct crisis helpline sourcing created 2026-07-10; State=Awaiting Info pending counsel Q3 jurisdictions. |
| G6 | WI-1109 (fold) | Explicit publish-TODO checklist folded into WI-1109 notes 2026-07-10 (DPO name, controller address, Art-27 EU rep, UK-rep decision via WI-1110, 13+ floor, false-claims fix). |
| G7 | WI-1765 + WI-1766 | D1 provenance schema + D3 parking-lot return builds created 2026-07-10, both Parked (ruled fast-follow). |
| G8 | WI-1767 | Batch design pass ruled (operator 2026-07-10: one pass, not per-item); Design WI created, Blocking → 1497/1498/1499/1501/1502. |
| G9 | WI-1109/1114/1561 (fold) | Q9 ruled 2026-07-10 (13+ = launch floor, not forever cap); ruling notes appended to all three carriers. |
| G10 | WI-1755 | Language-mode safety/eval guard captured; Risk/Impact populated; Sprint left for triage/refine. |
| G11 | WI-1756 | Structured meaning-output card/loop captured; Risk/Impact populated; Sprint left for triage/refine. |

## Flags (conflicts / duplicates surfaced by mapping)

| # | Flag | Items | Resolution |
|---|---|---|---|
| F1 | **Crisis contradiction** | WI-1690 vs WI-1358 | **RESOLVED 2026-07-10 (Q8):** se-032 stands; WI-1690 rescoped in Cosmo (name/desc/AC — no guardian notification). |
| F2 | **Activation-wiring duplicate** | 1689/1570 | **EXECUTED 2026-07-10:** WI-1689 canonical (detail absorbed); WI-1570 Parked → Duplicate close via review gate. |
| F3 | **RevenueCat duplicate** | 1117/1328 | **EXECUTED 2026-07-10:** WI-1328 umbrella canonical; WI-1117 Parked → Duplicate close via review gate (its "both stores" scope narrowed by the Play-only Option-A ruling). |
| F4 | **V0-retirement conflict** | 1308 | **RESOLVED 2026-07-10 (operator):** S6-deferred stands; WI-1308 name/description rewritten to post-launch S6-milestone timing. |
| F5 | **WI-1416's 4 rulings superseded** | 1416 | **EXECUTED 2026-07-10:** noted against ballot (D1→WI-1765, D2→WI-1761+counsel Q2, D3→WI-1766, D4 residue flagged for review); Parked → close-against-ballot via review gate. |
| F6 | **Staging deploy migration broken** (WI-1167) gates the V2 routing cutover (WI-1685) | 1167→1685 | Sequence 1167 first — added to RUNWAY-DRAFT Wave 0. |
| F7 | **WI-1448 snapshot stale** — closed Superseded→WI-1688 on 2026-07-09, inventory row pre-dates it | 1448 | None; noted so counts reconcile (real open total = 200) |
| F8 | **Supporter/linking cluster hangs on Q10** | 787/1121/1127/1134/1135/1136/1137/1185 | **RESOLVED 2026-07-10 (Q10):** ruled item-by-item — see MVP-DEFINITION §1/§4; WI-1137 IN whole (no split needed), WI-1753 extracted from 1580. |
| F9 | **Maestro-CI defects undermine an IN gate** | 1651/1652→1400 | **RESOLVED 2026-07-10:** WI-1651/1652 ruled IN (additional-rulings batch). |
| F10 | **Machinery in product backlog** — 11 items (Stream-2 ADR-governance cluster, WI-1299, WI-1650) are not MentoMate product work | see COVERAGE node | **RESOLVED 2026-07-10:** verified — NONE are cross-project misfiles (WI-1299's defect lives in this repo's own `.agents/skills/notion/SKILL.md`; the ADR cluster governs this repo's ADRs). All 11 noted as machinery, excluded from the MVP roadmap; no Project repoints. |

## Reading the totals

81 GATE items close the definition's IN surface; 48 RATIFY items still hang on open questions (dominated by Q1 verified-loop, Q10 supporter, Q5 AI-Act, and smaller residual rulings); 3 FILL items are approved MVP-window work but not launch-gating; 19 OUT + 14 QUARANTINE are Phase-5 fate execution; 24 HYGIENE don't gate launch; 15 non-product/docs/machinery items remain. **Eight active no-WI gaps remain; G1/G10/G11 are now closed by WI-1754/WI-1755/WI-1756.**
