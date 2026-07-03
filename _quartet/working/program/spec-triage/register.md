# Spec-corpus triage register

**Phase 0 output** (program-manager:fable, 2026-07-03). Method: `docs/specs/` + `docs/plans/` paired by feature; all 83 Quarantine-sprint candidates mapped to source rows. Candidates were created with per-item code verification (`verified 2026-07-03` + file:line in Found In) — Phase 1 disposition audits should REUSE those verifications, not redo them, and add only the document-level judgment.

**Verdict vocabulary:** `valid | partially-implemented | superseded | obsolete | needs-product-ruling` (Phase 1 fills; pre-bucket below is a skim-level prior, not a verdict).

| # | Feature row | Spec | Plan | Candidates (Quarantine WIs) | Pre-bucket / prior |
|---|---|---|---|---|---|
| 1 | Review & relearn findings (RR-1..15) | 2026-06-03-review-relearn-findings | — | 1461–1472 (12) | B — item-level findings doc; several RR items look already-actioned; per-item triage |
| 2 | Owner-impact audit top-10 | 2026-06-03-owner-impact-audit-top-10 | — | 1441–1449 (9) | B — audit doc; items verified individually; MVP question per item (several are Bugs) |
| 3 | Product continuity low-hanging fruit | — | 2026-05-31-product-continuity | 1480–1486 (7) | B — pre-V2 plan; most items need V2 re-spec (NowCard) — validity hinges on V2 surface fit |
| 4 | Billing recovery / learner capacity | — | 2026-05-31-billing-recovery | 1475–1479 (5) | B — touches revenue path; check overlap with WI-1328 chain; T0/T4 blocked on proxy-guard |
| 5 | Notification reachability | — | 2026-05-31-notification-reachability | 1487, 1488 (2) | B — T3 small; T4–T6 need re-triage + spec |
| 6 | Resumable practice state | — | 2026-05-31-resumable-practice-state | 1489 (1 umbrella) | B — zero resume infra exists; needs V2 NowCard spec first |
| 7 | Profile setup / personalization | — | 2026-05-31-profile-setup-personalization | 1496 (1) | B — one surviving item (conversation-language picker); rest presumed done — Phase 1 confirms |
| 8 | Note correctness + challenge draft | (concept-capture overlaps) | 2026-06-08-note-correctness | 1490, 1491, 1455 (3) | B — T1–T13 umbrella; validateNoteDraft dead-guard is a live Bug |
| 9 | Concept-capture layer | 2026-06-08-concept-capture-layer | — | 1454–1456 (3) | B — write-side shipped (per WI-1439); read-side items live |
| 10 | Felt-knowing loop | 2026-06-27-felt-knowing-loop | — | 1450–1452 (3) | B — F1–F7; F3/F4 is a user-visible broken CTA (Bug) |
| 11 | Homework autofile / recall bridge | 2026-06-27-homework-autofile | 2026-06-27-homework-autofile | none | A? — paired spec+plan but ZERO candidates extracted — Phase 1 must determine shipped vs missed |
| 12 | Journal redesign | 2026-06-27-journal-redesign | — | none (1439 marks it shipped) | A — shipped per stale-header WI; confirm |
| 13 | Forever notebook (north star) | 2026-06-08-forever-notebook | — | none (1439) | A — north-star doc, shipped/absorbed; confirm |
| 14 | Warm chat greeting | 2026-05-27-warm-chat-greeting | — | 1453 (1) | B — v1 shipped; v1.5 rotating pool open |
| 15 | Trial-intent save onboarding | 2026-05-18-trial-intent-save | — | 1457, 1458 (2) | B — Phase 4 + preview lesson need product decision + V2 re-spec |
| 16 | Voice-first (Epic 17) | 2026-04-07-epic-17-voice-first | — | 1459 (umbrella; 1447 locale bug relates) | B — ~95% unimplemented, oldest spec; likely post-MVP wholesale; voice is product-critical long-term |
| 17 | Mentor-is-the-app shell | 2026-06-09-mentor-shell-redesign | v2-plan/, v2-dossier/ | 1440 (S6 ruling); 1393–1397 (dossier gaps) | A — IS the current architecture; S6 = existing roadmap gate; dossier re-homes are real V2 gaps |
| 18 | V2 publish readiness | — | 2026-06-30-v2-publish-readiness | none | A — this IS the live program (WS-28/M-chain); no triage needed |
| 19 | Review-continuity opener + simulation harness | — | 2026-06-27-review-continuity-opener | 1437? (milestone NowCards) | B — Phase 1 maps status |
| 20 | Challenge-round grader/judge | — | 2026-06-26-challenge-round-grader | 1438 (model-vetting doc) | A — shipped; residue is register/ADR reconciliation |
| 21 | Gemini runtime removal | — | 2026-06-24-gemini-runtime-removal | 1435, 1436 | A — executed; residue = routing-v2 flip + post-soak deletion (both already staged post-launch) |
| 22 | Email consent withdrawal (P0) | 2026-06-26-p0-email-consent | — | none | A — shipped (WI-1340 landed today); archive |
| 23 | RLS phase 2–4 enforcement | — | 2026-04-15-S06-rls-enforcement | 1494, 1495 (2) | B — security posture item; scoped-repo gap is a live Bug; RLS umbrella is big — MVP ruling needed |
| 24 | epics.md (legacy register) | epics.md | — | 1460 (annotation pass) | A — bookkeeping only |
| 25 | Shared test-utility framework | — | 2026-05-12-shared-test-utility | none | C — infra; triage = still wanted? |
| 26 | Mobile lab macOS setup | — | 2026-05-19-mobile-lab-macos | none | C — infra/process; likely done or standing doc |

## Unmapped candidate block (no spec/plan source)

WI-1399–1416 (17 items) + WI-1439 (doc hygiene) + WI-1438: provenance is the **2026-07-03 test-coverage audit** and code anchors, not the spec corpus. Different triage: these are engineering-quality items — route to the normal backlog process (likely a coverage-debt workstream), NOT the product funnel. WI-1400 (zero V2 Maestro e2e) and WI-1406 (auth resilience) look ship-relevant; flag for MVP consideration.

## Phase 1 instructions delta (vs original design)

- Reuse the per-item `verified 2026-07-03` evidence in Found In; the auditor's job per row is the DOCUMENT-level sheet: claims summary, disposition verdict, candidate fates, MVP recommendation, ≤3 Zuzka questions.
- Bucket A rows (11, 12, 13, 17, 18, 20, 21, 22, 24) are confirm-only (~30 min each).
- Rows 11 (no extraction despite paired docs) and 4 (billing/revenue overlap with WI-1328) get extra care.
- Row 16 (voice-first) likely warrants a single "post-MVP wholesale, re-spec before execution" recommendation rather than item-level work.

## Status

- [x] Phase 0 — this register (2026-07-03)
- [ ] Phase 1 — 26 disposition sheets (post token-reset; Bucket A first)
- [ ] Phase 2 — consolidation into the triage decision pack
- [ ] Phase 3 — Zuzka + operator ruling session
- [ ] Phase 4 — execute fates (83 candidates: adopt/merge/kill), MVP delta → PGM-1
