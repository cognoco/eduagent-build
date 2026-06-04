# Sources — Phase-E fillers walkthrough

**Status:** placeholder. Populated at session end, alongside the `BRIEFING-PACKET.md` capture.

This register collects the **`basis:` citations** counsel uses for every Rule / Parameter / Monitor
answer in the walkthrough, grouped by question, with full URLs. The 2026-06-03 counsel-walkthrough
register (`counsel-walkthrough/SOURCES.md`) is the precedent — it has the same shape.

Most of today's parameters ride the **provisions the 2026-06-03 session cited**. The new citations
this session introduces are mostly the **store-program rules** (Apple Kids Category, Google
Designed for Families, COPPA "directed to children" reach, IARC questionnaire rules) and any
per-jurisdiction parameter floors (Norway *angrerettloven* §22n for the double-charge grace, etc.).

---

## Group P — Product calls

### P1 — the "11" age floor

| What needs a citation | Likely sources |
|---|---|
| None (product call); but the *constraint* that the floor must align with the store label + posture comes from `I-PB-B1` | `counsel-walkthrough/SEGMENT-3-COUNSEL-ANSWERS.md` (the I-PB-B1 ruling) + UK Crime & Policing Act 2026 (the written-record duty) |

### P2 — the store label we aim for

| What needs a citation | Likely sources |
|---|---|
| The IARC questionnaire mapping to PEGI / ESRB / etc. | IARC official questionnaire + rating body sites (PEGI.info, ESRB.org); Apple App Store Review Guidelines; Google Play Store policy center |

### P3 — additional requirements per low-age label

| What needs a citation | Likely sources |
|---|---|
| The store-program rules + the COPPA "directed to children" trigger + EU/UK digital-consent-age + App Store Accountability Acts | Apple Kids Category (App Store Review Guidelines §1.4 / 5.1.1) + Google Designed for Families (Play Console policy) + COPPA 16 CFR §312.2 (directed to children) + §312.5 (VPC) + §312.10 (retention/deletion) + GDPR Art 8 / EDPB Guidelines 05/2020 + UK-GDPR Art 8 (DPA 2018 s.9) + Texas SB 2420 + Utah SB 142 + Louisiana 2025 |

### P4 — Kids-Category / Designed-for-Families posture

