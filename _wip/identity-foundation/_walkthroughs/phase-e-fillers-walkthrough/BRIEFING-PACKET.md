# Briefing Packet — Phase-E fillers walkthrough  *(read before the session)*

This packet briefs a **PM + legal counsel** working session for the **Phase-E fillers** — the
product and legal decisions that remained as **seams** (unresolved values) when the data model
(`data-model.md`, MMT-ADR-0011) and the cut strategy (MMT-ADR-0012) were ratified on 2026-06-04. In
the room: the **PM** (owns product intent; decides product calls) and **legal counsel** (rules on the
law; fills the value-seams where they require a legal answer). The **architect is not in the room** —
the `inv 17` rephrase from `I-PB-B3a` and the G7 VPC vendor pick are already on the architect /
procurement tracks and do not need to be relitigated here. If a counsel answer triggers a new
architectural ripple, we **flag it and take it to the architect afterward**.

The companion `WALKTHROUGH.md` is the session script. This packet is the **shared context** both
people read first, and the **factual record** counsel needs to answer accurately.

**How this packet is pitched (the language rule):** written for counsel — precise, and legalese is
welcome where it removes ambiguity. Deep, specific terms are **glossed inline in one parenthetical** so
the PM never loses the thread — e.g. *App-Store Declared Age Range (the age band a parent sets on
device-level family-controls)*. General legal English (consent, liability, retention, erasure,
disclosure, grace period) is **not** glossed — the PM follows it fine. We do not simplify the
substance, only the few terms that are genuinely insider.

---

## 0. What we need out of this session

Eight decisions in two groups (§3). For each, counsel or the PM gives one of:

- **Rule** — a binding legal answer we can build to (permissible / not / required-conditions).
- **Parameter** — a legal value or threshold (a retention period, a grace window, an assurance
  level).
- **Monitor** — "not settled in law yet; here's the current posture; revisit on a trigger."
- **Product call** — a PM-owned decision; captures the rationale + the implications (legal, UX,
  store-program), no `basis:` required but the rationale should be defensible as the product
  equivalent.

