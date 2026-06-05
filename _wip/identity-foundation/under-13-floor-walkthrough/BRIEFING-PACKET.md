# Briefing Packet — Under-13 Floor Walkthrough

> **Participant-facing read.** This is the curated 15–20 minute read for
> the PM and counsel before the live walkthrough. It is the
> *primary input* to the walkthrough, not the full research artefact.
> For the full research, see `SYNTHESIS.md`. For citations, see
> `SOURCES.md`. For the live agenda, see `WALKTHROUGH.md`.
>
> **Audience:** PM (primary) + live legal counsel (informed reader +
> verifier). Plain English throughout; acronyms expanded on first use.

---

## Verification status — read this first

The research behind this walkthrough leaned on the URLs listed in
`SOURCES.md`. Some primary regulator pages (FTC, ICO, EDPB, Datatilsynet,
Apple Developer, Google Play) returned HTTP 403 or 302-redirects when our
research agents fetched them. The URLs are real and authoritative, but
the exact text was not directly confirmed by us.

**This is the worklist for counsel in the room.** Section 5 of
`SYNTHESIS.md` and the "Verification worklist summary" at the bottom of
`SOURCES.md` list the unverified primaries in priority order. The
single most consequential unverified citation is **ICO Children's Code
Annex B** — the design-seam argument in Section 1 below depends on it.
Counsel, please re-verify Annex B against the live ICO document before
the walkthrough concludes; if Annex B does not contain the widely-cited
five-band framing, the design-seam collapses to "no statutory
sub-banding anywhere in scope" (a slightly stronger version of our
Section 1 finding), and the only remaining arguable posture for a
sub-13 floor is the US Layer-5 3b (Section 3 below).

**The synthesis can be read end-to-end on the verified URLs alone.** The
unverified citations support enforcement-signal density but are not
load-bearing for the headline finding.

---

## 1. The headline, in plain English

In the four jurisdictions we care about — the **US, the UK, the EU, and
Norway** — the law does not split children under 13 into sub-categories.
A 12-year-old is treated the same as a 9-year-old for purposes of
consent and data-protection rules. This is *probably* the answer to
the question that opened this exercise ("could we defend a
partial-inclusion floor of 11+ or 9+?"), but it is **not the only
constraint that binds**.

Three other constraints impose their own floors, independent of the
law. And one arguable posture in the US opens a small foothold for a
sub-13 floor. Read all four before drawing conclusions.

### a. The engineering floor

Seven gaps in the code or canonical docs that have nothing to do with
the law. The most binding for the floor question:

- **The router has no age gate on which AI provider we route a
  conversation to.** Google's Gemini API explicitly says "no under-18
  audience" (Section 3 below). A 9-year-old routed to Gemini would be
  a Terms-of-Service breach today. The fix is to add an age gate in
  the router — but that fix doesn't exist in the code today.
- **The type that represents a user's age bracket is a two-way union:**
  `'adolescent' | 'adult'`. There is no "child" value. Adding a sub-13
  floor is not a one-line change to this type.

Even if counsel ruled partial-inclusion legally defensible, the
codebase has no place to encode it *as-is* — encoding requires four
specific engineering items (a new age value, age-gated routing, a
post-envelope content filter, and a user-visible AI disclosure).
That's a cost claim, not a feasibility veto — see Section 4 below.

### b. The platform floor

**Google Gemini's API Terms prohibit under-18 audience** — a hard
18-floor on one of the three AI providers in our routing matrix, with
no consent-based opt-in. This is a contract term, not a law, but a
Terms-of-Service breach is still a real consequence.

### c. The design-band seam (UK, contingent on verification)

The UK ICO Children's Code (the UK's data-protection code for products
likely to be used by children) has a widely-cited Annex B that splits
children into five developmental bands (0–5, 6–9, 10–12, 13–15, 16–17).
If Annex B is as widely reported, then 10–12-year-olds get a different
*design* treatment than 13–15-year-olds — but this is a UX constraint,
not a *consent* constraint. A 10–12-year-old still requires parental
consent under UK GDPR either way. **Annex B is the synthesis's most
consequential unverified citation** — see the verification status
above. The design-seam argument in this bullet is contingent on
Annex B verifying.