| What needs a citation | Likely sources |
|---|---|
| Same as P3 (it's a Yes/No on the program opt-in) | Same |

### P5 — joining-teen double-charge disclosure + grace

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| The 5-point disclosure shape (the conditioning on option B) | The `I-E4` counsel ruling from 2026-06-03 | `counsel-walkthrough/SEGMENT-3-COUNSEL-ANSWERS.md` (the I-E4 ruling) + PRD Part 10 §H Ripple 3 |
| The grace length (per-jurisdiction cooling-off / double-charge rules) | Norway *angrerettloven* §22n + EU CRD 2011/83 Art 16(m) + UK CRA 2015 Pt 2 + UCPD 2005/29 | The four regime-specific cooling-off / disclosure rules |

### P6 — `payer_person_id` under Family Sharing / Ask-to-Buy

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| The Payer-attribution rule per regime | EU/UK/US guidance on who's recorded as the paying party in a family-store arrangement; store-ToS terms (Apple Family Sharing, Google Family Library) | Apple Family Sharing ToS + Google Play Family Library + the merchant-of-record / Art 28 framing from `MMT-ADR-0002` (as rephrased 2026-06-04) |

---

## Group L — Counsel parameters

### L1 — retention periods on the three `person_retain` tables

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| `consent_receipt` retention | The minimum retention for a consent receipt (proof of lawful basis) | GDPR Art 5(1)(c) + Art 5(2) + Art 7(1) + EDPB Guidelines 05/2020 §7.1; COPPA §312.10 (retention / deletion duty); UK ICO Children's Code Annex C |
| `deletion_audit` retention | The minimum retention for an audit record of an authorised deletion | GDPR Art 5(2) (accountability) + Art 30 (records of processing); COPPA §312.10; UK ICO guidance on accountability |
| `financial_record` retention | The minimum retention for per-person financial references, as the Art 28 processor | GDPR Art 28(3) (processor obligations) + per-jurisdiction tax retention (Norway *bokføringsloven*; EU Member State VAT rules; US IRS retention; UK HMRC rules) |

### L2 — dormancy period + notice length

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| Dormancy threshold | None (operational); but the *consequence* of the threshold (the eventual deletion) must align with `I-C3` | `I-C3` counsel ruling from 2026-06-03; UX-resilience rules in the project's `CLAUDE.md` |
| Notice length + surface | `I-C3` ruling (which carved out the parameters for this session); COPPA §312.10 (the "reasonable steps to delete" duty) + per-jurisdiction notice rules | `I-C3`; COPPA §312.10; GDPR Art 12(1) + Art 25 (transparency / data minimisation) |

### L3 — moved-country grace window

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| Grace length | The `I-E3` counsel ruling parameterised the value | `I-E3`; GDPR Art 5(1)(c) + Art 25 (data minimisation); per-jurisdiction notice rules |

### L4 — boundary-crossing verification method

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| Under-13 exit (COPPA) | The COPPA enumerated methods (16 CFR §312.5(b)) + the Art 5(1)(c) minimisation floor (Art 5(1)(c) caps over-assurance) | COPPA 16 CFR §312.5(b)(1)/(b)(2)(i)–(ix) + FR 2025-05904 (2025 separate per-purpose VPC) + EDPB Statement 1/2025 + Art 5(1)(c) |
| 13–16 EU national-digital-consent-age crossing | The `I-PB-B2b` direction-aware ruling + the "reasonable efforts" standard | `I-PB-B2b`; GDPR Art 8(2) + Recital 38 + EDPB Guidelines 05/2020 §7.1 |
| 17→18 (adult-onset) | The `I-PB-B2b` "genuine adult clears in one step" + Art 16 (right to rectification) | `I-PB-B2b`; GDPR Art 16 + Art 5(1)(d) |
| The G7 vendor requirement that emerges | (procurement, not legal) | FedRAMP / SOC 2 type II baseline; COPPA enumerated methods; Art 28 DPA terms |

### L5 — co-guardian one-of/all-of rule

| Sub-question | What needs a citation | Likely sources |
|---|---|---|
| The uniform-or-per-operation rule | The jurisdiction's doctrine on parental authority in digital contexts | Norway *vergemålsloven* §9 + *foreldreansvaret* (the Children Act) §38; UK Children Act 1989 §2(7) ("parental responsibility"); US state law on joint custody + COPPA (a single VPC from "the parent" suffices if the parent is the one who is verified) |
| The default in the absence of explicit configuration | The conservative default + the product override path | None — a product call derived from the legal rule |

---

## Notes for the writer (to fill in at session end)

- The register should be **readable in isolation**: each citation should have the full URL + the
  specific article / clause, not just the abbreviation. The 2026-06-03 register is the
  precedent; mirror its shape.
- **Regime splits** are real and should be recorded as such (EU / US / UK + ROW). A bare "GDPR
  Art 5(1)(c)" citation that glosses the per-jurisdiction split is harder to verify than
  "GDPR Art 5(1)(c) (EU); ICO Children's Code std 1 (UK); COPPA §312.5 (US) — each with the
  per-jurisdiction operative rule."
- **Monitors** carry a *draft/guidance* citation, not a settled black-letter one (the 2026-06-03
  register is the precedent). If today's session produces a Monitor, cite the consultation /
  guidance / draft instrument and flag the unsettled status.
- **No "11" / store-label citations are needed for the floor itself** (it's a product call); the
  *constraint* on the floor (that it must align with the store posture, per `I-PB-B1`) is
  covered by the 2026-06-03 register.
- **The G7 vendor requirement** is captured as a *handoff* to procurement, not as a legal
  citation. The legal citations that *shape* the requirement are the L4 ones above.
