# Sources — Phase-E fillers walkthrough (2026-06-04)

**Status:** ✅ POPULATED at session end. Citations for every Rule / Parameter answer, grouped by
question, with instrument + clause + regime split. Captures: `CAPTURE-LEDGER.md`. Sized to the
**13+ launch floor** the PM set (11+ deferred to phase 2 → the COPPA-band citations below are
**phase-2** unless marked launch-live).

> Per the writer's note: each citation gives the instrument + the specific clause, and regime splits
> are recorded as such (EU / US / UK / NO). Monitors cite a draft/guidance instrument and flag the
> unsettled status. The 2026-06-03 register (`counsel-walkthrough/SOURCES.md`) is the shape precedent.

---

## Group P — Product calls

### I-P1 — 13+ age floor (product call; the *constraint* on it is cited)
- **`I-PB-B1`** (2026-06-03): no legal usage floor; the floor is a product/store-rating call that must
  ship with a documented rationale. — `counsel-walkthrough/SEGMENT-3-COUNSEL-ANSWERS.md`.
- **Written-record duty:** UK Crime & Policing Act 2026 (likely makes the documented rationale a
  statutory expectation). *Monitor — pending commencement.*
- **Current code:** `packages/schemas/src/profiles.ts:38-54` (`birthYearSchema`, tag `CR-2026-05-19-H11`).

### I-P2 — IARC 9+ band (product call; the rating mechanics are cited)
- **IARC questionnaire → store derivation:** International Age Rating Coalition — https://www.globalratings.com/
  (maps to PEGI / ESRB / ACB / USK). The band is content-derived, not developer-set.
- **Apple:** App Store Review Guidelines §1.3 (Kids) + the 2025 granular age-rating update (added
  AI-chatbot / UGC questionnaire items) — https://developer.apple.com/app-store/review/guidelines/
- **Google Play:** content-rating policy — https://support.google.com/googleplay/android-developer/answer/9859655
- **Rejection-on-mismatch basis:** Apple Review Guideline §2.3.6 (accurate age rating).

### I-P3 — Per-program applicability at 13+
| Program | Citation |
|---|---|
| Apple Kids Category | App Store Review Guidelines §1.3 / §5.1.1 (opt-in; kids-program commitments) |
| Google Designed for Families | Play Console Families policy — https://support.google.com/googleplay/android-developer/answer/9893335 |
| COPPA "directed to children" *(phase-2 trigger)* | 16 CFR §312.2 (definition turns on serving under-13s), §312.5 (VPC), §312.8 (security program), §312.10 (retention/deletion) — https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312 |
| EU digital-consent age *(launch-live)* | GDPR Art 8(1)-(2) + Recital 38; EDPB Guidelines 05/2020 on consent §7.1. Member-state split: DE/NL/IE/LU = 16; FR/CZ/GR/SI = 15; IT/AT/CY = 14; UK/SE/DK/PT/BE/FI = 13. |
| UK digital-consent age *(launch-live)* | UK-GDPR Art 8 + Data Protection Act 2018 s.9 (age 13) |
| App Store Accountability Acts *(Monitor — enjoined)* | Texas SB 2420 (2025); Utah SB 142 (2024); Louisiana 2025 — all enjoined/delayed as of 2026-06-03 |

### I-P4 — Kids Category posture (product call) — same instruments as I-P3 rows 1–2.

### I-P5 — joining-teen double-charge disclosure + 14-day grace
- **Conditioning:** `I-E4` (2026-06-03) — `counsel-walkthrough/SEGMENT-3-COUNSEL-ANSWERS.md` + PRD
  Part 10 §H Ripple 3.
- **Cooling-off / disclosure (regime split):**
  - **NO:** *angrerettloven* (Right of Withdrawal Act) §22 — 14-day withdrawal.
  - **EU:** Consumer Rights Directive 2011/83/EU Art 9 (14-day) + Art 16(m) (digital-content waiver
    removes the *refund*, not the *disclosure*).
  - **UK:** Consumer Contracts (Information, Cancellation and Additional Charges) Regs 2013 reg 30 +
    Consumer Rights Act 2015 Pt 2.
  - **Misleading-omission floor:** UCPD 2005/29/EC Art 7.