### d. The arguable posture (US, a real foothold)

In the US, the question of whether a Family Sharing or Google Family
Link child account functions as a "rebuttable presumption" of parental
consent — i.e. a default assumption the parent consented unless we
have actual evidence otherwise — is **legally unsettled**. See Section 3
below. The "best we can argue" posture is: design the app so it never
collects age information from us, treat the store-side account as a
signal of parental gate, and rely on the COPPA "actual knowledge"
doctrine's ignorance defense. **This is a posture, not a safe harbor.**
Counsel must rule on it.

### The headline, as one sentence

*The most likely answer to "should we lower the age floor below 13?" is
**no** — because the law is homogeneous, the engineering has no place
to encode it, and the platform floor is 18 — but the US
account-existence posture is unsettled and worth counsel's time, and
the UK Annex B design-seam is contingent on verification.*

---

## 2. The six-layer framework (in plain English)

An LLM-tutor product aimed at under-18 users sits at the intersection
of *six different rule systems*, each with its own logic, and **the
strictest one wins** at any point of contact. The layers are:

| # | Layer | What it is | Source-of-truth |
|---|---|---|---|
| 1 | **Statute** | The law as written in the rule-books | The text of the statute |
| 2 | **Regulator interpretation** | What the regulators (FTC, ICO, EDPB, Datatilsynet) have said the law *means*, including enforcement actions | Guidance docs, press releases, fines |
| 3 | **LLM platform terms** | What OpenAI, Anthropic, and Google require of developers using their APIs | Acceptable Use Policies, Model Specs |
| 4 | **App store terms** | What Apple App Store and Google Play require for shipping into a given age-rating band, plus the EU's DSA distribution-layer obligations | App Review Guidelines, IARC bands, DSA Article 28 |
| 5 | **Account-existence realities** | What the *fact* of a child having a Family Sharing or Google Family Link account means (or doesn't mean) for consent | The actual COPPA "actual knowledge" doctrine and its analogues in UK / EU / NO |
| 6 | **LLM-domain overlay** | The special rules that exist *because* the product is an LLM tutor for minors | AI Act articles, FTC 6(b) inquiry, our own envelope |

Layers can be in tension (a US state law vs. an EU AI Act prohibition
already in force; a statutory 13-floor vs. Gemini's contractual
18-floor). When in tension, the stricter layer is the binding one
until counsel resolves the conflict.

**Acronym glossary (read these on first reference):** COPPA = US
Children's Online Privacy Protection Act. AADC = California
Age-Appropriate Design Code Act. FTC = US Federal Trade Commission.
VPC = Verifiable Parental Consent. GDPR = EU General Data Protection
Regulation (also retained by UK post-Brexit). DPA = UK Data Protection
Act 2018. ICO = UK Information Commissioner's Office. EDPB = European
Data Protection Board. DPC = Data Protection Commission (Ireland). AI
Act = EU Regulation 2024/1689 on Artificial Intelligence. DSA = EU
Digital Services Act. DPIA = Data Protection Impact Assessment. FRIA
= Fundamental Rights Impact Assessment (AI-Act specific). IARC =
International Age Rating Coalition. IDFA = Apple's Identifier for
Advertisers. ATT = Apple's App Tracking Transparency framework. AUP
= Acceptable Use Policy. CSAM = child sexual abuse material. Model
Spec = OpenAI's published model-behaviour document, including its
authority hierarchy. 6(b) inquiry = an FTC investigative demand under
Section 6(b) of the FTC Act.

---

## 3. The headline findings, layer by layer

**Layer 1 — Statute.** *Negative finding.* No statute in scope contains
sub-banding language for children under 13. COPPA, UK GDPR, GDPR
Article 8 (in all 13-floor Member States), and Norway's
personopplysningsloven §5 all set a single threshold and do not
distinguish 12-year-olds from 9-year-olds. This is *not* a positive
statement that "all under-13s are explicitly one cohort" — it is a
finding that "we did not find any statute that says otherwise."

**Layer 2 — Regulator interpretation.** FTC treats all under-13s as
one cohort (April 2025 COPPA Rule final amendments; major civil
penalties against Epic Games and Google/YouTube for under-13
violations; September 2025 6(b) inquiry into AI-chatbot operators).
ICO has not blessed Family Sharing or Google Family Link as a consent
signal. EDPB Guidelines 05/2020 put the verification burden on the
controller (us), not the platform. Irish DPC's 2024 €345M TikTok fine
found platform-side mechanisms (e.g. "Family Pairing") insufficient.

**Layer 3 — Platform terms.** **OpenAI's Model Spec puts under-18
protections at "Root" authority that developer system prompts cannot
lower.** Google Gemini's API Terms flat-prohibit under-18 audience
— a hard 18-floor with no consent-based opt-in. Anthropic bans
CSAM, grooming, and sexualisation of minors and commits to report to
authorities. The Anthropic "products serving minors" Help Center
article is the closest thing to a per-platform under-13 policy — its
verbatim text could not be directly fetched (302→404); counsel to
re-verify.

**Layer 4 — Store terms.** Apple App Review Guidelines §1.4.1 and
§5.1.1 require LLM/AI apps to implement content filtering and disclose
AI involvement, with no band-specific minor-protection carve-out.
Google Play's 2024 Generative AI policy is the most relevant recent
update; it is content-focused, not age-focused. **IARC self-classification
is not binding for COPPA purposes** — a 12+ band does not absolve an
operator with actual knowledge of under-13 users. The EU's DSA
Article 28 binds at the distribution layer (app stores) independent of
IARC band.

**Layer 5 — Account-existence realities.** This is the layer that
produces the most genuinely arguable posture in this entire walkthrough.
Read the three-form table below carefully.

**Acronym glossary (Layer 5):** none new; the 3a/3b/3c labelling is
internal to the synthesis (3a = "account existence = consent, no
collection needed"; 3b = "rebuttable presumption of consent"; 3c =
"actual-knowledge trap — what triggers the duty on us").

| Jurisdiction | 3a (account = consent, no collection needed) | 3b (rebuttable presumption) | 3c (actual-knowledge trap — what triggers it) |
|---|---|---|---|
| **US (COPPA)** | **No** | **Unclear** *(the foothold)* | Operator asks for — and receives — info that lets it determine age: DOB, grade-level, school type, or in-app chat where a child says "I'm 10". Ignorance is a defense. |
| **UK (ICO Code)** | **No** | **Unclear** | Any signal that user is a child triggers the best-interests duty. |
| **EU (GDPR Art 8 + EDPB)** | **No** | **No** | Any age-disclosing information flowing into our system activates the "reasonable efforts" verification obligation. |
| **NO (Datatilsynet)** | **No** | **Unclear** | Datatilsynet treats age assurance as controller-burden; no platform-side signal recognised. |

The **US 3b "unclear"** is the only line in this entire walkthrough that
opens room for a sub-13 floor in the US specifically. The walkthrough
should not proceed without counsel's ruling on it.

**Layer 6 — LLM-domain overlay.** The AI Act's Article 5(1)(b)
age-vulnerability exploitation prohibition is a live legal-uncertainty
surface (no EDPB or Commission guidance yet on what counts as
"exploitation due to age" for an LLM-tutor product). AI Act Article 50
requires user-visible AI disclosure, with an "obvious from context"
carve-out. AI Act Annex III §3 makes AI in education high-risk
regardless of age. FTC's September 2025 6(b) inquiry implies that
crisis signals should be routed to professional resources structurally,
not via prompt improvisation. Our own envelope at
`apps/api/src/services/llm/envelope.ts` is the structural seam where a
post-hoc safety classifier or content-filter could attach — **the
envelope exists; nothing attaches to it today**.

The headline of this layer is the **structural-vs-prompt question**:
has any regulator explicitly stated that prompt-level controls are
insufficient for under-18 protections? The OpenAI Model Spec's Root
> System > Developer authority layering is the closest evidence; no
direct regulator statement has been located. **This is Question 18 in
Section 5 below, and it is the architectural gate for the entire
walkthrough.**

---

## 4. The seven engineering gaps (the "what would have to be built" half)

If counsel rules that a sub-13 floor is legally defensible (Q19a in
Section 5 below), the engineering work required to make that floor
shippable is:

- **Gap A — Provider-routing by age.** Add an age gate on
  `rung`/provider selection in the router so that any sub-18 user is
  never routed to Gemini. (This *honors* the Layer 3 platform floor; it
  is not itself a new engineering floor.) `apps/api/src/services/llm/router.ts:316-462`.
- **Gap B — Output classifier as a post-envelope structural filter.**
  Attach a content classifier to the existing envelope at
  `apps/api/src/services/llm/envelope.ts:235-252`. Required only if Q18
  is answered YES.
- **Gap E — AI disclosure to user (EU AI Act Article 50).** Add a
  user-visible "you are talking to an AI" disclosure. (Currently relies
  on the "obvious from context" carve-out.) `apps/api/src/services/llm/router.ts:214, 218, 220`.
- **Gap G — `AgeBracket` two-way union.** Add a "child" or similar
  third value to the type at `packages/schemas/src/age.ts:1`, plus
  routing and prompt branches keyed on it.

The remaining three gaps (C — crisis escalation, D — retention TTLs, F
— api-side Sentry PII scrubbing) are additional required work for any
sub-13 product regardless of the partial-inclusion ruling, because
they reflect existing legal floors that are not currently met for any
under-13 user.

**Cost framing, not feasibility framing.** Each of the four
partial-inclusion items is bounded engineering work. The walkthrough
should not hear "engineering says we cannot do partial-inclusion"; it
should hear "engineering says partial-inclusion requires A + B + E +
G, and the cost of those four items is the variable that Question 19b
is asking counsel to weigh against the cost of holding 13+ and
shipping the gaps instead."

---

## 5. The decisions for the walkthrough (the 19 questions, triaged)

The 19 questions below are triaged into three buckets. **Bucket A is
what the walkthrough actually decides today.** Bucket B is homework
counsel can take away and report back on. Bucket C is defer — the
workstream isn't mature enough yet, or the question is interesting
but not load-bearing for the floor ruling.

**Dependency note:** Question 18 is a *prerequisite* to Question 19.
The walkthrough should rule Q18 first, because Q19b's cost comparison
depends on whether Gap B is mandatory or optional.

### Bucket A — Decide today (the walkthrough's job)

- **Q18 — Structural vs. prompt controls.** Has any regulator
  (FTC, ICO, EDPB, Datatilsynet, AI Office) explicitly stated that
  prompt-level controls are insufficient for under-18 protections? Or
  is the OpenAI Model Spec Root > System > Developer layering the
  strongest evidence we have, with no direct regulator statement on
  the record? **A "NO/UNCLEAR" answer preserves statutory floor as
  binding; a "YES" answer makes engineering floor binding.**
- **Q19a — Partial-inclusion path-defensibility.** Is there a
  counsel-defensible path to a partial-inclusion floor (e.g., 11+ or
  9+) for v1 in any of the four jurisdictions? Ruling options: YES
  (US only, 3b posture), YES (UK only, contingent on Annex B), YES
  (multi-jurisdiction, narrow scope), NO (all four).
- **Q19b — Cost comparison.** If Q19a is YES in any jurisdiction, is
  the engineering cost of that partial-inclusion path materially
  less than the cost of holding the floor at 13+ and shipping the
  seven gap-fixes instead? Requires the parallel effort-estimation
  stream's findings. Ruling options: YES (partial-inclusion is
  cheaper), NO (13+ is cheaper), UNDECIDED.

