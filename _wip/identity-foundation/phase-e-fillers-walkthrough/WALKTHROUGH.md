# Phase-E fillers Walkthrough — the script  *(read `BRIEFING-PACKET.md` first)*

Two segments, one per group. Each runs the loop: **frame → ask → capture → play back to the PM.**
**[Bracketed italics]** are stage directions to you, the facilitator — not spoken. This is **not** a
teaching session: counsel is the expert on legal questions, the PM is the expert on product calls.
Your job is to **frame the situation + state what's already locked**, **put the precise question**,
**capture the answer as Rule / Parameter / Monitor / Product call**, and **play it back in plain
English so the PM stays oriented**.

**Language rule (from the packet):** speak precisely for counsel — legalese is welcome where it
removes ambiguity — but **gloss a deep, specific term once, inline**, so the PM never loses the
thread (*"…directed-to-children — COPPA's designation, once you serve under-13s knowingly, the rules
intensify and don't allow most ad-tech"*). Do **not** gloss general legal English (consent, erasure,
retention, disclosure, liability). Never dumb down the substance.

**Order — Group P leads, on purpose.** The "11" + store-posture call is the product call that gates
the rest. Without it, the legal-parameter answers (L1–L5) are sized to the wrong audience (we'd
provision for an under-13 / directed-to-children VPC chain if the floor ends up at 11; we'd
provision for a lighter, mostly-teen-assumption chain if the floor ends up at 16 or 18). Lock P1
first; the rest calibrate.

**The capture verbs:**
- **Rule** — a binding legal answer we build to.
- **Parameter** — a value or threshold (a retention period, a grace window, an assurance level).
- **Monitor** — unsettled; record current posture + the trigger to revisit.
- **Product call** — a PM-owned decision; rationale + implications + undo cost + monitor; no
  `basis:` required.

