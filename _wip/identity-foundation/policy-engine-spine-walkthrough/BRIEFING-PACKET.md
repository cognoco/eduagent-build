# Briefing Packet — Policy-Engine Spine Walkthrough

> **Participant-facing read.** This is the curated 20–25 minute read for the PM and counsel before the live walkthrough. It is the **primary input** to the walkthrough, not the full research artefact. For the full legal research, see `SYNTHESIS.md`. For citations, see `SOURCES.md`. For the live agenda, see `WALKTHROUGH.md`. For the architect's operational guide, see `FACILITATOR-BRIEF.md`.
>
> **Audience:** PM (primary) + live legal counsel (informed reader + verifier of `SOURCES.md` and the R-1 ruling only). Plain English throughout; acronyms expanded on first use.

---

## 1. What we're here to ratify

The 13+ launch floor is already ruled (Phase-E handoff, 2026-06-04). The A-vs-B conversation of the last week has produced **five high-level decisions** that the walkthrough must convert from "agreed in principle" to "ratified spine":

1. **Two-primitive model** — the policy engine's output needs two distinct primitives, not one: a **prohibition-floor** (rules that bind regardless of consent, e.g., AI Act Art 5 platform terms) and a **consent-edge** (rules unlockable by guardian consent, e.g., GDPR Art 8 with reasonable-efforts verification). Today's `MMT-ADR-0011/0012` data model carries the consent-edge but not the prohibition-floor. → `MMT-ADR-0013` draft scope.
2. **Sub-13-via-parent-operator COPPA question** — does serving sub-13 children *via a parent-owned account, with no child login at all*, trip COPPA "directed to children" or "actual knowledge"? This is the **one legal ruling** the walkthrough produces. If counsel rules COPPA does not apply (or is unclear with a defensible posture), the parent-operator path is open as a US route for the sub-13 segment; if it applies, the sub-13 v2 path is gated on full COPPA VPC.
3. **Regime taxonomy** — collapse the ~200 countries into a small first-class list of **regimes** (US-COPPA, EU-GDPR-13-floor, EU-GDPR-14-floor, EU-GDPR-15-floor, EU-GDPR-16-default, UK-AADC, ROW, …). The policy engine keys on **regimes**, not on the full country list.
4. **Knowledge axes** — "known/unknown" is **two independent axes** (known-age × known-residence), each with a **determination method** (self-report / geo-IP / billing-address / verified) and a **confidence** feeding the knowledge-state. **Default for unknown = most-restrictive.**
5. **3-param runtime router key** — the router's runtime key is **model · service-provider · serving-region**. The **vetting pipeline** (offline, on-cadence) evaluates 4-axis (model · provider-via-service · service · region) × criteria (ToS, ZDR, log-retention, training-data, age-closure) and emits rows into an **allowed-models table**; the router reads from that table, the policy engine filters.
6. **Launch set** — the launch-time provider set is **Anthropic · OpenAI · Mistral · (DeepSeek via papered service)**. **Workspace-for-Education Gemini is OUT of scope as a route** but stays as a *policy-table data point* (the §20(d) under-18 closure-with-education-tenant exception is real and informs the engine, just not a route). Vetting is deferred to a parallel research workstream.

**One sentence for the whole walkthrough:** ratify the *shape* of the policy engine (primitives, regimes, knowledge axes, router key, launch set) so the next-round ADR drafting has a spine to draft against.

---

## 2. Verification status — read this first

The legal synthesis (`SYNTHESIS.md`) leaned on the URLs in `SOURCES.md`. Some primary regulator pages (FTC, ICO, EDPB, Datatilsynet, Apple Developer, Google Play) returned HTTP 403 or 302-redirects to our WebFetch agents. The URLs are real and authoritative, but the exact text of a handful of citations is pending counsel verification.

**This is the worklist for counsel in the room.** `SOURCES.md` lists the unverified primaries in priority order. The single most consequential unverified citation is **ICO Children's Code Annex B** (a UK design-band seam that the original under-13 synthesis leaned on, and that R-1 / R-2 may still need to address). Counsel, please re-verify Annex B against the live ICO document in the room or as homework. The synthesis can be read end-to-end on the verified URLs alone; the unverified citations support enforcement-signal density but are not load-bearing for the R-1 ruling.

**For R-1 specifically:** the COPPA "actual knowledge" doctrine (16 CFR Part 312.2) and the "directed to children" trigger (16 CFR Part 312.2) are the controlling concepts. Both are statute-level; the synthesis is read on verified primary text for those. The unverified primaries are secondary to the R-1 ruling.