### Bucket B — Homework; counsel to verify and report back

These are primary-source verification questions where the URL is real
but the exact text was not directly confirmed. Counsel can re-verify
in the room or take away.

- **Q1 — ICO Annex B exact wording.** Are the developmental bands
  truly 0–5 / 6–9 / 10–12 / 13–15 / 16–17? Is the 10–12 vs 13–15
  design distinction a binding recommendation or illustrative? *This
  is the most consequential homework question; it is the load-bearing
  unverified citation in Section 1.*
- **Q4 — California AADC (AB-2273) post-NetChoice v. Bonta.** What
  obligations remain enforceable? Is the age-estimation duty live,
  dead, or partially live?
- **Q6 — EDPB Guidelines 05/2020 §3 — paragraph-level reading.** What
  does §3 actually say about platform-side vs. controller-side
  verification? Is the Irish DPC TikTok reasoning (€345M) consistent
  with EDPB?
- **Q11 — The Netflix-profile analogue.** Has any regulator ever
  issued a statement addressing (parent-owned account + child
  sub-profile + parent-side PIN-gating) as a consent mechanism? The
  four sub-area passes found none.
- **Q12 — COPPA "actual knowledge" triggered by in-app chat.** Is
  there a named FTC enforcement case where actual knowledge was
  triggered specifically by free-text age disclosure in chat?
