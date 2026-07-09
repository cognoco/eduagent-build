# Gaps & structural flags — Phase 3

**Generated:** 2026-07-09 · Companion to `COVERAGE.md`. A **gap** = MVP-DEFINITION says IN (or ruled) but no inventory WI closes it and it isn't verified-shipped. A **flag** = mapping surfaced a conflict/duplicate that Phase 4 or Phase 5 must resolve.

## Gaps (no WI exists)

| # | Gap | Definition anchor | Proposed action |
|---|---|---|---|
| G1 | **Challenge Round production flip itself** — bake-off (WI-1438) and calibration (WI-1464) are gates, but no WI executes the flip + sequencing | §3 | Create WI at Phase 5; sequence after 1438/1464 |
| G2 | **Consent-denial state build** (retain-dormant vs erase) — ruled direction Item 4-D2, counsel Q2 pending; current denial behavior never audited; zero WIs | §1/§10 | Create audit WI now (counsel-independent); build WI after Q2 |
| G3 | **First-party analytics sink** — event wiring exists (WI-1689/1570) but nothing captures where events land / minimal query surface (addendum ruled IN) | §12 | Create WI; confirm scope at ratification |
| G4 | **Voice floor verification** — shell spec rules "voice input everywhere incl. cold-start"; no WI verifies mic/transcription coverage across V2 surfaces (only fixes 1447/1486 exist) | §6 / Q6 | Create audit-slice WI after Q6 confirms the floor |
| G5 | **Locale-correct crisis helpline sourcing** — def says "we will source locale-correct numbers separately"; no WI | §9 / counsel Q3 | Create WI, counsel-gated |
| G6 | **Privacy-policy publish TODO bundle** (DPO name, controller address, Art-27/UK rep decision, final age floor, false-claims fix) — WI-1109 covers publish broadly but the worksheet of concrete TODOs lives only in the HTML comments | §10 | Fold explicit checklist into WI-1109 body at Phase 5 |
| G7 | **Item 4-D1 (provenance) and D3 (parking-return) builds** — ruled, deferred to fast-follow; no build WIs (WI-1416 only holds the now-ruled decisions; WI-1703 is loop-artifact provenance, a different thing) | §4 | Create fast-follow WIs at Phase 5 |
| G8 | **Trust-package design passes** — each Item-6 slice needs a Zuzka design pass before build; no design WIs, only the 5 build WIs | §11 | Ratification: confirm design-pass mechanics; add to WI bodies |
| G9 | **Age-floor cementing + store-rating dependency** — Q9 says confirm final; no WI carries the decision through policy + worksheet + register once ruled | §10 / Q9 | Fold into WI-1561/1109 at Phase 5 after Q9 |

## Flags (conflicts / duplicates surfaced by mapping)

| # | Flag | Items | Resolution path |
|---|---|---|---|
| F1 | **Crisis contradiction** — WI-1690 specs guardian notification; implemented se-032 posture is never-notify | WI-1690 vs WI-1358 | Ratification Q8 (already on the list); do NOT build 1690 before |
| F2 | **Activation-wiring duplicate** — WI-1689 (Phase-0 ruling capture) vs WI-1570 (earlier client-dispatch capture) describe the same work | 1689/1570 | Merge at Phase 5 |
| F3 | **RevenueCat duplicate** — WI-1117 (Compliance-Legal) vs WI-1328 (Launch Readiness) | 1117/1328 | Merge at Phase 5 |
| F4 | **V0-retirement conflict** — WI-1308 (M5: retire V0 *before ship*) vs the standing S6-deferred-irreversible ruling | 1308 | Ratification: reconcile M5 wording with S6 ruling |
| F5 | **WI-1416's 4 rulings largely superseded** — Item-4 ballot ruled D1–D4 on 2026-07-05 | 1416 | Close-against-ballot at Phase 5 (residue: S3 rare rows) |
| F6 | **Staging deploy migration broken** (WI-1167) silently gates the V2 routing cutover (WI-1685 needs staging validation) | 1167→1685 | Sequence 1167 first; it's mapped GATE |
| F7 | **WI-1448 snapshot stale** — closed Superseded→WI-1688 on 2026-07-09, inventory row pre-dates it | 1448 | None; noted so counts reconcile (real open total = 200) |
| F8 | **Supporter/linking cluster (8 WIs, WS-32 on hold) entirely hangs on Q10** — if launch family model = join-my-family v1 only, most is fast-follow but WI-1137 (ceremony screens) likely has an IN subset | 787/1121/1127/1134/1135/1136/1137/1185 | Ratification Q10, then split 1137 |
| F9 | **Maestro-CI defects undermine an IN gate** — WI-1651/1652 (CI always-green / only 2 flows) make the WI-1400 e2e baseline unverifiable | 1651/1652→1400 | Propose IN at ratification (mapped RATIFY) |
| F10 | **Machinery in product backlog** — 11 items (Stream-2 ADR-governance cluster, WI-1299, WI-1650) are not MentoMate product work | see COVERAGE node — | Phase 5: repoint/re-home per misfiling memory (verify first) |

## Reading the totals

73 GATE items close the definition's IN surface; 59 RATIFY items hang on the 10 open questions (dominated by Q1 verified-loop, Q2 4-strands ×11, Q10 supporter ×8, Q5 AI-Act); 17 OUT + 14 QUARANTINE are Phase-5 fate execution; 24 HYGIENE don't gate launch; 14 non-product. **No IN capability is entirely uncovered except the nine gaps above — the definition and the backlog are structurally close; the risk is concentrated in the un-ruled questions, not in missing captures.**
