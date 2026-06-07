# Capture ledger — Phase-E fillers walkthrough (2026-06-04)

**Status:** ✅ COMPLETE. 11 captures (P1–P6, L1–L5). Paste-ready for **PRD Part 10 §I** (the PM types
these into the PRD; precedent = the 2026-06-03 session, which captured to a notes file first).

**Session shape:** facilitator + PM + counsel. Group P (product calls) front-loaded because P1 gates
the Group L sizing. The three gating product calls came back as: **P1 = 13+ at launch (defer 11+);
P2 = IARC 9+; P4 = stay out of Kids Category / Designed-for-Families.** Group L is sized to that.

**Grounding rule (carried from 2026-06-03):** every legal answer carries a `basis:`. Product calls
carry rationale + implications + undo cost + monitor (no `basis:`). Full citations with URLs live in
`SOURCES.md`.

---

## The recalibration the 13+ floor forces (read first)

A 13+ launch floor removes **one** regime from the launch critical path — **COPPA's under-13
"directed-to-children" chain** — and moves it to phase 2 (the demand-triggered 11+ add). Everything
keyed to the **under-18** child-protection pole stays live at launch:

| Regime | At 13+ launch | Why |
|---|---|---|
| COPPA "directed to children" (§312.2/.5/.8/.10) | **OUT → phase-2 trigger** | Turns on *knowingly serving under-13s*; a 13+ floor means we don't. |
| GDPR Art 8 digital-consent age | **IN** | 13–15-year-olds are below the national line in member states where it's 14/15/16. |
| UK Children's Code (under-18) | **IN** | Applies to all under-18 users. |
| AI-Act minor provisions / Art 50 | **IN** | Independent of the under-13 line. |
| GDPR DPIA (E5 launch gate) | **IN** | Large-scale processing of 13–17 minors' data + AI. |

**The one "knowingly" trap that survives at 13+:** if we obtain *actual knowledge* a user is under-13
(self-report despite the gate), COPPA §312.5 attaches *to that user*. So keep the COPPA program
scaffolded + a **delete-on-under-13-discovery** path warm even at the 13+ floor.

---

## Group P — Product calls

### I-P1 — Signup age floor  `[Product call]`
**Decision:** Launch at **13+**. Defer **11+** to a demand-triggered **phase 2**.
- **Current state (verified):** `birthYearSchema` rejects age < 11 (`packages/schemas/src/profiles.ts:38-54`,
  tag `CR-2026-05-19-H11`). The "11" is a Zod product rule, not a store rating and not a legal line
  (per `I-PB-B1`).
- **Rationale:** 13+ is "nearly free" — the consent model already serves up to 16, so 13–17 minors
  are in scope and the built scaffolding isn't wasted — while 11+ pulls in the full COPPA
  enumerated-VPC chain + the G7 under-13 vendor tier, deferrable until there's demonstrated demand
  for the 11–12 segment. Keeps the COPPA scaffolding warm so phase-2 is an additive value-flip.
- **Implications:**
  - *Legal:* COPPA out at launch → phase-2 trigger; GDPR-K, under-18 Children's Code, AI-Act, DPIA
    all still bind (see recalibration table).
  - *Store:* simplifies posture; coheres with 9+ / stay-out.
  - *UX:* onboarding age-gate copy 11 → 13.
  - *Build (Phase F):* `birthYearSchema` refine `≤ currentYear-11` → `≤ currentYear-13` + ship the
    documented rationale in the same change (`I-PB-B1` / UK written-record duty); eval fixtures with
    sub-13 birth-years (`apps/api/eval-llm/fixtures/profiles.ts` 2015≈11yo, 2014≈12yo; `battery.ts`
    `getFullYear()-11` probe) → phase-2 or bump to ≥13; reconcile the "Strictly 11+" sections in
    CLAUDE.md / AGENTS.md / project memory + the 11+ dead-code-branch note.
- **Undo cost:** LOW. Adding 11+ later is additive (flip the refine + re-activate COPPA scaffolding +
  complete the G7 under-13 tier). No data loss (pre-launch, zero users).
- **Monitor:** demand signal for the 11–12 segment **AND** COPPA readiness (§312.8 written security
  program, VPC vendor, §312.10 retention path) before any phase-2 flip.