- **Q16 — FTC 6(b) order text (Sept 2025).** What specific conduct
  is the FTC inquiring about? Any explicit standard for crisis
  handling, age assurance, or content filtering?
- **Q17 — FTC April 2025 COPPA Rule final amendments — full text.**
  What does the retention cap require? What does "flexible
  age-assurance" actually permit?

### Bucket C — Defer to follow-up (interesting, not load-bearing for v1)

- **Q2** — EU AI Act Article 5(1)(b) "exploitation of vulnerabilities
  due to age" as applied to an LLM tutor.
- **Q3** — AI Act Article 5(1)(f) scope — is a consumer-facing AI
  tutor within "educational institutions"?
- **Q5** — Datatilsynet position on AI tutors for minors.
- **Q7** — Apple's 2024–2025 policy on LLM products aimed at minors.
- **Q8** — Google's enforcement of its 2024 Generative AI policy in
  the under-13 context.
- **Q9** — IARC self-classification vs. COPPA "directed to children"
  status.
- **Q10** — DSA Article 28 enforcement against app stores.
- **Q13** — Most recent regulator statement on platform-based age
  signals.
- **Q14** — Verbatim OpenAI Usage Policies for developers.
- **Q15** — Verbatim Anthropic "products serving minors" Help Center
  article.

