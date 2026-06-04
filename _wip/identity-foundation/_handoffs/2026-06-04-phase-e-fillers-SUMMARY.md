# Phase-E fillers — one-page summary (2026-06-04)

The follow-up to the 2026-06-03 counsel session. The data model was locked (`MMT-ADR-0011/0012`); this
session filled the **values + product calls** the rulings left as seams. **11 decisions, all captured.**

## The decision that drove everything
**Launch age floor = 13+** (11+ deferred to a demand-triggered phase 2). This pulls **COPPA's under-13
chain out of the launch path** — including the §312.8 written-security-program item the 2026-06-03
handoff had flagged as a *present launch blocker*. It's now a phase-2 blocker. The **under-18 core**
(DPIA, minor-routing, UK Children's Code, GDPR Art 8 consent) **still gates launch** — 13+ is not an
adult app.

## Product calls
- **P1 — 13+ floor**, ship with a documented rationale. **P2 — IARC 9+** (honest band for an open LLM
  tutor). **P4 — stay out** of Kids Category. **P5 — 5-point double-charge disclosure + 14-day grace.**
  **P6 — `payer_person_id` = the store-account-holder** (organiser/parent).

## Legal parameters
- **L1 retention** — receipt: ward 18 + 3y; deletion-audit: 6y; financial: per-jurisdiction (floor 10y).
- **L2** — 24-month dormancy → 30-day notice (guardian also notified for minors).
- **L3** — 30-day moved-country grace → browse-preview.
- **L4** — 13–16 "reasonable efforts" at launch; under-13 enumerated-VPC is phase-2. **G7 RFP sized to
  the 13–16 bar.**
- **L5** — co-guardian: one-of for routine ops; one-of-plus-notice for deletion.

## Open trap & next steps
- **The "knowingly" trap:** actual knowledge of an under-13 user still triggers COPPA for that user —
  keep the program + a delete-on-discovery path warm even at 13+.
- **Phase F:** flip `birthYearSchema` 11→13 (+ rationale), bump sub-13 eval fixtures, reconcile the
  "Strictly 11+" docs. **Architect:** zero structural ripples. **G7:** size to 13–16.

**Detail:** captures → `phase-e-fillers-walkthrough/CAPTURE-LEDGER.md`; citations → `.../SOURCES.md`;
full handoff → `_handoffs/2026-06-04-phase-e-fillers-complete.md`.