---

## 3. R-0 — Two-primitive model (the spine's spine)

**Plain English orientation.** A "policy engine" sounds like one big table of rules, but the rules split into two kinds that *behave differently*:

- **Prohibition-floor rules** — bind regardless of consent. They say "you may not, period." Examples: AI Act Art 5(1)(b) age-vulnerability exploitation; AI Act Art 5(1)(f) emotion-inference in education; OpenAI's CSAM-adjacent (child-sexual-abuse-material) refusal; Anthropic's "do not compromise children's safety" usage policy; Google's §20(d) "no under-18 audience" on the Gemini API.
- **Consent-edge rules** — bind only if consent is absent; consent "unlocks" them. Examples: GDPR Art 8 (parental consent unlocks processing for sub-digital-consent-age children); UK Children's Code (best-interests duty with parental gate); COPPA VPC (verifiable parental consent unlocks collection).

**Why the split matters.** A single primitive can't model both. The age-consent PoC at `_wip/identity-foundation/age-consent-landscape/` (8 jurisdictions × 8 activities × 2 knowledge states = 128 populated cells, plus skeletons) found that **7 of 8 activity categories** have cells where `consent_unlockable: false` is the binding constraint. The PoC's README explicitly calls for a *prohibition-floor* primitive in the data model — currently absent.

**Why ratification locks it now.** `MMT-ADR-0011/0012` (the data-model realization + baseline-reset ADRs, ratified 2026-06-04) describes a fresh create-from-empty baseline. Amending the schema pre-baseline is cheap; amending post-baseline is append-only. **This is the window.**

**The ruling to make:** LOCKED · REFINEMENT · REJECTED · SPLIT. If LOCKED, the prohibition-floor primitive is in scope for `MMT-ADR-0013`.

---

## 4. R-1 — Sub-13-via-parent-operator COPPA ruling (the one legal call)

**The question, in one sentence.** If a parent has an account with us, creates a *managed-child profile* (no child-side login at all, no email, no password, no in-app chat where the child can type), and the *parent* uses our product to help with a sub-13 child's homework, does COPPA apply?

**Why this is the question.** The whole sub-13-via-parent-operator hypothesis depends on it. If COPPA says yes (we are "directed to children" or we have "actual knowledge" because the parent told us the child is sub-13 at profile-creation time), then the sub-13-US path requires full VPC, which is the work-heavy path. If COPPA says no or unclear-with-a-defensible-posture, the sub-13-US path is a route we can build (and the regime-taxonomy R-2 cell needs to encode it).

**The two test cases (counsel reads these to the room).**

- **"Directed to children"** — 16 CFR Part 312.2 defines "Web site or online service directed to children" by a multi-factor test (subject matter, visual content, language, advertising, audience composition). **The parent-operator pattern is arguably not "directed to children" if the marketing, the subject matter, and the audience composition are all parent-primary.** That's the hypothesis the PoC and the under-13 synthesis both lean toward.
- **"Actual knowledge"** — 16 CFR Part 312.2 also defines actual knowledge as the operator "asks for — and receives — information that allows it to determine the user is under 13." **A managed-child profile whose only creation signal is "this is my sub-13 child, here's a profile for them" is a tricky middle case.** Counsel needs to rule whether parent-supplied profile data is "actual knowledge" of the child's age, or whether the child-data-is-the-parent's-data posture keeps it out.

**The ruling to make:** COUNSEL_RULES: COPPA_APPLIES · COPPA_DOES_NOT_APPLY · UNCLEAR_WITH_DEFENSIBLE_POSTURE. The verdict is the *policy-table cell* for the US sub-13 route. If UNCLEAR_WITH_DEFENSIBLE_POSTURE, the policy engine encodes the posture as the default; if COPPA_APPLIES, the regime-taxonomy cell for US-sub-13 is "build the full VPC path or do not serve" and the v2 gating is preserved.

**Why this is the only legal ruling the walkthrough produces.** All the other rulings (R-0, R-2, R-3, R-4, R-5) are engineering spine rulings. The legal research backbone (`SYNTHESIS.md`) is the historical input, and counsel is in the room as a verifier for `SOURCES.md` and the decider for R-1. The other 16 unverified citations in `SYNTHESIS.md` are homework, not rulings.

---

## 5. R-2 — Regime taxonomy (the policy-engine's first-class key)