### I-P2 — Store content-rating band  `[Product call]`
**Decision:** Aim for **IARC 9+** (Apple 9+ / PEGI 7 / ESRB E10+).
- **Rationale:** the band is a *content-maturity descriptor*, not a usage gate. An open-ended LLM tutor
  can surface mild-mature academic content on request (history/biology/literature), which an honest
  IARC questionnaire lands at 9+; self-rating 4+ risks an App Store content-mismatch rejection. At a
  13+ floor there is **no device-gating downside** to 9+ (no under-9/under-12 users to gate).
- **Implications:** *store* — answer the IARC questionnaire to land 9+ (affirm mild references /
  open AI-generated content); *UX* — none (band invisible in-app); *legal* — none direct.
- **Undo cost:** MEDIUM — a band change triggers an App Store re-review. Documented intent to revisit
  toward 12+ if the tutor routinely handles genuinely mature subject matter. (Renamed "ward" → "charge" 2026-06-06 per the charge-terminology sweep; this line refers to a minor age band, not a legal-corpus usage.)
- **Monitor:** observed tutor content range; Apple/Google AI-chat questionnaire changes (the 2025
  granular-age-rating update added AI-chatbot / UGC questions).

### I-P3 — Per-program applicability at the 13+ launch floor  `[Rule (counsel) + Product call (opt-in)]`
| Program | Applies at 13+ launch? | basis |
|---|---|---|
| Apple Kids Category | **No** (opt-in; we stay out — I-P4) | App Store Review Guidelines §1.3 / §5.1.1 |
| Google Designed for Families | **No** (opt-in; we stay out — I-P4) | Google Play Families policy |
| COPPA "directed to children" | **No at launch → phase-2 trigger** when 11+ ships; *but* a delete-on-under-13-discovery duty persists | 16 CFR §312.2 (definition), §312.5 (VPC), §312.10 (retention) |
| EU/UK digital-consent age | **Yes** — 13–15yos below the national line (DE/NL/IE 16; FR/CZ/GR 15; IT/AT 14) need "reasonable efforts" guardian consent + the LLM-disclosure gate; UK = 13 (self-consent) | GDPR Art 8(1)-(2) + EDPB Guidelines 05/2020 §7.1; UK-GDPR Art 8 / DPA 2018 s.9 |
| App Store Accountability Acts (US state) | **Conditional → Monitor** (cover under-18; enjoined/delayed as of 2026-06-03) | TX SB 2420; UT SB 142; LA 2025 |

### I-P4 — Kids Category / Designed-for-Families posture  `[Product call]`
**Decision:** **Stay out.**
- **Rationale:** at 13+ these programs (aimed primarily at under-13 directed apps) aren't required;
  staying out avoids per-release kids-review friction, the strict third-party-SDK constraints
  (analytics/Sentry scrutiny), and the Designed-for-Families "teacher/parent-recommended" bar. We meet
  our actual obligations directly (no ads, IAP-only).
- **Implications:** app not listed in the kids section; no kids-program review overhead.
- **Undo cost:** re-review on a posture change (relevant if phase-2 11+ revisits this).
- **Monitor:** phase-2 11+ decision (Kids Category becomes more relevant when serving under-13s).

