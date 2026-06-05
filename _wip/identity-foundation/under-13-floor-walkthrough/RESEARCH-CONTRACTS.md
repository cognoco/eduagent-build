# Phase 1 — Research Contracts

**Purpose.** Four sub-areas of cited, skim-grade research to populate the
under-13-floor walkthrough briefing packet. Plain `Agent` calls run in
parallel; each agent receives one of the four contracts below. **No
interpretation** — that is the walkthrough's job.

**Constraints common to all four contracts.**

- **Jurisdictions in scope:** US (COPPA), UK (Children's Code / ICO), EU
  (GDPR Art 8 + DSA + EDPB), Norway (Markedsføring). Australia / India / etc.
  are out of scope; mention only as architectural-flexibility flag.
- **Source quality bar:** regulator-published guidance (FTC, ICO, EDPB,
  CNIL, Datatilsynet) and major secondary sources (e.g. IAPP, Linklaters /
  DLA Piper / Hogan Lovells client alerts, Lawfare). Vendor blogs and
  marketing material are not acceptable as primary citations. Where a claim
  is uncertain, say so explicitly.
- **Format:** structured output per the schema below. **No prose narrative
  in the agent return** — the synthesis agent (Phase 1.5) is responsible
  for prose.
- **Length budget:** 800–1,500 words per sub-area return. Skim-grade.
- **Cited URL on every non-trivial claim.** A claim without a URL is
  deleted by the synthesis agent.
- **"What we don't know"** section is mandatory and must include the
  specific question the human/legal counsel will need to resolve, not
  vague hand-waves.

---

## Sub-area 1 — Regulatory sub-banding of "under 13"

**Research question.** Across the in-scope jurisdictions, is "under 13" a
single legally-homogeneous bucket, or does the law (or the regulators'
interpretation of the law) create a ladder — e.g. under-6, 6–9, 9–12,
11–12 — where the obligations or risk profile differ meaningfully for an
LLM-tutor product aimed at minors?

**Output schema** (one row per sub-band finding).

```yaml
- jurisdiction: US | UK | EU | NO
  statute_or_regime: e.g. "COPPA", "GDPR Art 8", "UK Children's Code"
  age_band: e.g. "under 6", "6–8", "9–12", "11–12"
  obligation_or_limit: one-sentence statement of the rule
  consent_mechanics: how parental consent is collected / what counts as valid
  enforcement_signal: any cited FTC / ICO / EDPB / Datatilsynet action or guidance
  source_url: regulator page or named secondary source
  notes: anything the briefing packet should flag (e.g. "regulator has not spoken yet")
```

**Special asks.**
- Look specifically for whether any jurisdiction has issued guidance that
  treats **12-year-olds** (the band just under our 13+ floor) as a separate
  case from younger children. This is the band closest to a defensible
  partial-inclusion.
- Look for any guidance that **defines "child"** in a way that creates a
  non-13 boundary (e.g. some Nordic regimes treat 16 as the digital consent
  age — what does that mean for a 14-year-old in Norway?).
- If the law is silent on sub-banding, say so and cite the silence.

**Out of scope.** Effort estimation. Product-architecture design. The
under-18 core (13–17 already in scope per Phase E).

---

## Sub-area 2 — App Store enforcement per IARC / regional rating band

**Research question.** If we self-classify the app into a given IARC / age
rating band (e.g. 9+, 12+, 16+), what do Apple App Store and Google Play
**actually enforce** on us at that band — content review, ad restrictions,
data-collection caps, gating of certain SDKs, parental-gate requirements,
UI constraints?

**Output schema** (one row per band × store).

```yaml
- store: apple | google
  rating_system: IARC | PEGI | ESRB | regional
  band: e.g. "9+", "12+", "16+"
  enforcement_action: what the store enforces at this band
  source_url: store developer-policy page or named secondary source
  notes: especially anything that touches LLM products or data collection
```

**Special asks.**
- Distinguish between (a) **enforcement** (what the store requires of us to
  ship into this band) and (b) **automatic consequences of classification**
  (e.g. ad-network policies that reject apps in bands where they have
  inventory gaps). They are not the same thing.
- For LLM / generative-AI apps specifically: is there any *current* store
  guidance that addresses AI products aimed at minors? FTC's 2024–2025
  actions against specific AI-for-kids products (e.g. the OpenAI / Character
  AI / others) are relevant — cite the actions, the alleged violations,
  and any store-policy response.
- For the EU specifically: the **DSA risk-mitigation obligations for
  platforms likely to be accessed by minors** (Art 28a) may bind us at the
  store-distribution level even if our own classification is "general
  audience." Flag this.

**Out of scope.** What the *rating bodies* (PEGI, ESRB, IARC) say. We
care about what the **stores** enforce on the back of the rating.

---

## Sub-area 3 — Store-account existence as a parental-consent signal

**Research question.** If a child has an Apple ID or Google account —
especially one created via Family Sharing / Google Family Link by a
parent — does the **fact of that account existing** function as a
parental-consent signal we can rely on, in the COPPA / GDPR Art 8 sense?

Three sub-questions, in escalating specificity.

**3a. Strong form.** Does the existence of a Family Sharing child account
mean we can treat the parent as having consented to the child using our
app, **without us collecting consent ourselves**?

**3b. Weak form.** Does the existence of a Family Sharing child account
give us a **rebuttable presumption** of consent — i.e. we can rely on it
absent actual knowledge to the contrary?

**3c. Trap form.** Even if 3b holds, the COPPA **"actual knowledge"
doctrine binds us the moment we have actual knowledge** that a user is
under 13 — regardless of what account they used. So the operative
question is not "does the account exist?" but "do we have a way to
**avoid acquiring actual knowledge** in the first place?" If we can
avoid acquiring it (e.g. by not asking age, not displaying the user's
age, not letting age signals flow into our system), the account
existence is a shield. The moment a child types "I'm 10" in a chat, we
have actual knowledge and the shield evaporates. The trap is that the
shield only works if we engineer around acquiring the knowledge at all.

**Output schema** (one row per regime).

```yaml
- regime: US (COPPA) | UK | EU (GDPR Art 8) | NO
  strong_form_3a_answer: yes | no | unclear | jurisdiction_specific
  weak_form_3b_answer: yes | no | unclear | jurisdiction_specific
  trap_form_3c_answer: short statement on whether the actual-knowledge trap applies + how it is triggered
  reasoning: short statement
  actual_knowledge_doctrine: how the regime treats "actual knowledge" specifically
  source_url: regulator guidance, named enforcement action, or secondary source
  notes: any "actually-knowledge-still-binds" traps
```

**Special asks.**
- The COPPA **"actual knowledge"** doctrine is the controlling concept
  in the US. If we have actual knowledge (not just constructive) that a
  user is under 13, COPPA's full parental-consent mechanics apply
  regardless of what account they use. Map this carefully.
- For the EU: the Article 8 "holder of parental responsibility" concept,
  and the EDPB's view on whether platform-side account-creation counts
  as verifiable consent. (EDPB Guidelines 05/2020 on consent are
  relevant.)
- For the UK: the ICO's Children's Code (Age Appropriate Design Code) and
  its specific guidance on "best interests of the child" — does the
  account-creation mechanism satisfy the standard?
- Norway: the Datatilsynet's stance on platform-side age assurance.
  Norway is interesting because they have been skeptical of platform-only
  age signals.

**Out of scope.** Identity-verification / age-estimation technology (e.g.
Yoti, Jumio, k-ID). We are asking about the *legal* status of an existing
store account, not about technical age-gating.

---

## Sub-area 4 — LLM-conversation constraints for younger children

**Research question.** If a sub-13 child ends up in a tutor conversation,
what do the regulators and the LLM platforms demand of us about what
happens in the LLM exchange? Is a system prompt like "for users under
age X, behave like this" legally and operationally sufficient, or do
regulators / platforms require something structural (output filtering,
content classes banned, logging, human-in-the-loop, restricted model
routing, no-memory-between-sessions, no-PII-retention)?

**Output schema** (one row per constraint class).

```yaml
- constraint_class: e.g. "output-content-filter", "memory-policy", "logging", "model-routing"
  source: regulator | platform_aup | industry_guidance
  jurisdiction: as applicable
  what_it_requires: one-sentence statement
  structural_or_prompt_level: structural | prompt | either
  source_url: named regulator action, platform AUP, or industry guidance
  notes: any carve-outs or "where this is overkill" notes
```

**Special asks.**
- Cite the FTC's 2024–2025 actions against specific AI products aimed at
  children (e.g. the alleged-violation list in the OpenAI ChatGPT / 4o
  action, the Character AI actions). These are the closest live
  precedent.
- Cite the platform AUPs (OpenAI, Anthropic, Google) on minors — what
  they require of *us* as developers building on top, and what they
  enforce via API.
- For the UK: the ICO's consultation / guidance on generative AI and
  children's data (2024 series).
- For the EU: the AI Act's classification of AI systems that interact
  with minors — what risk tier, what obligations.
- For all: the "system prompt vs. structural guardrail" question. Is
  there a regulator statement that prompt-level controls are *not*
  sufficient? If yes, cite it explicitly.
- **Map against our existing envelope** (inline, with a freshness flag).
  For each constraint class that comes back as "structural," produce
  three one-sentence notes:
    - **Code-level fit** — whether a related guard exists in
      `apps/api/` or `apps/mobile/` today, with a `file:line` cite.
    - **Canonical-doc fit** — whether a related concept is captured in
      `docs/adr/` / `data-model.md` / `domain-model.md` (the target
      model from Phases D–E), with a doc cite.
    - **Freshness flag** — explicit note that the canonical-doc layer is
      mid-Phase F (data model locked, `architecture.md` carve-out not
      yet written), so the canonical-doc fit is against the *target*
      model, not a built-and-shipped one. The code-level fit is
      against what's in the repo today.
  Do not propose new architecture — that is downstream (the synthesis
  agent may surface "this is what's missing" but this agent's job is
  to cite the external constraints and map them, not design for them).

**Out of scope.** Proposing new architecture or new technical controls.
The synthesis agent (Phase 1.5) may surface "this is what's missing" but
this agent's job is to cite the *external* constraints, not design for
them.

---

## How the four returns feed the synthesis (Phase 1.5)

The synthesis agent receives all four returns and produces a single
synthesis document structured as a **six-layer constraint-sets Venn**
(introduced in the walkthrough's framing segment):

- **Layer 1 — Statute.** Sub-area 1's `obligation_or_limit` per band.
- **Layer 2 — Regulator interpretation.** Sub-area 1's
  `enforcement_signal` + sub-area 4's regulator-issued constraint classes.
- **Layer 3 — Store / platform terms.** Sub-area 2's
  `enforcement_action` per band.
- **Layer 4 — Age-rating system implications.** Sub-area 2's rating-band
  consequences.
- **Layer 5 — Account-existence realities.** Sub-area 3's
  strong-form / weak-form answers per regime.
- **Layer 6 — Domain-specific overlays (LLM-for-minors).** Sub-area 4's
  constraint classes, mapped against our existing envelope.

Synthesis also produces a **jurisdiction × age-band matrix** that makes the
gaps visible at a glance — the artifact the walkthrough room will be
looking at when discussing the 13+ floor.