**Plain English orientation.** The PoC enumerated 10 jurisdictions (US, UK, NO, DE, FR, SE, DK, EE, SK, GR) × 8 activities × 2 knowledge states. That's 160 cells — a research artefact, not an engine key. An engine has to key on something smaller. The regimes are the smaller thing.

**The candidate list (not yet locked).** The walkthrough ratifies the *first-class regime enum*. The candidate set, ordered from most-to-least-restrictive:

| Regime | Threshold (or characteristic) | Notes |
|---|---|---|
| `US_COPPA` | Under-13 VPC required; actual-knowledge doctrine | The hardest US regime |
| `EU_GDPR_16` | Digital-consent age 16 (DE, NL, IE, SK, most MSes) | Most restrictive EU |
| `EU_GDPR_15` | Digital-consent age 15 (FR) | Mid-EU |
| `EU_GDPR_14` | Digital-consent age 14 (ES, CY, BG; PT widely reported as 13, counsel to verify) | Mid-EU |
| `EU_GDPR_13` | Digital-consent age 13 (SE, DK, FI; plus NO via EEA, UK via retained UK GDPR) | Least restrictive EU |
| `UK_AADC` | UK Children's Code + UK GDPR | UK has its own DPA + design-code overlay |
| `ROW` | Rest of world (with optional sub-regime metadata for known strict jurisdictions) | Default |

The R-2 ruling locks the **first-class regime enum** (the rows above, plus any refinements). Per-Member-State detail is research-input, not a regime.

**Why regimes, not countries.** A policy engine that keys on a 200-country enum has a maintenance problem and a correctness problem (any new country is a schema change). A regime enum (5–8 entries) is a data-update problem, not a schema change. The PoC's 10 jurisdictions map into the regime enum by *tag*, not by *enumeration*.

**The ruling to make:** LOCKED · REFINEMENT · REJECTED · SPLIT. The ruling text includes the **locked regime enum** as an inline list.

---

## 6. R-3 — Knowledge axes (the policy-engine's state input)

**Plain English orientation.** "Is this user a 14-year-old in France?" is two independent questions: (a) what's their age, (b) where do they reside. Each has a *determination method* (how we know it) and a *confidence* (how sure we are). The policy engine's state input is the cross-product of those four things.

**The two axes.**

- **Known-age axis** — determination method: `self_report` · `parent_reported` · `verified_credential` · `age_estimation_signal`. Confidence: 0.0–1.0.
- **Known-residence axis** — determination method: `self_report` · `billing_address` · `geo_ip` · `verified_credential`. Confidence: 0.0–1.0.

**Default for unknown = most-restrictive.** If we don't know the age, treat as sub-13. If we don't know the residence, treat as the strictest applicable regime (the `US_COPPA` floor for the `consent_unlockable` rules; the strictest `EU_GDPR_X` for the consent-edge rules). This is a *safety* default and a *legal* default — the worst case is over-restriction (we refuse a route we could safely have served), not under-restriction.

**v1 determination-method set (proposed).** `self_report` (age) + `parent_reported` (age, for managed-child profiles) + `geo_ip` (residence) + `billing_address` (residence, fallback). `verified_credential` and `age_estimation_signal` are phase-2. The walkthrough ratifies the v1 set.

**Why two axes, not one.** The under-13 synthesis's "actual-knowledge" trap is asymmetric across the two axes: actual knowledge of *age* (a child types "I'm 10") binds under COPPA; actual knowledge of *residence* (a child types "I'm in France") doesn't bind in the same way (it binds `EU_GDPR_X` selection, but not the same "actual knowledge" doctrine). Conflating them loses the trap's structure.

**The ruling to make:** LOCKED · REFINEMENT · REJECTED · SPLIT. The ruling text includes the **v1 determination-method set** as an inline enum and confirms the default-for-unknown rule.

---

## 7. R-4 — Router key (3-param runtime, 4-param vetting)

**Plain English orientation.** Two concerns that get conflated:

- **The vetting pipeline** (offline, on-cadence) — decides whether a (model · service · region) tuple is *ever* acceptable. It evaluates the tuple against criteria: ToS (does the provider's ToS allow this user class in this region), ZDR (is zero-data-retention available and what does it cost), log-retention (how long are logs kept, where), training-data (is the user's content used for training), age-closure (is the provider contractually closed to this age class). The vetting pipeline emits a row into the **allowed-models table** with metadata describing which criteria passed. Cadence is "when the legal/contractual surface changes" — slow.
- **The router** (online, per-request) — picks from the **allowed-models table** rows, filtered by the policy engine's eligibility output for this request. Cadence is "every LLM call" — fast.

