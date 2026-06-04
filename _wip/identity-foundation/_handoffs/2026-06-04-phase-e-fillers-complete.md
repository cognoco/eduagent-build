# Handover — Phase-E fillers walkthrough complete (2026-06-04)

**Status:** ✅ COMPLETE. 11 captures (P1–P6, L1–L5) — each carries a Rule / Parameter / Product-call
outcome; every legal answer has a `basis:`. Captures live in
`phase-e-fillers-walkthrough/CAPTURE-LEDGER.md` (paste-ready for **PRD Part 10 §I**); citations in
`phase-e-fillers-walkthrough/SOURCES.md`.

**What this was:** the follow-up to the 2026-06-03 counsel walkthrough. That session ruled the
*structural* legal questions; this one filled the **values + product calls** the rulings left as seams,
on top of the now-locked data model (`MMT-ADR-0011/0012`, ratified 2026-06-04).

**The one decision that changed everything:** the PM set the **launch age floor to 13+** (deferring 11+
to a demand-triggered phase 2). Group L is sized to that floor.

---

## Where everything lives

| Artifact | Path | What |
|---|---|---|
| **Capture ledger** | `phase-e-fillers-walkthrough/CAPTURE-LEDGER.md` | The 11 captures + the recalibration table + the V1–V5 code-verification log. Paste-ready for PRD Part 10 §I. |
| Source register | `phase-e-fillers-walkthrough/SOURCES.md` | Every `basis:` citation with instrument + clause + regime split. |
| This handoff | `_handoffs/2026-06-04-phase-e-fillers-complete.md` | Flags for architect / Phase F / G7 procurement + monitors. |
| Session inputs | `phase-e-fillers-walkthrough/{FACILITATOR-BRIEF,BRIEFING-PACKET,WALKTHROUGH}.md` | The brief, context, and script the session ran from. |

---

## 🔑 The 13+ recalibration — what moves from launch to phase 2

A 13+ launch floor removes **one** regime from the launch path — **COPPA's under-13
"directed-to-children" chain** — and parks it in phase 2 (the demand-triggered 11+ add). Everything
keyed to the **under-18** child-protection pole stays live at launch.

**This materially de-risks the launch gate.** The 2026-06-03 handoff listed **COPPA §312.8 (written
security program, deadline 22 Apr 2026 passed) as a PRESENT launch blocker.** At a 13+ floor, COPPA
does not apply at launch, so:

- **COPPA §312.8 / §312.5 VPC / §312.10 retention → phase-2 blockers, not launch blockers.**
- The under-13 enumerated-VPC verification tier (L4) → **phase-2**, not launch.
- The G7 VPC vendor RFP can be **sized for the 13–16 "reasonable efforts" bar at launch**, with the
  under-13 enumerated tier as a deferred option.

**What still gates launch (unchanged by 13+):**