Every question leaves with one — **plus a `basis:` citation for legal answers** (e.g. *GDPR Art 8
/ COPPA §312.5 / UK Children's Code std 5 / AI Act Art 5*). A bare yes/no is not a captured answer:
a **Rule** needs the provision **+ one line of reasoning**; a **Parameter** needs the governing
provision; a **Monitor** needs the **draft/guidance** instrument it's tracking. Counsel is told
this up front, at the open.

**The two architecture ripples to watch (zero expected in this session):** the `inv 17`
rephrase + `MMT-ADR-0002` "via RevenueCat" correction are **already ratified (2026-06-04)** — the
architect track is fully closed. The only live architect-class concern is a new
consent/payment/access split (if counsel's answer introduces a new structural axis). If the
PM's age-floor or store-label call lands in a place that *newly* makes some locked canon wrong,
flag; otherwise no architect ripple expected. The G7 VPC vendor pick is on the procurement
track (post-legal), not the architect track.
is relitigated in the room.

---

## Open the session · ~2 min

> "Two facts set the scene. **One:** the data model is locked. The 8 tables + the structural
> `person_retain` set are ratified; the clean baseline is the cut. The shape is done. **Two:**
> today's session is the *follow-up* to the 2026-06-03 counsel walkthrough. The 16 structural
> questions are ruled; what's left are the *values* and the *product calls* the rulings left as
> seams. We'll do them in two groups — **P** first (3 product calls; the "11" floor + the
> joining-teen disclosure + the Family-Sharing Payer), then **L** (5 legal parameters; retention
> periods, dormancy, moved-country grace, boundary verification, the co-guardian rule). Eight
> questions total — appropriate to the scope, which is *values* not *design*."

> *[Briefly remind: the rule-of-grounding for counsel answers; the four capture verbs; the
> product-call format (rationale + implications + undo cost + monitor). The PM's 2026-06-03
> walkthrough of the *same packet format* was clean — no need to re-explain mechanics.]*

---

## Segment 1 — Group P (product calls)  *(front-loaded — P1 gates the rest)*

### Frame · ~2 min

> "We start with **six product calls** in Group P. P1–P4 are the four coupled age-rating
> questions: the '11' age floor (P1); the store label we aim for — the IARC / App Store / Play
> Store band (P2); the additional-requirements question that the low-age label carries (P3);
> and the Kids-Category / Designed-for-Families posture (P4). P5 is the joining-teen
> disclosure + grace (option B from `MMT-ADR-0010` needs a 5-point warning copy + a grace
> length). P6 is the Family-Sharing Payer attribution (which Person gets recorded as the
> `payer_person_id` when a child on a parent's family store account buys a thing through us).
> The data model is *age-complete*; it supports very young users even if the *signup* floor
> ends up higher. So the questions are about the *product posture and the store-program
> commitment* — not the schema. Once we know the age-floor / store-label / program posture
> (P1–P4), the legal parameters in Group L can be sized correctly."

### Ask — run in order; P1–P4 are a coupled set, P5 + P6 follow

---

**P1 — The "11" age floor: keep, raise, or lower.  `[Product call]`**

> "The strictly-11+ signup floor is in code today — `birthYearSchema` in
> `packages/schemas/src/profiles.ts:38-50`, tag `CR-2026-05-19-H11`. The 2026-06-03 counsel ruling
> said: **no legal usage floor**, but if we keep one, we have to *document* the rationale in the
> same change we ship (the UK Crime & Policing Act 2026 likely makes the written record a
> statutory expectation). The schema is *age-complete* — it supports very young users even if
> the *signup* floor ends up higher — so the question is about the *product posture*, not the
> schema. The floor **must be consistent** with the store label (P2) and the Kids-Category
> posture (P4) — they move together or the App Store review catches the mismatch."

> "**The precise question:** keep at 11, raise it, or lower it?"

> *[Capture: the Product call — the floor value + the rationale + the implications (legal,
> store-program, UX, build) + the undo cost + the monitor. Counsel reviews; the architect
> doesn't see this question unless the answer newly makes `inv 17` wrong — and `inv 17` was
> rephrased 2026-06-04 to be mechanics-only, so the floor is independent of it.]*"

---

**P2 — The store label we aim for (Apple App Store / Google Play / IARC questionnaire).  `[Product call]`**

> "The App Store and Google Play don't *take* a 'minimum age' from the developer directly —
> they **derive a content rating from the IARC questionnaire** (International Age Rating
> Coalition — the unified questionnaire used by Apple and Google that maps to PEGI in the EU,
> ESRB in the US, ACB in Australia, etc.). The relevant bands, in plain English:
>
> | IARC / store band | What it means | Eligibility under device-level parental controls |
> |---|---|---|
> | **4+** (Apple) / **E** (ESRB) / **3** (PEGI) | No objectionable content. | Visible to all ages; no download gate. |
> | **9+** (Apple) / **E10+** (ESRB) / **7** (PEGI) | Mild non-realistic violence, mild scary content. | Parental controls may block for under-9s. |
> | **12+** (Apple) / **T** (ESRB) / **12** (PEGI) | Mild realistic violence, mild suggestive themes. | Parental controls may block for under-12s. |
> | **17+** (Apple) / **M** (ESRB) / **16 or 18** (PEGI) | Realistic violence, sexual content, gambling references. | Parental controls may block for under-17s / under-18s. |
>
> A learning-tutor app with no violence / no sexual content / no gambling *can* legitimately
> rate **4+** (the most permissive band — "nothing here a parent would object to for a
> 4-year-old"). The trade-off: a 4+ label is honest for the *current* product, but it
> *commits* the app to *never* including content the band would exclude — which constrains
> future product moves. A 9+ or 12+ label gives more product headroom at a small device-level
> gate."

> "**The precise question:** which band do we aim for? **Recommendation: start at 4+** as the
> honest band for the current product, **with a documented intent to revisit** if the product
> surface grows."

> *[Capture: the Product call — the band + the rationale + the implications (UX, product
> headroom, device-level gate) + the undo cost (a band change triggers an App Store review)
> + the monitor.]*"

---

**P3 — Does a low-age label carry additional requirements?  `[Product call (PM) + Rule (counsel)]`**

> "**The honest answer:** yes, materially. The *App Store label* and the *Play Store label*
> are advisory and gate device-level parental controls, but the **store-program commitments
> layered on top are the hard rules**:
>
> | Program | Triggered when… | What it adds |
> |---|---|---|
> | **Apple Kids Category** (the standalone, gated-by-Apple section of the App Store) | We *opt in*. | No third-party ad tracking, no out-of-app purchases without IAP, no external links without a parental gate, no data collection without VPC, Apple review. |
> | **Google Designed for Families** (the equivalent) | We *opt in*. | No ad targeting using age/gender/interests of minors, no IAP without parental gate, COPPA + GDPR-K compliance for under-13s in the US, app must be teacher-/parent-recommended. |
> | **COPPA "directed to children"** | We **knowingly serve under-13s** — *regardless of program opt-in*. | COPPA's full obligations: VPC for any data collection, no behavioural ad tracking, written security program, §312.10 retention/deletion duty, a contact for COPPA inquiries. **Mandatory and non-optional** once we serve under-13s. |
> | **EU/UK digital-consent age** (13 in many states, 16 in others) | We serve a user below their national digital-consent age. | Lighter than COPPA — "reasonable efforts" not enumerated VPC — but still gates the LLM disclosure (per `I-PB-B2a`). |
> | **App Store Accountability Acts** (state laws, US) | We serve under-18s in a covered state. | A separate parental-consent duty for the *developer* (TX SB 2420, UT SB 142, LA 2025 — all currently enjoined/delayed as of 2026-06-03, but live in some form). |
>
> The key insight for the PM: **the store label (P2) is the content-rating dial; the store
> program (P4) is the *commitment* dial.** They are independent. A 4+ label doesn't force us
> into Kids Category; a 4+ label *combined with* a Kids-Category opt-in does force a stricter
> content posture. The combination of (label, program) is the matrix we choose from. The
> signup floor (P1) sets the *legal* minimum age; the store label (P2) sets the *visible*
> content-rating; the program (P4) sets the *commitment*."

> "**The precise question (two parts):** *(a) Are we aiming for a specific label?* (this is the
> P2 call, restated for context). *(b) If yes, will that label, if the age group is low, carry
> additional requirements?* (this is the P3 call — the table above is the *yes* answer; the
> question the session must capture is the per-row *applicability* answer)."

> "Counsel: which of the five programs above *apply* to the PM's chosen band (Rules, with
> `basis:`). What the PM decides: whether to *opt in* to the opt-in programs (Kids Category,
> Designed for Families) — that's P4."

> *[Capture: per-program applicability rules (counsel) + a per-program opt-in decision (PM).]*

---

**P4 — The Kids-Category / Designed-for-Families posture (opt in, or stay out).  `[Product call]`**

> "**The precise question:** do we self-certify into Apple Kids Category / Google Designed for
> Families (visibility + commitment), or stay out?"

> "**The crucial caveat:** **staying out of Kids Category does not exempt us from COPPA's
> 'directed to children' obligations** if we knowingly serve under-13s. The choice is about
> *visibility* (kids see the app in the Kids Category) and *commitment depth* (the program
> imposes stricter rules), **not** about avoiding the underlying law."

> *[Capture: the Product call — the posture + the implications (visibility, store-program
> commitment, review overhead) + the undo cost (re-review on a posture change) + the monitor.]*

---

**The matrix the PM chooses from (P1 floor × P2 label × P4 program):**

  | Floor (P1) | Label (P2) | Kids Cat (P4) | Obligations (P3 + the wider regime set) |
  |---|---|---|---|
  | 11+ | 4+ | In | Strictest. COPPA + Kids-Category + IARC 4+ content lock. |
  | 11+ | 4+ | Out | COPPA "directed to children" still applies. VPC chain mandatory; the 4+ content lock binds. |
  | 11+ | 9+ or 12+ | Out | COPPA still applies; the label gives product headroom but doesn't reduce the COPPA chain. |
  | 13+ | 4+ | Out | Out of COPPA's under-13 band; EU/UK per-jurisdiction rules apply, lighter. 4+ still the honest band. |
  | 13+ | 12+ | Out | Same; 12+ more honest for an adolescent audience. |
  | 16+ or 18+ | 12+ or 17+ | Out | Largely out of minors-data territory; AI-Act Annex III 3(b) still applies but the consent chain is light. |

---


---

**P5 — The joining-teen double-charge disclosure + grace  `[Product call + Parameter]`**

> "When a teen with an active store subscription joins a family org — option B, per
> `MMT-ADR-0010` — they join *immediately* (covered by the family quota), *and* they keep paying
> their own store sub until they self-cancel. Store-delegated billing rules out a server-side
> refund, so this is the honest path. The 2026-06-03 counsel ruling conditioned this on a
> *specific 5-point disclosure warning + a follow-up grace window before the next charge*. Two
> things for the PM:
>
> 1. **The disclosure copy** — the 5-point warning (it covers: 'you'll be charged twice until
>    you cancel your own sub,' 'the family plan covers your seat,' 'how to cancel your sub,'
>    'who can see the charge,' and the dispute path). Where does it surface, and when does it
>    re-appear as a nudge?
> 2. **The grace length** — between the disclosure and the *next* charge on the teen's existing
>    sub, how long is the window for them to cancel without further disclosure? (The next charge
>    happens at the existing sub's renewal, not the family sub's.)
>
> Counsel: confirm whether the disclosure shape satisfies the consumer-protection duty under
> `I-E4` (the conditioning on the option-B ruling) and any per-jurisdiction *cooling-off* or
> *double-charge-disclosure* rules (Norway *angrerettloven* §22n, EU CRD 2011/83 Art 16(m), UK
> CRA 2015 Pt 2)."

> *[Capture: a Product call (the disclosure copy + surface) and a Parameter (the grace length,
> with `basis:`).]*

---

**P6 — The `payer_person_id` value under Family Sharing / Apple Ask-to-Buy  `[Rule or Parameter]`**

> "The `subscription.payer_person_id` column is in place. It's access-inert — a recorded
> attribution, not a permissions grant — so a stale or surprising value can't become a security
> problem (worst case is a wrong name on a billing screen, recoverable by re-sync). The
> precise question: when a purchase completes under **Family Sharing** (the *purchaser* is the
> family organiser — the parent — but the *user* may be a child), or under **Apple Ask-to-Buy**
> (the parent approves a child's initiated purchase), which Person do we record as the Payer?
>
> The data-model note (`data-model.md` §7) flagged this as a counsel call, not a security
> boundary (`MMT-ADR-0002`). Counsel: is the recorded Payer the *store-account-holder* (the
> parent — the person whose Apple/Google account paid) or the *app-account-holder* (the
> child, if any — the Person in the family org the purchase is attributed to)?"

> *[Capture: a Rule per regime (EU / US / UK), or a Parameter (a default + an exception). Carries
> `basis:`. If a regime-by-regime split, cite each.]*

---

### Capture + play back · ~5 min

> *[Walk back through P1–P6 in plain English for the PM. Confirm each before moving to
> Group L. P1–P4 are the four coupled age-rating product calls; the matrix in P4 is the
> visual anchor. The P6 per-regime split, if any, is the place to surface "we have N values,
> not one" so the implementation work knows the config surface.]*

> "Product calls locked. P1 — the age floor is **[N]**, rationale **[…]**. P2 — the store
> label is **[band]**, with a documented intent to revisit **[if / when]** the product surface
> changes. P3 — the per-program applicability is **[Kids Cat: yes/no, Designed for Families:
> yes/no, COPPA directed-to-children: yes/no, EU/UK digital-consent-age: yes/no, App Store
> Accountability Acts: yes/no]**. P4 — the posture is **[opt in / stay out]**. P5 — the
> disclosure is **[copy + surface]**, grace is **[N days]**. P6 — the Payer is
> **[default + per-regime exception if any]**. Now the legal parameters — these are sized to
> the P1–P4 audience, so the 5 L questions come next."

---

## Segment 2 — Group L (counsel parameters)

### Frame · ~2 min

> "Five legal parameters, all sized to the age-floor call from P1. The seams the schema designed
> are: the `retention_period` on the three `person_retain` tables (L1); the dormancy threshold +
> notice length on the unified daily sweep (L2); the moved-country grace window (L3); the
> boundary-crossing verification method for protection-lowering birth-year changes (L4, which
> feeds the G7 procurement spec); and the E4 one-of/all-of rule for co-guardians (L5). Each is a
> `Rule` or `Parameter`; each carries a `basis:`. Some answers will differ by regime; the
> per-jurisdiction split is real and the implementation needs it."

### Ask — run in order

---

**L1 — Retention periods on the three `person_retain` tables  `[Parameters]`**

> "The `retention_period` columns on `consent_receipt`, `deletion_audit`, and `financial_record`
> are seams. Counsel: the minimum retention is the legal floor; the PM may opt up for product
> reasons (an audit trail is useful past the legal floor). Three precise questions:
>
> 1. **`consent_receipt`** — the *receipt* of a granted / withdrawn consent (the proof it was
>    given, not the means to re-verify). How long must this survive the deletion that triggers
>    the re-home? (The `I-C1` floor is the structural obligation; the *period* is the
>    parameter.)
> 2. **`deletion_audit`** — the *audit fact* of a deletion (who requested, when, the prior
>    value of `birth_date` + `residence_jurisdiction` + `last_activity_at`, the `deleted_by`
>    field). How long must this survive?
> 3. **`financial_record`** — the per-person financial references we keep as the Art 28
>    processor (`MMT-ADR-0002`). Some jurisdictions require the processor to retain transaction
>    refs for N years independent of the merchant of record. What's the minimum?"

> *[Capture: three Parameters, each with `basis:`. Per-jurisdiction splits are real here; cite
> each. The PM may *opt up* — capture that as a separate note ("PM opted to Y years for
> product/audit reasons, legal floor is X").]*

---

**L2 — Dormancy period + pre-deletion notice length  `[Parameters + possible Rule on notice surface]`**

> "The unified daily sweep reads `person.last_activity_at`; the `I-C3` consumer fires on a
> threshold. Two precise questions:
>
> 1. **Dormancy threshold** — how long after `last_activity_at` is a person considered dormant?
>    (This sets when the notice starts.)
> 2. **Pre-deletion notice length** — how long between the notice and the actual deletion (the
>    user's last chance to come back)?
>
> Plus, on the notice surface: is email enough, or does in-app notification also fire? (The
> inactive user is the one most likely to miss an in-app nudge — this is a real product
> tension with the legal duty.)"

> *[Capture: two Parameters (threshold + notice length), each with `basis:`. A possible Rule
> on the notice surface if counsel distinguishes by regime or by the user's age band.]*

---

**L3 — Moved-country grace window  `[Parameter]`**

> "When `residence_jurisdiction` changes, the sweep's grace consumer fires; at the end of the
> grace, the user is moved to `suspend-to-browse-preview` (per the E2 product ruling) until
> they re-affirm consents under the new jurisdiction. The *length* of the grace is the
> parameter. Counsel: how long is sufficient for the user to re-affirm, given that the
> jurisdictions with the *largest* deltas in consent treatment are the ones a user is most
> likely to need time to read the new disclosures?"

> *[Capture: a Parameter (the length) with `basis:`. Per-regime split if any (e.g. UK Crime &
> Policing Act 2026 may dictate differently in UK).]*

---

**L4 — Boundary-crossing verification method  `[Parameter per crossing, feeds G7]`**

> "When a birth-year change would *lower* protection, the `I-PB-B2b` direction-aware gate
> requires re-verification, with the more-protective state persisting until it clears. Three
> protection-lowering crossings to consider, each can have a different proportionate
> verification method:
>
> 1. **Out of under-13** (the COPPA-exit crossing — the most consequential).
> 2. **Across 13–16** (the EU national-digital-consent-age range).
> 3. **17→18** (the adult-onset crossing).
>
> The 2026-06-03 ruling said the verification is 'proportionate to the line crossed'; the
> *method* (payment-card, gov-ID, vendor-attested, knowledge-based, etc.) is the parameter.
> This shapes the **G7** VPC-vendor procurement spec, so the answer here is the *requirement*
> the vendor has to meet. A 17→18 crossing is unlikely to need the same rigour as a
> under-13 exit."

> *[Capture: a Parameter per crossing (or a Rule if the method is settled by jurisdiction),
> each with `basis:`. Note in the capture: "feeds G7 vendor procurement."]*

---

**L5 — The E4 one-of/all-of rule for co-guardians  `[Rule]`**

> "When a child has *two* guardians (separated parents, blended families), does the consent of
> *one* guardian suffice (one-of), or must *both* consent (all-of), for the consent-bearing
> operations? Counsel: is the rule uniform, or does it vary by the operation (data-disclosure
> change, marketing opt-in, age-related consent re-affirmation, deletion request)? What is
> the default in the absence of explicit configuration?"

> *[Capture: a Rule with `basis:`. Per-operation split if any. The PM validates against the
> product envelope; the per-operation answer is what the consent UI surfaces ("this requires
> both guardians," vs. "either guardian can approve this").]*

---

### Capture + play back · ~5 min

> *[Walk back through L1–L5 in plain English for the PM. The per-jurisdiction splits are the
> thing to surface clearly — "in EU, retention is X; in US, Y; in UK, Z; the schema records
> per-row so the implementation doesn't have to know the regime."]*

> "Legal parameters locked. L1 retention: consent-receipt **[N]**, deletion-audit **[N]**,
> financial-record **[N]**; PM opted to **[N]** where applicable. L2 dormancy: threshold
> **[N]**, notice length **[N]**, notice surface **[email / in-app / both]**. L3 moved-country
> grace: **[N]**. L4 boundary verification: under-13 exit **[method]**, 13–16 crossing
> **[method]**, 17→18 crossing **[method]**; G7 procurement spec updated. L5 co-guardian rule:
> **[one-of / all-of / per-op split]**, default **[…]**."

---

## Closing · ~5 min

> *[Now: handoff capture. Two places to flag:]*
>
> 1. **Architect ripples (zero expected):** the `inv 17` rephrase + `MMT-ADR-0002` "via
>    RevenueCat" correction are **already ratified (2026-06-04)** — the architect track is
>    fully closed. The only live architect-class concern is a new consent/payment/access split
>    if counsel's answer introduces a new structural axis. (Likely no — the values fit the
>    seams the schema designed.) Flag if any.
> 2. **Phase F ripples:** is there a parameter that changes the *shape* of a migration step
>    (a new computed column, a new event-row sub-type)? Flag for Phase F; the parameter
>    *value* is captured but the schema doesn't change.
> 3. **G7 / procurement ripples:** L4's verification-method answers are G7 requirements. The
>    handoff doc carries them.
>
> *[Now: the handoff doc.]* Write
> `_wip/identity-foundation/_handoffs/2026-MM-DD-phase-e-fillers-complete.md` following the
> 2026-06-03 pattern (where everything lives + flags for the architect + transitive next
> steps + monitors + the code-verification log of what was checked in source).

> *[Now: the PRD Part 10 §I ledger entries.]* Real-time if the room has a screen; otherwise
> the PM types them up afterward (the 2026-06-03 session did the latter). The recommended
> numbering is `I-P1` / `I-P2` / `I-P3` / `I-P4` / `I-P5` / `I-P6` for Group P and `I-L1`
> through `I-L5` for Group L (or a more readable variant if the PM prefers; pick at session
> start).

> "That's the session. Nine decisions locked; the seams are filled; the data model stands;
> the schema reads the values from the columns, not from hard-coded constants. Phase F is
> unblocked once the G7 procurement requirements are issued. Anything we missed?"

> *[Hold the floor for 60 seconds. End the session when the PM confirms.]*
