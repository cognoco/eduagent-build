# Spec-corpus triage — decision pack (Phase 2)

**Consolidated by program-manager:fable, 2026-07-03.** Input: 27 disposition sheets in `sheets/` (per-row evidence, file:line cites). This pack is the Phase-3 working document: Zuzka + operator rule over THIS, drilling into sheets only where challenged. 83 quarantined candidates all dispositioned below.

## 1. Document verdicts at a glance

| Row | Feature | Verdict | Sheet |
|---|---|---|---|
| 1 | Review-relearn RR-3..15 | partially-implemented (3/15 shipped flag-dark; 11 open) | 01 |
| 2 | Owner-impact top-10 | valid (item #5 shipped) | 02 |
| 3 | Product continuity | partially-implemented / partially superseded (copy layer shipped via af91a3e18; several tasks target dead V2-excluded surfaces) | 03 |
| 4 | Billing recovery | valid; urgency gated on WI-1328 timeline (RC purchases off-by-design today) | 04 |
| 5 | Notification reachability | T1-T3 SHIPPED; T4-T6 unbuilt + schema-drifted | 05 |
| 6 | Resumable practice | honest-copy half SHIPPED (af91a3e18); engine correctly deferred, design stale (CoachBand→NowCard) | 06 |
| 7 | Profile personalization | mostly shipped; 1 valid survivor + 3 untracked do-now siblings | 07 |
| 8 | Note correctness | partially-implemented; WI-1490 premise FALSE (guard IS wired, session-exchange.ts:634) | 08 |
| 9 | Concept capture | write side shipped; read side split | 09 |
| 10 | Felt-knowing loop | F1 shipped (WI-1118); F3/F4 real but silent no-op not lying banner; F5-F7 zero code | 10 |
| 11 | Homework autofile | SHIPPED 1:1 — zero candidates was correct | 11 |
| 12 | Journal redesign | SHIPPED; doc header falsely says draft | 12 |
| 13 | Forever notebook | valid vision doc; post-MVP | 13 |
| 14 | Warm greeting | v1 shipped; v1.5 pool unbuilt (polish) | 14 |
| 15 | Trial onboarding | funnel works; headline preview-lesson never built | 15 |
| 16 | Voice-first Epic 17 | obsolete (~95% unbuilt, 3 shell generations stale); re-scope umbrella stands | 16 |
| 17 | Mentor shell + v2-dossier | current architecture; 4 real gaps, one elevated (see §3) | 17 |
| 18 | V2 publish readiness | IS the live program; no orphan scope | 18 |
| 19 | Review-continuity opener | fully SHIPPED as scoped (inert, flag-off) | 19 |
| 20 | Challenge grader/judge | shipped except T10 bake-off (never ran) | 20 |
| 21 | Gemini runtime removal | NOT executed (flag absent in prd → legacy live); no compliance emergency (WI-1052 legacy gate, router.ts:679); gated post-launch chain | 21 |
| 22 | Email consent withdrawal | SHIPPED (PR #1530 + WI-1340) | 22 |
| 23 | RLS enforcement | phases 1-2 shipped; activation legitimately parked; app-layer scoping is the live launch control | 23 |
| 24 | epics.md | bookkeeping (annotation pass) | 24 |
| 25 | Test-utility framework | fully executed; stale banner only | 25 |
| 26 | Mobile-lab setup | obsolete (0/40 boxes; /e2e skill superseded) | 26 |
| — | Unmapped block (21 WIs) | coverage-debt/doc-hygiene/design-forks; 3 ship-relevant | 00 |

## 2. Candidate fates (all 83)

**KILL / CLOSE (factually wrong, superseded, or already shipped) — 8:**
WI-1494 (RLS umbrella — superseded by plan's own parked banner), WI-1495 (vocab scoping — FALSE, in scoped repo since April), WI-1490 (dead guard — FALSE, wired + hardened twice; close with correction), WI-1487 (guardian primer — shipped: use-guardian-notification-ask.ts), WI-1450 (hub notes — shipped WI-1118), WI-1489 (close citing shipped copy fix; engine re-spec noted for later), WI-1440 (merge-to-pointer: S6 gate already governed), plus row-3 kills T2/T3/T5 → WI-1481, WI-1482, WI-1484 (target surfaces excluded from V2 shell).
*(Count: 10 items killed/closed/merged.)*

**ADOPT — MVP-IN recommendation — 13** (see §3 for the case): WI-1393, WI-1441, WI-1446, WI-1447, WI-1449 (scoped to guard-test only), WI-1461, WI-1466, WI-1438 (narrowed to bake-off), WI-1456, WI-1451 (corrected mechanism note), WI-1496, WI-1399, WI-1400. *(+ WI-1406 partial: resilience-branch subset.)*

**ADOPT — post-MVP / fast-follow — ~38:** all remaining RR items (1462-1465, 1467-1472), owner-impact non-MVP (1443-1445 as one chain, 1448), billing row (1475-1479, gated on WI-1328 timeline), WI-1488 (re-spec only), WI-1480 (re-scoped to NowCard) + WI-1486 (mic deferral — cheap, adopt), WI-1452 (large, cross-spec), WI-1453, WI-1454, WI-1459 (voice re-scope umbrella), WI-1435→WI-1436 (gated post-launch chain), coverage-debt bulk WI-1401-1414 (new workstream), WI-1473, WI-1416.

**DOCS LANE — 4:** WI-1439 (adopt; extend to journal-redesign header + test-utility banner), WI-1460, WI-1397, WI-1458 (gated on S6 ruling).

**COMPLIANCE LANE — 1:** WI-1442 → WS-30/29 (GDPR proof-of-consent before hard-delete).

**RE-HOME — 2:** WI-1455 → row 8 home (note-correctness supersedes concept-capture version); WI-1437 → coverage block (misfiled provenance).

**EXTRACTION GAPS — 2 new candidates to create:**
- G1: Billing T1 — payment-failed → real user notification (row 4's own top do-now; no WI exists).
- G2: Profile do-now siblings T1/T2/T5 (row 7) — WI-1496 alone may be unreachable via first-run.

## 3. MVP-delta shortlist (the case for each)

| Item | Case | Class |
|---|---|---|
| **WI-1393 link-ceremony anchors** | **Publish-blocker candidate**: verified NO supporter-linking affordance exists in the V2 shell — new-supporter onboarding is a dead-end, and supporter scope is IN the north star | finish-or-hide |
| WI-1441 pushEnabled on grant | Launch-day notification reachability silently broken | bug |
| WI-1456 mastery-star re-home | Live feature silently disappears when V2 nav goes default — regression, not net-new | finish-or-hide |
| WI-1451 'keep this' CTA | Silent no-op tap on a shipped affordance | finish-or-hide |
| WI-1461 double-push cron | Duplicate review reminders on the LIVE SM-2 loop | bug |
| WI-1466 CR completion cooldown | Cooldown written only on decline — live loop defect | bug |
| WI-1446 stranded promotion | needs_deepening rows never promoted (zero callers) | bug |
| WI-1447 voice locale fallback | Wrong-language TTS for launch locales (incl. nb) | bug |
| WI-1438 grader bake-off | Never ran; gates H4 → the whole routing-v2/Gemini-removal chain | gate |
| WI-1449 profileId guard test | Cheap forward-only CI guard (scoped: NO RLS activation) | guard |
| WI-1496 language picker | Parent-created child stranded on English tutor prose; pure UI on live API — but see G2 | ux |
| WI-1399 billing silent-failure | alias-merge lacks onFailure; silent recovery banned in billing per canon | bug |
| WI-1400 V2 Maestro e2e | Shipping shell has ZERO native e2e | quality |
| WI-1406 (subset) auth resilience | Happy-path only on auth e2e | quality |

## 4. Ruling queues

**ZUZKA (product) — 7 questions:**
1. ~~WI-1393~~ RULED 2026-07-04: **FINISH** — assigned to WS-33 (orion) with ship-path priority; ruling on the item.
2. WI-1457 trial preview lesson: never built; honest substitute funnel works. Recommend OUT — confirm.
3. Correctness-chain (WI-1443→1444→1445): one epic, MVP slot or fast-follow? Recommend fast-follow.
4. Continuity T4 (WI-1483 recap next-topic): journal carries no nextTopicTitle — re-spec or kill?
5. WI-1416 (4 design forks from coverage audit: provenance, denial UX, parking-return, S3 rare rows) — rule the forks or defer.
6. WI-1465 / WI-1469 (CR re-prove path; SM-2-vs-Challenge mastery relationship) — design forks, defer OK?
7. Sheets' per-row Zuzka questions (≤3 each) — batch-review during the session.

**OPERATOR — 3:**
1. Confirm RLS posture: app-layer scoping suffices for launch; DB-layer RLS = post-launch hardening (sheet 23 argues yes).
2. Coverage-debt workstream: create under INI-32 or engineering initiative? (Routes WI-1401-1414.)
3. Extraction gaps G1/G2: authorize creating the 2 missing candidates.

**AGENT-DECIDABLE (decided herein, no ruling needed):** all kills/closes in §2 (factual, evidence-cited); re-homes; docs-lane routing; WI-1437 refile.

## 5. Process notes

- Register pre-buckets were wrong twice (row 21 "executed" — actually live legacy; row 3 partially dead surfaces) and right 24 times. Both misses were caught by code evidence — the audit layer worked.
- One auditor escalation (Gemini under-18 compliance) was REFUTED by PM verification before reaching Product (router.ts:679 WI-1052 gate). Lesson: auditor flags route through PM verification, not straight to escalation.
- Commit af91a3e18 silently executed slices of two plans (rows 3+6) without referencing them — spec-drift cuts both ways; the annotation pass (WI-1439/1460) is worth its cost.

## Status

- [x] Phase 0 — register
- [x] Phase 1 — 27 disposition sheets
- [x] Phase 2 — this pack
- [ ] Phase 3 — Zuzka + operator ruling session (over §3 + §4)
- [ ] Phase 4 — execute fates (§2) + MVP delta → PGM-1 roadmap

## 3b. Addendum (2026-07-03 ~21:20Z): Execution-Candidate batch (12 items)

A second batch landed post-consolidation, sprint-tagged 'Execution Candidates' — launch-readiness gaps, not spec extraction. PM assessment:

| Item | PM position | Routing |
|---|---|---|
| WI-1503 dogfood prod build | MVP-in, cheap, highest value | WS-39, sequence with WI-1341 |
| WI-1505 LLM spend guardrails + kill switch | MVP-in — aggregate guard + env-level shutoff genuinely absent (user-level dual-cap ≠ aggregate) | WS-39 or platform lane |
| WI-1504 activation instrumentation | MVP-in — RULED 2026-07-03: sink = first-party events (API→Neon, SQL); PostHog = post-MVP fast-follow; ACs on the item | WS-39 (released) |
| WI-1500 launch health dashboard | MVP-in as ALERTS on the 6 named signals; dashboard = fast-follow. Absorbs WI-1399 overlap | WS-39 |
| WI-1506 closed beta (5-10 families) | Recommend YES — but it is a CALENDAR ruling (2-4 wks on critical path), decide first | operator + Zuzka, now |
| WI-1507 compliance closure check | MVP-in — cross-check, not build; tie to WI-1442 | WS-30/29 |
| WI-1497/1498/1499/1501/1502 trust package | fast-follow default; exceptions to argue: WI-1499 minimal v1 (safety flag → telemetry) MVP-worthy for a minors product; WI-1501 v1 = support email link | Zuzka queue |
| WI-1508 billing banner | KILL — duplicate of WI-1475 (fold its V2-re-anchor note into 1475) | dedupe |

Ruling additions: Zuzka queue +2 (trust-package scope; WI-1499 minimal-v1). Operator queue +1 (closed-beta calendar ruling — this one sets the launch date; recommend ruling it before or at the Phase-3 session).
