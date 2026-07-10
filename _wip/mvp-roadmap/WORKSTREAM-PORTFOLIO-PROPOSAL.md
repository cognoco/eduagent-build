# Workstream portfolio proposal — post-MVP-ratification reshape

**Status: EXECUTED 2026-07-10 evening (operator-approved).** Deviations from the proposal as written: WS-4/WS-37 closed outright and WS-44/22/34 closed after residual re-homes (WI-1562, missed by the Project-filtered pull because its Project field is empty, re-homed WS-44→WS-35); Trust Package ruled **fold into WS-39** (not a new workstream) with all six items tagged `trust-package`; every touched WI note-stamped. 19 Parked/OUT orphans + WI-1299 (machinery) deliberately left unassigned as proposed.
Data basis: full pull 2026-07-10 evening — 1166 MentoMate WIs, 29 MentoMate workstream rows, 54 workstream-orphaned open WIs.

## A. Current state (mechanical classification)

| Class | Workstreams | Evidence |
|---|---|---|
| Already Closed (fine) | WS-8,9,10,11,12,13,14,15,17,20,25,27 | 0 open members each |
| **Drained — status still Open, 0 open members → CLOSE** | WS-4 Harness hygiene, WS-37 Seam Hardening, WS-44 Coverage Debt | 16/22/14 closed, 0 open |
| **Near-drained → CLOSE after re-homing residue** | WS-22 Bug Lane (3 open), WS-34 Platform Hardening (2 open, both parked/non-MVP) | see fates below |
| Live, aligned with runway | WS-18, WS-28, WS-29, WS-30, WS-31, WS-33, WS-38, WS-39, WS-46 | carry ratified IN/FILL work |
| **On-hold but ratification made it live → REOPEN** | WS-32 Supporter & Linking | Q10 ruled WI-787/1121/1127/1135/1137 IN (+1753 launch-IN currently in WS-33) |
| Machinery, not MVP (leave as-is) | WS-35 Dev-Infra (9 open), WS-36 Estate-Canon Drain (9 open) | F10-verified machinery, excluded from roadmap |

## B. Proposed fates — workstream rows

| WS | Fate | Action detail |
|---|---|---|
| WS-4, WS-37, WS-44 | **Close** | Status→Closed, note "drained; closed at MVP-ratification portfolio review 2026-07-10" |
| WS-22 Bug Lane | **Close after re-home** | WI-1244, WI-1252, WI-1399 → WS-39 (all are launch-quality bugs; 1399 billing silent-fail is ratified IN) |
| WS-34 Platform Hardening | **Close after re-home** | WI-482 (parked refactor) → unassigned-parked or WS-35; WI-1436 (legacy Gemini deletion, OUT/post-soak) → WS-28 (it's the V2-cutover tail) |
| WS-32 Supporter & Linking | **Reopen** (On hold → Open) | Absorbs its own Q10-ruled IN items (see §C); WI-1753 moves here from WS-33 (it's the join-my-family enabler, same cluster) |
| WS-46 Core Learning Loop | Keep (the runway Wave-1 spine) | Absorbs verified-learning orphans |
| WS-38 Four Strands | Keep | Absorbs its 3 new WIs (1755/1756 already in; 1757 dup already in) |
| WS-39 Launch Readiness | Keep | Absorbs launch-ops orphans |
| WS-28 V2 finalization | Keep | Absorbs the LLM-cutover cluster (it IS the platform cutover program) |
| WS-31 Safety & Eval | Keep | Absorbs the safety orphans (currently only 2 open members) |
| WS-29 / WS-30 Compliance | Keep | Absorb compliance orphans |
| WS-33 Mobile UX & Navigation | Keep | Loses 1753 to WS-32; gains 1496, 1763, 1486 |
| WS-18 Identity Cutover | Keep | No change (13 open, its own program) |
| **NEW: "Trust Package"** | **Create** | The Item-6 ruled slice is a coherent 6-item unit with its own design gate (WI-1767 blocks 1497/1498/1499/1501/1502). Alternative: fold into WS-39 — see Decision 2. |

## C. Orphan assignments (54 items)

| Target | WIs | Rationale |
|---|---|---|
| WS-46 Core Learning Loop | 1658, 1662, 1665, 1666, 1667 | Verified-learning ruling §3 (1662 closes-via-review there too) |
| **Trust Package (new)** or WS-39 | 1497, 1498, 1499, 1501, 1502, 1767 | Item-6 slice + its design gate |
| WS-31 Safety & Eval | 1690, 1691, 1692, 1764 | Crisis/safety cluster (Q8 + G5) |
| WS-28 V2 finalization | 1685, 1686, 1687, 1688 | LLM-routing cutover + caching + judge flags = Phase-0 platform chain |
| WS-39 Launch Readiness | 747, 748, 1474, 1475, 1651, 1652, 1655, 1689, 1762 | Prod webhook secrets, billing-failure IN pair, Maestro-CI gates, activation wiring + sink (G3) |
| WS-33 Mobile UX & Navigation | 1486, 1496, 1763 | Mic-permission FILL, language picker IN, voice-floor audit (G4) |
| WS-29 Compliance — Engineering | 1442, 1761 | Consent audit trail + consent-denial audit (G2) |
| WS-32 Supporter & Linking | 1765, 1766 | Parent-on-behalf provenance + parking-lot return (guardian-loop fast-follows, Parked) |
| Leave unassigned (Parked/OUT, no live workstream should carry them) | 1467, 1468, 1470, 1471, 1472, 1473, 1476, 1477, 1478, 1479, 1480, 1483, 1485, 1488, 1491, 1494, 1660, 1661 | All ruled OUT/killed/fast-follow and Parked; assigning them to live workstreams re-pollutes the boards the fate batch just cleaned |
| Leave unassigned (machinery) | 1299 | F10 machinery, excluded from roadmap |

Counts: 33 assigned, 19 deliberately left unassigned-parked, 1 machinery, 1 moved between workstreams (1753). Total touches ≈ 40 WI relation-writes + 6 WS row updates + 1 WS row create.

## D. Initiative-link repair (10 workstreams missing `Initiative`)

WS-29, 30, 31, 32, 33, 34, 35, 36, 38 (+ closed WS-8). Proposal: link the live ones to their obvious Initiative rows at execution time; skip the already-closed ones. Needs a quick Initiatives-DB read to match names — folded into the execution batch.

## E. Execution order (single batch, after ruling)

1. WS row updates (close 3 drained, reopen WS-32, create Trust Package if ruled).
2. Re-home the 6 residual items (Bug Lane 3, Platform 2, 1753).
3. Assign the 33 orphans.
4. Initiative links for live workstreams.
5. Stamp every touched row with a dated note citing this proposal.
6. Regenerate `dashboard.html` (Phase D — last).