**The split is the spine of R-4.** The router's runtime key is **3 parameters**: `model · service_provider · serving_region`. (The model-provider is baked into model in the runtime key — Claude is always Anthropic, etc.) The vetting pipeline's key is **4 axes**: `model · provider_via_service · service · region` — the extra axis captures that the same model can be vetted differently when reached via different services (Anthropic-Claude-via-Azure vs. via-OpenRouter is a different vetting row).

**The router never sees vetting criteria directly.** The router sees a vetted row from the allowed-models table. If a row has metadata "ZDR: false, age-closure: 16+", the router doesn't care — that row has been vetted for the cells where the policy engine says "this row is allowed." The router's job is to pick *within* the filtered set by complexity, cost, load.

**Why this matters.** Conflating the vetting pipeline and the router means the router re-implements compliance at runtime, which is brittle, slow, and a maintenance hazard. Splitting them means the vetting pipeline is the slow-cadence legal/contractual change surface, and the router is the fast-cadence per-request picker. Cleanly separable, separately testable, separately auditable.

**The ruling to make:** LOCKED · REFINEMENT · REJECTED · SPLIT. The ruling text confirms the **3-param runtime key** and the **4-param vetting axis**, and confirms the **vetting-pipeline → allowed-models-table → policy-engine-filter → router** flow.

---

## 8. R-5 — Launch set (with vetting deferred)

**The candidate set, not yet locked.** The walkthrough ratifies the *engineering intent* of the launch provider set. The candidate set:

| Provider | Role | Vetting status (pre-walkthrough) |
|---|---|---|
| **Anthropic (Claude)** | Primary US-domiciled route; minor-safe per usage policy | Open — vetting PoC pending |
| **OpenAI** | Primary US-domiciled route; under-18 ToS nuances (Root-system model spec) | Open — vetting PoC pending |
| **Mistral** | EU-domiciled route (model + serving region) | Open — vetting PoC pending |
| **DeepSeek via papered service** | Cost-effective non-US route; *only* the model weights — vetting is for the service layer | Open — vetting PoC pending |
| ~~Workspace for Education Gemini~~ | ~~All-ages unlock via education tenant~~ | **OUT of scope as a route** — keep as a *policy-table data point* (the §20(d) under-18-closure-with-education-tenant exception is real and informs the engine, just not a route) |

**Why vetting is deferred to a parallel research workstream.** The vetting pipeline is its own workstream with its own PoC shape (the same `age-consent-landscape/`-style data.json + index.html). The walkthrough ratifies the *engineering intent* (the providers we're targeting); the *vetting verdict* (which pass for which cells) is the workstream's output. This is the same separation-of-concerns move as R-4.

**The ruling to make:** LOCKED · REFINEMENT · REJECTED · SPLIT. The ruling text includes the **locked provider set** as an inline enum and confirms Workspace-for-Education is out of scope as a route.

---

## 9. The six rulings, summary

| ID | Ruling | Output |
|---|---|---|
| R-0 | Two-primitive model | `MMT-ADR-0013` scope includes prohibition-floor primitive |
| R-1 | Sub-13-via-parent-operator COPPA | US sub-13 cell of regime-taxonomy; v2 path posture |
| R-2 | Regime taxonomy | Locked first-class regime enum |
| R-3 | Knowledge axes | v1 determination-method set; default-for-unknown rule |
| R-4 | Router key | 3-param runtime key; 4-param vetting axis; flow lock |
| R-5 | Launch set | Locked launch provider set; vetting-research workstream named |

**Dependency order:** R-0 → (R-2 + R-3) → R-4 → R-5. R-1 is independent.

---

## 10. What this packet does not cover

- The full legal research backbone (`SYNTHESIS.md`) — the workshop leans on it for R-1 and the regime-taxonomy cell, but it is the **historical input**, not the live ruling set. Read it as a reference.
- The four sub-area research returns (`RESEARCH-CONTRACTS.md` and the captured sub-area returns) — these are the *research stream's* artifacts, not the *spine workshop's* inputs.
- The PoC code/data (`age-consent-landscape/`) — the workshop cites the `consent_unlockable: false` finding for R-0; the PoC is a research artefact, not a workshop input.
- The roadmap (`ROADMAP.md`) — the walkthrough is one decision in a larger plan.

---

*End of briefing packet. The walkthrough ratifies the spine.*