**Every legal answer must be grounded — `basis:` is mandatory, not optional.** A bare yes/no is
unusable: each outcome carries a **`basis:` citation to the governing provision** (e.g. *GDPR Art 8*,
*COPPA §312.5*, *UK Children's Code std 5*, *AI Act Art 5 / Annex III 3(b)*), so it is auditable,
reusable in the DPIA, and re-checkable when the law changes. Depth scales with the answer type: a
**Rule** cites the provision **+ one line of reasoning**; a **Parameter** cites the governing provision;
a **Monitor** cites the **draft/guidance** instrument and flags it is not yet black-letter (the
honest case where no settled citation exists — Ofcom, AI-Act application). Where an answer spans
regimes, cite each (EU/US/UK).

**Product calls** carry:
- the **rationale** (the product, safeguarding-capacity, or store-rating reason),
- the **implications** (legal-disclosure impact, store-program commitment, UX impact, build impact),
- the **undo cost** (how hard is this to reverse if the product call turns out to be wrong),
- the **monitor** (what signal would tell us to revisit).

**Verification-by-completion is mandatory.** The 2026-06-03 counsel session found 2 of 7 load-bearing
code premises false (routing keystone, PII inventory) — both forced re-work in the DPIA. The same
discipline applies here: where the answer is a value, verify the *value* is in fact unsized in the
current code (not silently set somewhere we missed). Where the answer is a product call, verify the
current behaviour (e.g. the "11" floor is in `birthYearSchema` at
`packages/schemas/src/profiles.ts:38-50`, tag `CR-2026-05-19-H11` — *not* a store rating, *not* a
declared age range; the "11" is our own Zod signup rule).

---

## 1. The data model is locked — these are the seams, not the structure

The Phase-E data model is ratified. **You do not redesign it in this session.** You fill values into
the seams. The seams are:

- **`person.birth_date`** (already in the schema; the *value* is user-entered per the Phase-E
  decision, but the *age at which we treat someone as a child* for the LLM-disclosure consent gate
  is a per-jurisdiction parameter that lives in config, not in the schema).
- **`person.residence_jurisdiction`** (already in the schema; the *value* is user-declared with
  signal-prefill per Phase-E; the *jurisdictional rules* are the value, not the column).
- **`consent_grant.assurance_token` + `assurance_method`** (already in the schema; the *method* is
  the value — payment card, gov ID, vendor-attested — chosen by procurement + counsel, not us).
- **`consent_receipt.retention_period`**, **`deletion_audit.retention_period`**,
  **`financial_record.retention_period`** (all three columns are seams; counsel fills the values;
  the schema records them so a future re-derivation doesn't lose them).
- **`person.last_activity_at` → dormancy threshold** (the column is in place; the *threshold value*
  is the parameter).
- **`person.residence_jurisdiction` → moved-country grace length** (the column is in place; the
  *grace value* is the parameter).
- **The signup floor** (today `11`, in code; the *floor* is the product call).

The session's job is to **fill those values** and to **lock the product call** that gates the rest.

---

## 2. What the 2026-06-03 counsel walkthrough settled (don't reopen)

The 2026-06-03 session ruled on 16 questions plus the DPIA wrapper; the system of record is **PRD Part
10 §I** (e.g. `I-C1`, `I-PB-B1`, `I-PB-B2a`, `I-PB-B2b`, `I-PB-B3a`, `I-A2`, `I-D1`, `I-E3`, `I-E4`).
The structural findings ride today; you capture the *values* into the provisions the prior session
cited. The full sources register is in `counsel-walkthrough/SOURCES.md`. The findings most likely to
be invoked today:

- **`I-PB-B1`** — no legal usage floor; the "11" is a product / store-rating call. *"Removing '11'
  without the documented rationale + store-rating alignment is itself the cure-worse-than-disease
  path and may breach the UK written-record duty."*
- **`I-PB-B2a`** — disclosure-grade VPC; the *method* is the parameter; the *vendor* is procurement.
- **`I-PB-B2b`** — direction-aware birth gate; the *re-verification method* for protection-lowering
  is the parameter (ties to G7 vendor pick).
- **`I-A2`** — recorded `lawful_basis`; the *value* (VPC / Art 8(2) / Art 6(1)(a) / contract) is the
  product + counsel call per flow.
- **`I-D1`** — org-scoped consent from day one; no `controller_role` column today; the cross-org
  feature is the gated addition.
- **`I-E3`** — moved-country grace window; the *length* is the parameter.
- **`I-E4`** — minor double-billing disclosure + grace; the *copy* and the *grace length* are the
  product + counsel pair.
- **`I-C1`** — consent receipt survives deletion; the *retention period* is the parameter.
- **`I-C3`** — inactivity-deletion notice + window; the *dormancy period* and *notice length* are
  the parameters.

The 2026-06-03 handoff (`_handoffs/2026-06-03-counsel-walkthrough-complete.md`) is the routing doc
for what landed where and what's still open.

---

## 3. The 9 questions, in 2 groups

### Group P — Product calls (PM decides; counsel on implications)

**P1 — the "11" age-floor: keep, raise, or lower.**  `[Product call]`
- **State today:** the Zod `birthYearSchema` (`packages/schemas/src/profiles.ts:38-50`, tag
  `CR-2026-05-19-H11`) rejects any birth year that would compute to age < 11. The "11" is a product /
  store-rating choice, not a legal line (`I-PB-B1`).
- **The precise question:** keep at 11, raise it, or lower it?
- **The constraint from `I-PB-B1`:** *if* the floor is kept or changed, the **documented
  rationale** (product + safeguarding-capacity + store-rating basis) must ship in the same
  change (the UK Crime & Policing Act 2026 likely makes that written record a statutory
  expectation).
- **What the PM owns:** the floor value + the rationale + the implications + the undo cost +
  the monitor. Counsel reviews; the architect doesn't see this question unless the answer
  *newly* makes `inv 17` wrong (it shouldn't — `inv 17` was rephrased 2026-06-04 to be
  mechanics-only, so the floor is independent of it).
- **Output:** a Product call with the new floor (or "keep 11") and a written rationale.

**P2 — the store label we aim for (Apple App Store / Google Play / IARC questionnaire).**  `[Product call]`
- **The honest framing:** the App Store and Google Play don't *take* a 'minimum age' from the
  developer directly — they **derive a content rating from the IARC questionnaire** (the
  unified questionnaire used by Apple and Google that maps to PEGI in the EU, ESRB in the US,
  ACB in Australia, etc.). The relevant bands, in plain English:
  - **4+** (Apple) / **E** (ESRB) / **3** (PEGI): no objectionable content. Visible to all
    ages; no download gate.
  - **9+** (Apple) / **E10+** (ESRB) / **7** (PEGI): mild non-realistic violence, mild scary
    content. Parental controls may block for under-9s.
  - **12+** (Apple) / **T** (ESRB) / **12** (PEGI): mild realistic violence, mild suggestive
    themes. Parental controls may block for under-12s.
  - **17+** (Apple) / **M** (ESRB) / **16 or 18** (PEGI): realistic violence, sexual content,
    gambling references. Parental controls may block for under-17s / under-18s.
- **The precise question:** which band do we aim for? A learning-tutor app with no violence /
  no sexual content / no gambling *can* legitimately rate **4+** (the most permissive band —
  "nothing here a parent would object to for a 4-year-old"). The trade-off: a 4+ label is honest
  for the *current* product, but it *commits* the app to *never* including content the band
  would exclude. A 9+ or 12+ label gives more product headroom at a small device-level gate.
- **What the PM owns:** the band choice + the rationale + the implications (UX, product
  headroom, device-level gate) + the undo cost (a band change triggers an App Store review).
- **Output:** a Product call with the band and the rationale.

**P3 — does a low-age label carry additional requirements?**  `[Product call (PM) + Rule (counsel)]`
- **The honest answer:** yes, materially. The *App Store label* and the *Play Store label* are
  advisory and gate device-level parental controls, but the **store-program commitments layered
  on top are the hard rules**:
  - **Apple Kids Category** (the standalone, gated-by-Apple section of the App Store) — opt-in;
    adds: no third-party ad tracking, no out-of-app purchases without IAP, no external links
    without a parental gate, no data collection without VPC, Apple review.
  - **Google Designed for Families** — opt-in; similar: no ad targeting using
    age/gender/interests of minors, no IAP without parental gate, COPPA + GDPR-K compliance
    for under-13s in the US, app must be teacher-/parent-recommended.
  - **COPPA "directed to children"** — *triggered by knowingly serving under-13s*,
    *regardless of program opt-in*. Mandatory: VPC for any data collection, no behavioural ad
    tracking, written security program, §312.10 retention/deletion duty, a contact for COPPA
    inquiries.
  - **EU/UK digital-consent age** (13 in many states, 16 in others) — lighter than COPPA
    ("reasonable efforts" not enumerated VPC) but still gates the LLM disclosure (per
    `I-PB-B2a`).
  - **App Store Accountability Acts** (state laws, US) — a separate parental-consent duty for
    the *developer* (TX SB 2420, UT SB 142, LA 2025 — currently enjoined/delayed as of
    2026-06-03, but live in some form).
- **The precise question (two parts):**
  - (a) *Are we aiming for a specific label?* (this is the P2 call, restated for context).
  - (b) *If yes, will that label, if the age group is low, carry additional requirements?* (this
    is the P3 call — the table above is the *yes* answer; the question the session must
    capture is the per-row *applicability* answer).
- **What counsel rules on:** which of the five programs above *apply* to the PM's chosen band
  (Rules, with `basis:`). What the PM decides: whether to *opt in* to the opt-in programs
  (Kids Category, Designed for Families) — that's P4.
- **Output:** per-program applicability rules (counsel) + a per-program opt-in decision (PM).

**P4 — the Kids-Category / Designed-for-Families posture (opt in, or stay out).**  `[Product call]`
- **The precise question:** do we self-certify into Apple Kids Category / Google Designed for
  Families (visibility + commitment), or stay out?
- **The crucial caveat:** **staying out of Kids Category does not exempt us from COPPA's
  "directed to children" obligations** if we knowingly serve under-13s. The choice is about
  *visibility* (kids see the app in the Kids Category) and *commitment depth* (the program
  imposes stricter rules), **not** about avoiding the underlying law.
- **What the PM owns:** the posture + the implications (visibility, store-program commitment,
  review overhead) + the undo cost (re-review on a posture change).
- **Output:** a Product call with the posture and the rationale.

**The matrix the PM chooses from (floor × label × program):**

  | Floor (P1) | Label (P2) | Kids Cat (P4) | Obligations (P3 + the wider regime set) |
  |---|---|---|---|
  | 11+ | 4+ | In | Strictest. COPPA + Kids-Category + IARC 4+ content lock. |
  | 11+ | 4+ | Out | COPPA "directed to children" still applies. VPC chain mandatory; the 4+ content lock binds. |
  | 11+ | 9+ or 12+ | Out | COPPA still applies; the label gives product headroom but doesn't reduce the COPPA chain. |
  | 13+ | 4+ | Out | Out of COPPA's under-13 band; EU/UK per-jurisdiction rules apply, lighter. 4+ still the honest band. |
  | 13+ | 12+ | Out | Same; 12+ more honest for an adolescent audience. |
  | 16+ or 18+ | 12+ or 17+ | Out | Largely out of minors-data territory; AI-Act Annex III 3(b) still applies but the consent chain is light. |

**P5 — the joining-teen double-charge disclosure + grace (E4 / `I-E4` conditioning).**  `[Product call + Parameter]`
- **State today:** `MMT-ADR-0010` ruled option B (join-with-disclaimer) — a teen with an active store
  subscription joins the family org immediately, covered by the family quota, *and keeps paying
  their own store sub until they self-cancel*. The `I-E4` counsel ruling conditioned this on a
  *specific disclosure copy + a follow-up grace window*. The disclosure copy is a 5-point warning
  per the counsel handoff.
- **What the PM owns:** the *disclosure copy* (5-point warning shape, where it surfaces, when it
  re-appears as a nudge) + the *grace length* (how long the teen has to cancel before the next
  charge without further disclosure). Counsel rules on whether the disclosure is sufficient.
- **Output:** a Product call (the copy) + a Parameter (the grace length, with `basis:`).

**P6 — the `payer_person_id` value under Family Sharing / Apple Ask-to-Buy (E3).**  `[Rule or Parameter]`
- **State today:** the `subscription.payer_person_id` column is in place; it's access-inert (a
  recorded attribution, not a permissions grant). The Phase-E `data-model.md` §7 left E3 as a
  counsel call: which Person gets recorded as the Payer when a purchase is completed under Family
  Sharing / Apple Ask-to-Buy?
- **The honest question:** in Family Sharing, the *purchaser* is the family organiser; the *user*
  may be a child. The `payer_person_id` is a *billing-attribution* field, not a security boundary
  (`MMT-ADR-0002`; rephrased 2026-06-04). Counsel rules on whether recording the *store-account-
  holder* (the parent) or the *app-account-holder* (the child, if any) is the correct
  attribution, by jurisdiction.
- **Output:** a Rule (per regime) or a Parameter (a default + an exception). Carries `basis:`.

### Group L — Counsel parameters (counsel rules; PM validates UX envelope)

**L1 — retention periods on the three `person_retain` tables** (`I-C1` + the carve-out).
- **State today:** the `retention_period` column exists on each of `consent_receipt`,
  `deletion_audit`, `financial_record`. The values are seams.
- **The precise questions:**
  - **`consent_receipt`:** how long must the *receipt* of a granted/withdrawn consent survive?
    The receipt is a legal-record artifact (proof that consent was given, not the means to re-verify).
  - **`deletion_audit`:** how long must the *audit fact* of a deletion survive (who requested, when,
    the prior value of `birth_date` + `residence_jurisdiction` + `last_activity_at`, the
    `deleted_by` field)? The audit fact is the **proof the deletion was authorised**.
  - **`financial_record`:** how long must the per-person financial references survive (the `MMT-ADR-0002`
    Art 28 processor duty; some jurisdictions require the *processor* to retain transaction refs
    for N years independent of the merchant of record)?
- **Output:** three Parameter answers, each with `basis:`. PM may *opt up* to a longer period for
  product reasons (audit trail is useful past the legal floor) — but the legal floor is the floor.

**L2 — dormancy period + pre-deletion notice length** (`I-C3`).
- **State today:** the unified daily sweep reads `last_activity_at`; the *dormancy threshold* and the
  *pre-deletion notice length* are both seams. The sweep's `I-C3` consumer fires on threshold.
- **The precise questions:**
  - **Dormancy threshold:** how long after `last_activity_at` is a person considered dormant?
  - **Pre-deletion notice length:** how long between the notice and the actual deletion (the
    user's last chance to come back)?
  - **Notice surface:** is email enough, or does in-app notification also fire?
- **Output:** two Parameter answers (the threshold + the notice length), each with `basis:`.
  The notice-surface answer may be a Rule.

**L3 — moved-country grace window** (`I-E3`).
- **State today:** when `residence_jurisdiction` changes, the sweep's grace consumer fires; the
  *length* of the grace is the seam. The product move is to `suspend-to-browse-preview` (per the
  E2 product ruling) at the end of the grace if the user hasn't re-affirmed consents.
- **The precise question:** how long does the user have to re-affirm under the new jurisdiction
  before the suspend-to-browse-preview state fires?
- **Output:** a Parameter (the length) with `basis:`.

**L4 — boundary-crossing verification method** (`I-PB-B2b`, ties to G7).
- **State today:** when a birth-year change would *lower* protection (out of under-13, across 13–16,
  or 17→18), the `I-PB-B2b` direction-aware gate requires re-verification proportional to the line
  crossed, with the more-protective state persisting until it clears. The *method* is the seam;
  the *vendor* is G7.
- **The precise question:** for each of the three protection-lowering crossings, what is the
  proportionate verification method (payment-card, gov-ID, vendor-attested, knowledge-based, etc.)?
  This shapes the G7 vendor requirement.
- **Output:** a Parameter per crossing (or a Rule if the method is settled by jurisdiction), with
  `basis:`. Feeds directly into the G7 procurement spec.

**L5 — the E4 one-of/all-of rule for co-guardians** (`I-E4`).
- **State today:** when a child has *two* guardians (separated parents, blended families, etc.),
  does the consent of *one* guardian suffice (one-of), or must *both* consent (all-of), for the
  consent-bearing operations (data-disclosure change, marketing opt-in, age-related consent
  re-affirmation, deletion request)?
- **The precise question:** is the rule uniform, or does it vary by the operation? What is the
  default in the absence of explicit configuration?
- **Output:** a Rule (the rule) with `basis:`. PM validates against the product envelope
  (one-of is much friendlier for a child living between two homes; all-of is much safer for
  irreversible operations like deletion).

---

## 4. Capture + ledger structure

- **Rule / Parameter / Monitor** answers go to **PRD Part 10 §I**, in the same ledger as the
  2026-06-03 counsel findings. Recommended numbering:
  - `I-P1` / `I-P2` / `I-P3` / `I-P4` / `I-P5` / `I-P6` — Group P (the 4 age-rating product calls
    + the joining-teen disclosure + the `payer_person_id` value; tagged `Product call` for P1–P5,
    `Rule` or `Parameter` for P6).
  - `I-L1` / `I-L2` / `I-L3` / `I-L4` / `I-L5` — Group L (the legal parameters; tagged
    `Rule` / `Parameter` / `Monitor` as appropriate).
  - These continue the existing `I-X` numbering; if a more readable variant is preferred (e.g.
    `I-PHASE-E-1`), the PM picks at session start.
- **Product calls** are tagged `Product call` (not `Rule`) and carry rationale + implications + undo
  cost + monitor, no `basis:`.
- **A brief `Code-Verification Log`** at the end of the session captures which factual premises
  were checked in source (the 2026-06-03 session's V1–V7 audit trail is the precedent). Likely
  entries: the "11" floor location (verified in `birthYearSchema`), the absence of a store-rating
  field, the `payer_person_id` column shape, the `retention_period` columns on the three
  `person_retain` tables, the `last_activity_at` denormalized column, the `residence_jurisdiction`
  column.

---

## 5. What gets flagged to whom

- **Architect ripples (zero expected in this session):** the architect track is **fully closed**
  as of 2026-06-04 — the `inv 17` rephrase + `MMT-ADR-0002` "via RevenueCat" correction are
  ratified (see `_wip/identity-foundation/identity-ontology.md` §R entry dated 2026-06-04).
  The G7 VPC vendor pick is on the procurement track (post-legal), not the architect track. If
  the PM's age-floor or store-label call lands in a place that *newly* makes some locked
  canon wrong, flag; otherwise no architect ripple expected.
- **Phase F ripples:** a parameter that *changes the shape of a migration step* (a new computed
  column, a new event-row sub-type) gets flagged for Phase F but not redesigned here.
- **G7 / procurement ripples:** L4's verification method becomes a G7 requirement. The handoff
  carries the requirement to procurement.

---

## 6. Reading list (read first, in order)

1. `BRIEFING-PACKET.md` (this file) — the shared context.
2. **`_wip/identity-foundation/data-model.md` §1, §4, §6, §7, §8** — the data model + failure
   modes + handoff.
3. **`docs/adr/MMT-ADR-0011-phase-e-data-model-realization.md`** + **`MMT-ADR-0012-one-time-baseline-reset.md`**
   — the ADRs that state the *why* behind the schema.
4. **`_wip/identity-foundation/counsel-walkthrough/SOURCES.md`** — the 2026-06-03 sources register;
   today's parameters ride those provisions.
5. **`_wip/identity-foundation/_handoffs/2026-06-03-counsel-walkthrough-complete.md`** — the
   handoff from the prior session; lists what's still open and what's ruled.
6. **PRD Part 10 §I** — the existing ledger; new entries append.
7. **`packages/schemas/src/profiles.ts:38-50`** — the "11" floor's current home (verify
   `birthYearSchema`).
8. **`WALKTHROUGH.md`** — the session script.

The counsel session runs in **two segments** (Group P first, then Group L), following the
2026-06-03 pattern of front-loading the structural / product items.