- The **DPIA (E5)** — 13–17 minors = large-scale processing of minors' data + AI.
- **GATE-1 minor-routing** — pin 13–17 minors to a papered/ZDR LLM endpoint (they're still minors).
- **GDPR Art 8** "reasonable efforts" consent where the national digital-consent age is 14/15/16.
- **UK Children's Code** (under-18), **AI-Act Art 5 + Art 50**, **DPO appointment**, the **Chapter V
  transfer stack + Art 28 DPAs**.

**The "knowingly" trap that survives at 13+:** if we obtain *actual knowledge* a user is under-13
(self-report despite the gate), COPPA §312.5 attaches *to that user*. **Keep the COPPA program
scaffolded + a delete-on-under-13-discovery path warm even at the 13+ floor.**

---

## 🚩 Flags

### To the architect — zero structural ripples (one note)
No new consent/payment/access axis was introduced; `inv 17` and `MMT-ADR-0002` ("via RevenueCat") are
already ratified (2026-06-04). **Note, not a ripple:** the 13+ floor recalibrates *which* compliance
obligations are launch-vs-phase-2 (COPPA → phase-2). The **compliance three-bucket model** is keyed on
the **under-18 strict pole**, which 13+ does **not** move — so the spine is intact; only the COPPA-band
items shift tier. No canon is newly wrong.

### To Phase F (the build) — the floor change ripples
- `birthYearSchema` refine `≤ currentYear-11` → `≤ currentYear-13` (`packages/schemas/src/profiles.ts:52`),
  **and ship the documented rationale in the same change** (`I-PB-B1` / UK written-record duty).
- Eval fixtures below 13 → bump or mark phase-2: `apps/api/eval-llm/fixtures/profiles.ts` (birthYear
  2015 ≈ 11yo, 2014 ≈ 12yo); `apps/api/eval-llm/fixtures/probes/battery.ts` (`getFullYear()-11` probe).
- Reconcile the **"Strictly 11+"** sections: project `CLAUDE.md`, `AGENTS.md`, and the auto-memory
  "Product Constraint — Strictly 11+" block (the 11+ dead-code-branch note from commit `970a82a5`).
- The `person_retain` `retention_period` values (I-L1), the dormancy/notice thresholds (I-L2), the
  moved-country grace (I-L3) are **parameter values into existing seam columns** — no schema reshape.
- **Doc-drift fix:** `data-model.md §9` cites the floor at `packages/database/src/schema/profiles.ts:38-50`;
  it's actually the Zod rule at `packages/schemas/src/profiles.ts:38-54`. Correct the citation.

### To G7 / procurement
- **Launch RFP bar = the 13–16 "reasonable efforts" verification** (payment-card-light / KBA /
  vendor-attested soft signal). The **under-13 COPPA-enumerated tier is a deferred phase-2 option** —
  keep it in the RFP as an option, don't gate launch on it.

---

## 📡 Monitors

- **Demand for the 11–12 segment + COPPA readiness** — the phase-2 11+ trigger (§312.8 program, VPC
  vendor, §312.10 path). (I-P1)
- **Apple/Google AI-chat content-rating questionnaire** — the 2025 granular-age update added
  AI-chatbot / UGC questions; could move the 9+ landing. (I-P2)
- **App Store Accountability Acts (TX/UT/LA)** — under-18 scope; enjoined/delayed, revisit per launch
  market. (I-P3)
- **ICO Children's Code minor-retention guidance** — could shorten the 24-month dormancy for minors.
  (I-L2)
- **UK Children's Wellbeing & Schools Act 2026** — the primary age-assurance watch (not Crime &
  Policing). (I-L3)
- **Norway digital-consent age 13→15 consultation** — widens the can't-self-consent band. (I-P3, I-L4)

---

## 📋 Follow-up queue (PM → Notion / Phase F)

| Item | Source | Notes |
|---|---|---|
| Floor 11→13 + documented rationale, in one change | I-P1 | `birthYearSchema:52`; UK written-record duty |
| Sub-13 eval fixtures → phase-2 or bump | I-P1 | `eval-llm/fixtures/profiles.ts`, `battery.ts` |
| "Strictly 11+" doc/memory reconciliation | I-P1 | CLAUDE.md, AGENTS.md, auto-memory |
| 5-point double-charge disclosure + 14-day grace | I-P5 | join-flow modal + pre-renewal nudge; copy-snapshot CI guard (carried from 2026-06-03 #5) |
| `payer_person_id` = organiser default | I-P6 | access-inert; re-sync recovers |
| Retention values into the 3 `person_retain` columns | I-L1 | per-jurisdiction for `financial_record` |
| Delete-on-under-13-discovery path (the "knowingly" trap) | I-P3 | keep warm even at 13+ |

---

## Code-verification (this session)
Of **5 load-bearing premises checked, 2 were materially off** (the data-model §9 path citation; the
"column in place" phrasing — the seam columns are designed, not yet built). Both fixed above. Full
log: `CAPTURE-LEDGER.md` → V1–V5. Same discipline the 2026-06-03 session used (it found 2 of 7 false).

## Next session should
1. Phase F: execute the baseline migration + the floor change + the doc/fixture reconciliation.
2. Issue the G7 RFP sized to the 13–16 bar (under-13 tier deferred).
3. Continue the DPIA (still the launch gate; 13+ trimmed COPPA from it but not the under-18 core).