### Triage summary

- **Decide today (3 questions):** Q18, Q19a, Q19b. The walkthrough's
  outcome is determined by these three.
- **Homework (7 questions):** Q1, Q4, Q6, Q11, Q12, Q16, Q17.
- **Defer (10 questions):** Q2, Q3, Q5, Q7–10, Q13–15.

---

## 6. The expected outcomes of the walkthrough

Whatever the three rulings are, the post-walkthrough work-packages are:

1. **If Q19a is YES in any jurisdiction** — we amend the relevant
   ADR (most likely MMT-ADR-0011 amendment or a new MMT-ADR-0013) and
   the `birthYearSchema` flip (the Phase E cleanup task currently
   11→13) moves to 11→[new floor] or stays at 13+ depending on the
   ruling. The data model and ADR are updated in lockstep per
   `MMT-ADR-0000`.
2. **Either way, the seven structural gaps (Section 4) are real and
   need a workstream** — they are not contingent on the floor ruling.
3. **The "Strictly 11+" docs flagged in the Phase E cleanup need
   reconciliation**; the target reconciliation depends on what we
   just ruled.
4. **The Phase F sub-thread this walkthrough sits on produces a
   handoff and an update to `ROADMAP.md`.**
5. **A memory note in `.claude/memory/` captures the ruling and
   rationale** as the durable record that survives the session.

The walkthrough's capture is recorded into `CAPTURE-LEDGER.md` during
the session; the post-walkthrough handoff at
`_handoffs/2026-06-XX-under-13-floor-ruling.md` is generated from the
ledger within 24 hours.

---

*End of briefing packet. See `WALKTHROUGH.md` for the live agenda,
`SOURCES.md` for the consolidated citation list, `SYNTHESIS.md` for
the full research artefact, and `CAPTURE-LEDGER.md` for the ruling
template. The walkthrough decides.*