### I-P5 — Joining-teen double-charge disclosure + grace  `[Product call + Parameter]`
**Product call — the 5-point disclosure copy** (blocking modal at join-confirmation, must acknowledge;
+ a follow-up nudge before the personal sub's next renewal):
1. "You'll keep being charged for your own subscription until you cancel it — joining the family plan
   does **not** auto-cancel it."
2. "The family plan already covers your access — your own subscription is now redundant."
3. "Here's exactly how to cancel it: [store-specific manage-subscription deep link + steps]."
4. "Until you cancel, you'll be billed twice. The family organiser can see family-plan charges, not
   your personal subscription."
5. "Charged after joining and couldn't cancel in time? Here's how to dispute: [path]."

**Parameter — grace:** the "next charge" is the *personal sub's renewal*, not the family sub's. Fire
the disclosure **≥14 days before** that renewal where it's ≥14 days out; if it's <14 days out at join,
surface an immediate "cancel now to avoid the next charge" CTA. **Minimum cancellation window = 14 days.**
- `basis:` Norway *angrerettloven* §22 (14-day withdrawal); EU Consumer Rights Directive 2011/83 Art 9
  (14-day) + Art 16(m) (the digital-content waiver removes the *refund*, not the *disclosure* duty);
  UK Consumer Contracts Regs 2013 reg 30 (14-day) + CRA 2015 Pt 2; UCPD 2005/29 Art 7 (misleading
  omission). Counsel confirms the 5-point shape satisfies the `I-E4` conditioning.
- **Note:** store-delegated billing rules out a server-side refund (`MMT-ADR-0002`) — the lawful path
  is disclose + assist-cancel, not refund.

### I-P6 — `payer_person_id` under Family Sharing / Ask-to-Buy  `[Rule]`
**Rule:** record the **store-account-holder** (the Person whose Apple/Google account is actually
charged). Under Family Sharing / Ask-to-Buy that resolves to the **family organiser** (the approving
parent). The child is the *user/beneficiary*, recorded via the membership/consent edges — **not** as
`payer_person_id`. Default when there is no Family Sharing (solo teen, own store account): that Person.
- `basis:` Apple Media Services Terms — Family Sharing (the organiser's payment method funds family
  purchases); Google Play Families / Family Library (family manager's payment method); GDPR Art 28
  processor framing (`MMT-ADR-0002`, merchant of record = Apple/Google). Uniform EU/US/UK — store-ToS
  driven, not statute-driven.
- **Note:** access-inert attribution (verified — no permissions ride on it); a stale value is
  recoverable by re-sync (worst case: wrong name on a billing screen).

---

## Group L — Counsel parameters (sized to 13+)

### I-L1 — Retention periods on the three `person_retain` tables  `[Parameters]`
| Table | Floor | `basis:` |
|---|---|---|
| `consent_receipt` | **Until (charge turns 18) + 3 years**; adult floor **3 years** from withdrawal | GDPR Art 5(2) + Art 7(1) (must demonstrate consent) + EDPB Guidelines 05/2020 §7.1; UK Limitation Act 1980 s.28 (minor disability — clock from 18); (phase-2 US: COPPA §312.10 "only as long as reasonably necessary") |
| `deletion_audit` | **6 years** (or until charge 18 + 3y, whichever is longer for a minor) | GDPR Art 5(2) (accountability) + Art 30; UK Limitation Act 1980 (6y contract) + s.28 minor-tolling |
| `financial_record` | **Per-jurisdiction; conservative single floor = 10 years** (NO 5 / UK 6 / US 7 / DE-EU 10) | Norway *bokføringsloven* §13 (5y); DE §147 AO / EU VAT Directive 2006/112 (10y); UK Companies Act 2006 s.388 / HMRC (6y); US IRC §6501 (7y) |
- **Per-jurisdiction split is real** for `financial_record` — the `retention_period` column stores the
  value per-row; the schema doesn't need to know the regime at read time.
- **PM opt-up note:** audit value past the legal floor is real, but Art 5(1)(e) storage-limitation caps
  over-retention — do not opt to "forever."

### I-L2 — Dormancy threshold + pre-deletion notice  `[Parameters + Rule on surface]`
- **Dormancy threshold = 24 months** of no `last_activity_at`. `basis:` GDPR Art 5(1)(e) storage
  limitation; ICO Children's Code std 8 (data minimisation). **Monitor:** shorten for minor accounts if
  Children's Code guidance tightens.
- **Pre-deletion notice = 30 days** between notice and deletion. `basis:` GDPR Art 12(1) (transparency)
  + proportionate-notice good practice.
- **Notice surface `[Rule]`:** **email is the primary required channel** (the dormant user won't see
  in-app); in-app fires as secondary on next open. For a **minor with active guardianship**, the notice
  must also be capable of reaching the **guardian**. `basis:` GDPR Art 12(1) (accessible means); ICO
  Children's Code std 4 (transparency to children) + the guardianship relationship.

### I-L3 — Moved-country grace window  `[Parameter]`
- **Grace = 30 days** before `suspend-to-browse-preview` fires; the user retains browse-preview (no
  hard lockout, per the E2 ruling) while consents re-affirm under the new jurisdiction.
- `basis:` GDPR Art 5(1)(c) minimisation + proportionality (time to read the new-jurisdiction
  disclosures). **Monitor:** UK Children's Wellbeing & Schools Act 2026 age-assurance (the primary
  watch per the 2026-06-03 handoff — *not* the Crime & Policing Act).

### I-L4 — Boundary-crossing verification method (protection-lowering)  `[Parameters per crossing]`
| Crossing | At 13+ launch | Method | `basis:` |
|---|---|---|---|
| **Under-13 exit** | **N/A at launch → phase-2** | COPPA-enumerated tier (payment-card+txn, gov-ID match, signed form, video, KBA) — highest rigor; G7 phase-2 option | COPPA 16 CFR §312.5(b)(1)-(2) |
| **13–16 crossing** | **LAUNCH-relevant** | "Reasonable efforts considering available technology" — proportionate, **not** gov-ID: payment-card-light / KBA / vendor-attested soft signal + self-declaration | GDPR Art 8(2) + Recital 38 + EDPB Guidelines 05/2020 §7.1 |
| **17→18 (adult-onset)** | applies | Lightest — single-step self-declaration / payment-card; a genuine adult clears in one step | `I-PB-B2b`; GDPR Art 16 (rectification) |
- **G7 handoff:** at launch the vendor must meet the **13–16 "reasonable efforts" bar**; the under-13
  COPPA-enumerated tier is a **phase-2 option in the RFP**, not a launch blocker. This is the key G7
  recalibration from the 13+ decision.

### I-L5 — Co-guardian one-of / all-of rule  `[Rule, per-operation]`
- **Default = one-of** (either holder of parental responsibility may act alone) for routine
  consent-bearing ops: data-disclosure change, marketing opt-in, age-related consent re-affirmation.
- **Irreversible ops (account/data deletion) = one-of-PLUS-notice:** the requesting guardian initiates;
  the other guardian is notified with an objection window. *Not* strict all-of (deadlocks a child
  living between two homes); *not* bare one-of (lets one parent unilaterally destroy). The product
  surfaces "the other guardian has been notified."
- **Default in absence of config = one-of** (friendlier for a child between two homes), with the
  irreversible-op notice as the safety valve.
- `basis:` UK Children Act 1989 s.2(7) (each holder may act alone, save where consensus is statutorily
  required) + major-decision caveat; Norway *barnelova* §30 + §37 (joint parental responsibility);
  COPPA single-parent VPC (16 CFR §312.5). PM validates the product envelope.

---

## Code-Verification Log (V1–V5)

| # | Premise | Verdict | Evidence |
|---|---|---|---|
| **V1** | "11" floor in `birthYearSchema`, tag `CR-2026-05-19-H11` | ✅ true; **mis-cited** in data-model §9 | Real path `packages/schemas/src/profiles.ts:38-54` (Zod). Data-model §9 cites `packages/database/src/schema/profiles.ts:38-50` — that's the Drizzle table, a different file. |
| **V2** | Seam columns "in place / in the schema" | ⚠️ **phrasing false; conclusion holds** | `payer_person_id`, 3× `retention_period`, `last_activity_at`, `residence_jurisdiction`, the `person_retain` tables exist **only in `_wip/` docs** — nowhere in `apps/`/`packages/`. Designed in `data-model.md`, **built in Phase F**. Net: genuinely unsized → no silently-set value to miss. |
| **V3** | Current `subscription` shape (grounds P6 + L1) | ✅ true | `subscriptions` → `account_id` (unique FK) + nullable T1 `organization_id`; RevenueCat/Stripe fields; **no payer column, no retention column** (`packages/database/src/schema/billing.ts`). |
| **V4** | A COPPA-13 boundary already exists in code | ✅ note | `PRONOUNS_PROMPT_MIN_AGE = 13` (`profiles.ts:36`) gates one data field at 13. |
| **V5** | The `owner` fossil the model dissolves | ✅ note | `profileQuotaUsage.role` enum still `['owner','child']` (`billing.ts:143`) — the Phase-F isOwner→admin rekey target. |

**Methodology echo:** as in 2026-06-03 (2 of 7 premises false), **2 of 5 here were materially off**
(the §9 path citation; "in place" → "designed, Phase-F-pending"). Both fixed in the handoff so
downstream readers don't inherit them.