- **No-refund basis:** `MMT-ADR-0002` (store-delegated billing; merchant of record = Apple/Google).

### I-P6 — `payer_person_id` = store-account-holder (organiser)
- **Apple:** Apple Media Services Terms — Family Sharing (organiser's payment method funds family
  purchases) — https://www.apple.com/legal/internet-services/itunes/
- **Google:** Play Families / Family Library (family manager's payment method) —
  https://support.google.com/googleplay/answer/7007852
- **Processor framing:** GDPR Art 28; `MMT-ADR-0002` (merchant of record = Apple/Google; RevenueCat =
  Art 28 processor). Uniform EU/US/UK (store-ToS driven).

---

## Group L — Counsel parameters

### I-L1 — retention periods
| Table | Citation |
|---|---|
| `consent_receipt` (until ward 18 + 3y; adult floor 3y) | GDPR Art 5(2) + Art 7(1) (demonstrate consent) + EDPB Guidelines 05/2020 §7.1; UK Limitation Act 1980 s.28 (minor-disability tolling — clock runs from 18); *phase-2 US:* COPPA §312.10 |
| `deletion_audit` (6y; or ward 18 + 3y if longer) | GDPR Art 5(2) (accountability) + Art 30 (records of processing); UK Limitation Act 1980 (6y contract) + s.28 |
| `financial_record` (per-jurisdiction; floor 10y) | **NO** *bokføringsloven* §13 (5y); **DE** §147 AO + EU VAT Directive 2006/112/EC (10y); **UK** Companies Act 2006 s.388 + HMRC (6y); **US** IRC §6501 / IRS (7y) |

### I-L2 — dormancy + notice
- **Dormancy 24 months:** GDPR Art 5(1)(e) (storage limitation); ICO Children's Code std 8 (data
  minimisation) — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/
  *Monitor:* Children's Code minor-retention guidance could shorten this.
- **Notice 30 days + surface Rule:** GDPR Art 12(1) (transparency / accessible means); ICO Children's
  Code std 4 (transparency to children). Minor + guardianship → notice must reach the guardian.

### I-L3 — moved-country grace 30 days
- GDPR Art 5(1)(c) (minimisation) + proportionality; E2 ruling (suspend-to-browse-preview, not
  lockout). *Monitor:* UK Children's Wellbeing & Schools Act 2026 (s.214A / Art 8ZA age-assurance) —
  the primary watch per the 2026-06-03 handoff.

### I-L4 — boundary-crossing verification (per crossing)
| Crossing | Citation |
|---|---|
| Under-13 exit *(phase-2)* | COPPA 16 CFR §312.5(b)(1)-(2) (enumerated VPC methods) + FR 2025 amendments + Art 5(1)(c) minimisation cap |
| 13–16 *(launch-live)* | GDPR Art 8(2) ("reasonable efforts considering available technology") + Recital 38 + EDPB Guidelines 05/2020 §7.1 |
| 17→18 | `I-PB-B2b` (2026-06-03); GDPR Art 16 (rectification) + Art 5(1)(d) (accuracy) |

### I-L5 — co-guardian one-of / one-of-plus-notice
- **UK:** Children Act 1989 s.2(7) (each holder of parental responsibility may act alone, save where
  consensus is statutorily required) + the major-decision caveat.
- **NO:** *barnelova* (Children Act) §30 (content of parental responsibility) + §37 (joint decisions).
- **US:** COPPA 16 CFR §312.5 (a single verified parent's VPC suffices) + state joint-custody law.
- **Default in absence of config:** one-of (product call derived from the rule; irreversible-op notice
  is the safety valve).

---

## Notes
- **Regime splits are real** in I-L1 (`financial_record`), I-P3 (digital-consent age), I-P5
  (cooling-off), I-L4 (per crossing) — the `retention_period` / config columns store per-row so the
  schema needn't know the regime at read time.
- **Phase-2 markers:** the COPPA citations (I-P3 row 3, I-L4 under-13) are *not* launch-live at the 13+
  floor — they switch on with the demand-triggered 11+ add. Kept here so the phase-2 register inherits
  them intact.
- **Member-state digital-consent ages** shift (Norway 13→15 consultation; Spain draft 14→16) — treat
  the per-country list as a maintained config, not a frozen table. Re-pull before relying for a launch
  market.
