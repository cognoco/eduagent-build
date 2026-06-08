# Synthesis — Policy-Engine Spine Walkthrough

> Reused as the legal-research backbone for the policy-engine spine walkthrough (originally authored for the under-13 floor walkthrough; the legal substance is unchanged).

> **Briefing-packet primary input.** Six-Layer Constraint-Sets Venn, jurisdiction × age-band matrix, and the seven structural gaps surfaced across four sub-area returns. This document names the constraints. The walkthrough decides.
>
> **Audience:** PM (primary) + live legal counsel (informed reader + verifier). Plain English throughout; acronyms expanded on first use per section.
>
> **Verification status at a glance:** This synthesis leans on the URLs listed in Section 5. Some primary regulator pages (FTC, ICO, EDPB, Datatilsynet, Apple Developer, Google Play) returned HTTP 403 or 302 to our WebFetch — the URLs are real and authoritative, but the exact text was not directly confirmed by us. **Counsel should treat Section 5 as the verification worklist** and re-verify the flagged citations in the room. The synthesis's conclusions can be re-derived from the verified citations alone; the unverified citations support the *enforcement-signal density* but are not load-bearing for the Section 1 finding.

---

## 1. Top-of-fold finding

In plain English: in the four jurisdictions we care about — the US, the UK, the EU, and Norway — the law does not split children under 13 into sub-categories. A 12-year-old is treated the same as a 9-year-old for purposes of consent and data-protection rules. This is *probably* the answer to the question that opened this exercise ("could we defend a partial-inclusion floor of 11+ or 9+?"), but it is **not the only constraint that binds**. Three other constraints impose their own floors, independent of the law:

- **Engineering floor (Section 4).** Seven gaps in the code or canonical docs that have nothing to do with the law. The most binding for the floor question are:
  - **Gap A** — there is no age gate on which AI provider we route a conversation to. Google's Gemini API explicitly says "no under-18 audience" (see Section 2 Layer 3). A 9-year-old routed to Gemini would be a Terms-of-Service breach today.
  - **Gap G** — the type that represents a user's age bracket (`packages/schemas/src/age.ts:1`) is a two-way union: `'adolescent' | 'adult'`. There is no "child" value. Adding a sub-13 floor is not a one-line change to this type.
  Even if counsel ruled partial-inclusion legally defensible, the codebase has no place to encode it *as-is* — encoding requires the four items listed in Section 4 (a new age value, age-gated routing, a post-envelope content filter, and a user-visible AI disclosure).

- **Platform floor (Section 2 Layer 3).** Google Gemini's API Terms prohibit under-18 audience — a hard 18-floor on one of the three AI providers in our routing matrix, with no consent-based opt-in. This is a contract term, not a law, but a Terms-of-Service breach is still a real consequence.

- **Design-band seam (UK only, and contingent on Annex B verifying).** The UK ICO Children's Code (the UK's data-protection code for products likely to be used by children) has a widely-cited Annex B that splits children into five developmental bands (0–5, 6–9, 10–12, 13–15, 16–17). If Annex B is as widely reported, then 10–12-year-olds get a different *design* treatment than 13–15-year-olds — but this is a UX constraint, not a *consent* constraint. A 10–12-year-old still requires parental consent under UK GDPR either way. **Annex B is the synthesis's most consequential unverified citation** — see Section 5. The design-seam argument in this bullet is contingent on Annex B verifying.

- **The arguable posture (US, weaker than the three floors above).** In the US, the question of whether a Family Sharing or Google Family Link child account functions as a "rebuttable presumption" of parental consent — i.e. a default assumption the parent consented unless we have actual evidence otherwise — is **legally unsettled**. See Section 2 Layer 5 below. This is the only place in the synthesis that opens room for a sub-13 floor *in the US specifically*. The "best we can argue" posture is: design the app so it never collects age information from us, treat the store-side account as a signal of parental gate, and rely on the COPPA "actual knowledge" doctrine's ignorance defense. **This is a posture, not a safe harbor.** Counsel must rule on it.

**The walkthrough's job** is to treat statutory homogeneity as the floor's default position, then ask: do any of the three non-statutory floors (engineering, platform, design) or the US "unsettled 3b" posture create room for a partial-inclusion carve-out the law itself does not authorize? Counsel must rule on the US 3b posture before the engineering-vs-statutory comparison can be made cleanly.

**Headline, as one sentence:** *The most likely answer to "should we lower the age floor below 13?" is **no** — because the law is homogeneous, the engineering has no place to encode it, and the platform floor is 18 — but the US account-existence posture is unsettled and worth counsel's time, and the UK Annex B design-seam is contingent on verification.*

---

## 2. Six-Layer Constraint-Sets Venn

**Plain-English orientation for the PM:** An LLM-tutor product aimed at under-18 users sits at the intersection of *six different rule systems*, each with its own logic, and **the strictest one wins** at any point of contact. The layers are:

1. **Statute** — the law as written in the rule-books.
2. **Regulator interpretation** — what the regulators (FTC, ICO, EDPB, Datatilsynet) have said the law *means*, including enforcement actions.
3. **LLM platform terms** — what OpenAI, Anthropic, and Google require of developers using their APIs (Acceptable Use Policies, Model Specs).
4. **App store terms** — what Apple App Store and Google Play require for shipping into a given age-rating band, plus the EU's DSA distribution-layer obligations.
5. **Account-existence realities** — what the *fact* of a child having a Family Sharing or Google Family Link account means (or doesn't mean) for consent.
6. **LLM-domain overlay** — the special rules that exist *because* the product is an LLM tutor for minors (AI Act Art 5(1)(b) age-vulnerability prohibition, FTC 6(b) inquiry on AI chatbots, our own envelope).

Layers can be in tension (a US state law vs. an EU AI Act prohibition already in force; a statutory 13-floor vs. Gemini's contractual 18-floor). When in tension, the stricter layer is the binding one until counsel resolves the conflict.

### Layer 1 — Statute

The law itself, in its enacted text. (Acronym glossary at the foot of this section — please expand in your head on first read.)

- **US — COPPA (Children's Online Privacy Protection Act; 15 U.S.C. §§ 6501–6506; 16 CFR Part 312).** Single threshold at 13. Operators of services "directed to children" or with *actual knowledge* of collecting personal info from a child must obtain **Verifiable Parental Consent (VPC)** before collection. "Actual knowledge" means the operator asked for — and received — information that lets it determine the user is under 13 (e.g., date of birth, "what grade are you in?", or in-app chat where a child says "I'm 10"). Ignorance is a defense; willful blindness is not. **Statute is silent on sub-banding — all under-13s are one cohort.** (FTC COPPA Rule final amendments 90 FR 16977, published 22 April 2025.)
- **US — California AADC (Age-Appropriate Design Code Act, AB-2273).** Folded into the US row per the original framing. Imposes data-protection-by-default, DPIA (Data Protection Impact Assessment), and age-estimation duties on online services likely to be accessed by children. **Partially enjoined by NetChoice v. Bonta (9th Cir. 2024) — what remains enforceable needs counsel review** (see Section 6, question 4).
- **US — State social-media age-verification laws (Utah, Arkansas, Texas, others).** Folded into the US row. Apply to social-media products specifically; relevance to an LLM tutor is jurisdiction-specific and not yet litigated. Counsel to confirm scope if we go sub-13 in any state.
- **US — FTC Act §5.** Civil penalty authority for COPPA violations, enforceable by FTC and state Attorneys General.
- **UK — Data Protection Act 2018 §123 + UK GDPR Article 8.** Age of digital consent retained at 13 post-Brexit. Below 13, parental consent required.
- **EU — GDPR (General Data Protection Regulation) Article 8.** Information-society services offered directly to a child: consent valid only at or above the Member-State threshold (default 16, floor 13). Below threshold, consent must be given or authorised by the holder of parental responsibility. Controller must make "reasonable efforts to verify" consent "taking into consideration available technology."
  - **Member-State thresholds under GDPR Article 8** (per EDPB tracking, secondary-source; counsel to verify the full 27-Member-State list):
    - **13:** SE, DK, FI (plus NO via EEA; UK via retained UK GDPR — see separate bullets)
    - **14:** ES, CY, BG (PT widely reported as 13; counsel to verify)
    - **14 or 13 (depending on year cited):** AT, IT, SI
    - **15:** FR
    - **16 (default):** DE, NL, IE, SK (and most other MSes that did not derogate)
  - **Note:** The UK and Norway are *not* EU Member States — UK post-Brexit applies retained UK GDPR + DPA 2018 §123 (threshold 13); Norway applies the EEA-incorporated GDPR + personopplysningsloven §5 (threshold 13).
- **EU — GDPR Recital 38.** Children "merit specific protection" re: marketing, profiling, services offered directly. **No age ladder inside the recital.**
- **EU — AI Act (Regulation 2024/1689) Article 5(1)(b).** Prohibits AI systems that exploit vulnerabilities of a person or group "due to their age, disability or a specific social or economic situation" where it causes significant harm. **No numeric sub-banding.** In force from 2 February 2025.
- **EU — AI Act Article 5(1)(f).** Prohibits emotion-inference AI in workplace and educational settings, with narrow carve-out. **No age sub-banding.** In force from 2 February 2025.
- **EU — AI Act Annex III §3.** **High-risk classification** (DPIA, Fundamental Rights Impact Assessment [FRIA] under Art 27, human oversight under Art 26, deployer notification) for AI used to determine admission, evaluate learning outcomes, assess level of education, or monitor prohibited test behaviour. **Applies "at all levels" of education — explicitly no age carve-out.** Obligations apply from 2 August 2026. *Note: Annex III §3 is read in two layers in this synthesis — see Layer 1 (statute) here, and Layer 6 (LLM-domain overlay) for the LLM-tutor application.*
- **EU — Digital Services Act (DSA; Regulation 2022/2065) Article 28.** Online platforms accessible to minors must implement "appropriate and proportionate measures to ensure a high level of privacy, safety, and security of minors." Profiling-based advertising to minors prohibited (Art 28(2)). **DSA does not sub-band minors by age.** *Note: DSA Art 28 is also read in Layer 4 (distribution layer) — same source, different lens.*
- **NO — Personopplysningsloven (Personal Data Act) §5.** Norway's national implementation of GDPR. Age of consent for information-society services set at 13. Above 13, child can consent personally; below 13, parental consent required. **Statute is silent on sub-banding.** https://lovdata.no/dokument/NLE/lov/2018-06-15-38
- **NO — Markedsføringsloven (Marketing Control Act).** Marketing aimed at children must take special care; aggressive or manipulative marketing toward minors prohibited; Forbrukertilsynet (Norwegian Consumer Authority) enforces. **Minors as a single category, no sub-banding.** https://lovdata.no/dokument/NL/lov/2009-01-09-2
- **NO — DSA and AI Act incorporation via the EEA Agreement.** Norway is EEA-member but not EU-member; the DSA and AI Act are EEA-relevant Union acts and Norway's incorporation timeline likely matches the EU but should be confirmed by counsel.

**Acronym glossary (Layer 1):** COPPA = Children's Online Privacy Protection Act (US). AADC = Age-Appropriate Design Code Act (California). FTC = Federal Trade Commission (US regulator). VPC = Verifiable Parental Consent. GDPR = General Data Protection Regulation (EU + UK + EEA). DPA = Data Protection Act (UK statute that retains UK GDPR). AI Act = EU Regulation 2024/1689 on Artificial Intelligence. DSA = Digital Services Act (EU regulation 2022/2065). DPIA = Data Protection Impact Assessment. FRIA = Fundamental Rights Impact Assessment (AI-Act specific).

**Headline finding (this layer) — read as a *negative* finding, not a positive one:** **No statute in scope contains sub-banding language for children under 13.** COPPA, UK GDPR, GDPR Article 8 (in all 13-floor Member States), and Norway's personopplysningsloven §5 all set a single threshold and do not distinguish 12-year-olds from 9-year-olds. This is *not* a positive statement that "all under-13s are explicitly one cohort" — it is a finding that "we did not find any statute that says otherwise." Counsel should treat this as the absence of a legal hook for partial-inclusion, not as an active statutory endorsement of homogeneity.

### Layer 2 — Regulator interpretation / guidance

The regulator's reading of the law — guidance, enforcement actions, published positions. Distinct from the law itself.

- **FTC (US).** Unanimously finalized first major COPPA Rule amendment since 2013 on 22 April 2025 (90 FR 16977). New provisions: separate VPC for sale or targeted advertising, data-retention cap, biometric and government-issued identifiers added to "personal information," flexible age-assurance permitted before age determination. Commissioners Bedoya & Slaughter flagged that retention cap was designed with LLM training data in mind. **FTC treats all under-13s as one cohort.**
- **FTC enforcement actions (dollar amounts pending counsel verification, see Section 5).** *FTC v. Epic Games* (Dec 2022, $275M civil penalty + $245M consumer redress) and *FTC v. Google/YouTube* (Sept 2019, $170M) for COPPA on under-13 channels. Counsel should verify the exact dollar amounts before quoting.
- **FTC 6(b) inquiry — September 2025.** Order to 7 AI-chatbot operators (OpenAI, Alphabet, Meta/Instagram, Snap, xAI, Character Technologies, Anthropic) signals that suicide-, self-harm-, and abuse-handling are a primary area of inquiry. **Implied expectation: structural routing to professional resources, not improvised counselling.** *Primary order text not directly verified by us; publicly reported via secondary law-firm summaries.*
- **FTC "crackdown on deceptive AI tutoring" — September 2024.** Stated initiative, not yet a series of named enforcement actions.
- **ICO (UK Information Commissioner's Office).** *ICO v. TikTok* (April 2023), £12.7M fine for processing data of an estimated 1.4M UK children under 13 without parental consent. Children's Code strategy with audits and enforcement notices against Snap, BeReal, etc. (2023–2024). The Code applies to "information society services likely to be accessed by children" — broader than COPPA. **No ICO statement that Family Sharing or Google Family Link functions as a consent signal.**
- **EDPB (European Data Protection Board; the EU-level body that issues cross-Member-State guidance).** Guidelines 05/2020 (4 May 2020) is the controlling consent guidance for GDPR Article 8. EDPB position: mechanisms relying solely on the child or a platform are insufficient to meet Article 8's verification bar; the controller (us) bears the verification burden. *Paragraph-level text (specifically §3 on platform-side consent) cited from secondary summary — counsel to verify the exact paragraph text.*
- **Irish DPC (Data Protection Commission).** *TikTok* fine (2024, €345M) found platform-side mechanisms (e.g. "Family Pairing") insufficient to meet Article 8's verification bar. **The closest enforcement precedent on platform-side vs. controller-side verification.** *€345M figure cited from secondary summary; counsel to verify.*
- **Datatilsynet (NO; Norwegian data-protection authority).** Historically strict view on age verification. June 2024 Nordic DPA declaration (Oslo, 30–31 May 2024) addressed "children's data protection in gaming, AI and administrative fines." **Full text not retrieved in sub-area 3 pass — counsel should re-verify.**
- **European Commission.** DSA Article 28 Commission guidelines (May 2025) specify that "likely to be accessed by minors" includes app stores distributing apps to minors. First Article 28 investigations/designations ongoing; **no public enforcement action against Apple/Google specifically as of the sub-area 2 pass.** *Primary text not directly fetched.*

**Acronym glossary (Layer 2):** ICO = Information Commissioner's Office (UK data-protection regulator). EDPB = European Data Protection Board. DPC = Data Protection Commission (Ireland's data-protection authority, often the lead DPA for cross-border EU cases). 6(b) inquiry = an FTC investigative demand under Section 6(b) of the FTC Act, used to gather information on industry practices. DPC = same as above.

**Empty-cell note:** No regulator in scope has issued guidance specifically addressing (parent-owned account + child sub-profile + parent-side PIN-gating) as a consent mechanism — i.e., the **Netflix-profile analogue**. Counsel should treat that pattern as unblessed.

### Layer 3 — Platform terms (LLM providers)

Provider Acceptable Use Policies, Model Specs, and Additional Terms. These bind on developer use of the API regardless of what the law says.

- **OpenAI Model Spec (§8 "Under-18 Principles," "Red-line principles").** Under-18 protections sit at **Root** authority. Developer system prompts cannot lower them. The model is trained to refuse CSAM-adjacent (child-sexual-abuse-material), sexualised-minor, or grooming-style content regardless of dev instruction. **Structural, not prompt-level.**
- **OpenAI Usage Policies (developer-facing).** Verbatim text not retrieved (403'd in sub-area 4 pass). **Counsel should re-verify.**
- **Google Gemini API Additional Terms ("Age Requirements").** Clients (us) must not be "directed towards or … likely to be accessed by individuals under the age of 18." **Threshold is 18. No separate under-13 carve-out. No consent-based opt-in path documented. This is the binding platform floor for any Gemini-routed flow.**
- **Anthropic Usage Policy ("Do Not Compromise Children's Safety").** Bans CSAM, grooming, sexualisation of minors "including in fictional settings or via roleplay." Commits Anthropic to report to authorities on detection. **Structural, not prompt-level.**
- **Anthropic Help Center — "products serving minors" article.** Verbatim text not retrieved (302→404 in sub-area 4 pass). **Counsel should re-verify.**

**Acronym glossary (Layer 3):** AUP = Acceptable Use Policy. CSAM = child sexual abuse material. Model Spec = the document OpenAI publishes describing its models' behaviour, including the authority hierarchy the model follows.

**Architecturally consequential:** Layers 1 and 3 are in *agreement* on the under-18 prohibition (Gemini), but Layer 3 is in *tension* with any partial-inclusion argument — Gemini's 18-floor is higher than the law's 13-floor in all four jurisdictions. A conversation routed to Gemini for an under-18 user is a Terms-of-Service breach regardless of jurisdiction.

### Layer 4 — Store terms and age-rating enforcement

App Store / Google Play IARC (International Age Rating Coalition) bands, store-specific AI policies, and DSA distribution-layer obligations.

- **Apple App Review Guidelines §1.4.1 and §5.1.1 (updated 2024).** LLM/AI apps must implement content filtering and disclose AI involvement. **No specific minor-protection carve-out at any band.** Most enforcement is reactive (post-launch rejection or removal).
- **Apple IARC bands.** 4+ (universal distribution; IDFA/ATT — Apple's Identifier for Advertisers / App Tracking Transparency framework — fires regardless of band if tracking occurs); 9+ (mild cartoon/fantasy violence; some ad networks auto-reject from serving personalised ads); 12+ (mild realistic violence, suggestive content, simulated gambling); 17+ (unrestricted content; **COPPA-equivalent rules still apply if the app's actual user base includes under-13s — band is not a free pass**).
- **Google Play Generative AI prohibited content policy (effective 2024).** Requires apps using generative AI to prevent generation of harmful content. **Does not differentiate by age band.** Most relevant recent update for LLM products.
- **Google Play IARC bands.** Everyone/3+ (Families Policy applies only if developer enrolls in Designed for Families); 9+ (Firebase Analytics under-13 mode required if children are users; contextual-only ad serving restrictions for Designed for Families apps); 12+ (standard ad-network eligibility, no child-directed restrictions); 16+ (full ad-network eligibility including personalised ads).
- **IARC self-classification is not binding for COPPA purposes.** FTC has not recognized IARC bands as determinative of "directed to children" status. A 12+ band does not absolve an operator with actual knowledge of under-13 users.
- **DSA Article 28 (effective Feb 2024).** Platforms likely to be accessed by minors must implement: default high-privacy settings, measures to discourage addictive design, transparency to parents, prohibition of advertising based on profiling to minors. **Binds at platform/distribution layer independent of IARC band.** *Note: this is the same Article 28 cited in Layer 1; here it is read for its distribution-layer effect (app stores as intermediaries), in Layer 1 for its statutory text. Same source, two lenses.*

**Acronym glossary (Layer 4):** IARC = International Age Rating Coalition. IDFA = Identifier for Advertisers (Apple's advertising identifier). ATT = App Tracking Transparency (Apple's consent framework). DSA = Digital Services Act (already in Layer 1 glossary).

**Empty-cell note:** Neither Apple nor Google has issued a band-specific AI-for-minors policy as of the sub-area 2 pass. The store layer is currently a *reactive* enforcement surface, not a prescriptive one.

### Layer 5 — Account-existence realities

The fact of an existing child account on a parent-managed platform (Apple's Family Sharing, Google's Family Link, child sub-profiles inside a parent's account). What does account existence mean — or not mean — for consent?

This is the layer that produces the most genuinely arguable posture in this entire synthesis. Read the three-form table below carefully — the US 3b cell is the foothold for a sub-13 floor, if counsel is willing to take it.

- **US (COPPA).** COPPA's "actual knowledge" doctrine (defined in 16 CFR Part 312.2, see Layer 1) is the controlling concept. **Account existence is not a shield.** "Actual knowledge" triggers the moment the operator "asks for — and receives — information from the user that allows it to determine the person's age" (e.g., date of birth, "What grade are you in?", "What type of school do you go to?"). A persistent identifier alone does not trigger it. **In-app chat or free-text age disclosure ("I'm 10") also constitutes actual knowledge.** Family Sharing account existence is not a shield; the shield only works if the operator engineers around acquiring age information at all. Ignorance is a defense; willful blindness is not.
- **UK (ICO Children's Code).** **No platform-side consent signal blessed by ICO.** Best-interests duty bites the moment operator has any signal that user is a child. The Code applies to "information society services likely to be accessed by children" — broader than COPPA.
- **EU (GDPR Article 8 + EDPB).** **EDPB Guidelines 05/2020 §3 make clear that the controller — not the platform — bears the verification burden.** Mechanisms relying solely on the child or a platform (e.g. a parent holding an Apple ID) are insufficient; "reasonable efforts" require an independent check. Irish DPC TikTok fine (2024, €345M) found platform-side mechanisms insufficient. *EDPB §3 paragraph-level text and Irish DPC €345M figure: secondary-source pending counsel verification.*
- **NO (Datatilsynet).** **No platform-based age-signal guidance located.** Datatilsynet's general posture is that age assurance must be effective, not nominal, and that the controller bears the verification burden.

**Headline arguable finding (US, weakest of the four regimes but a real foothold):** **In the US, 3b (rebuttable presumption) is "unclear," not "no."** That is, no regulator has *affirmatively blessed* Family Sharing / Family Link as a consent mechanism, but the actual-knowledge doctrine does have an ignorance defense. If we engineer the app so that no age information is ever collected at the controller layer (no DOB field, no grade-level capture, no in-app chat that surfaces age signals), and we treat the Family Sharing / Family Link account as a signal of parental gate, that is at least an arguable posture — **not a safe harbor**. **Counsel must rule on this.** This is the only line in the synthesis that opens room for a sub-13 floor in the US specifically. The walkthrough should not proceed without counsel's ruling on 3b.

**Three-form answers (the actual-knowledge trap is the same one in all four regimes):**

| Regime | 3a (account = consent, no collection needed) | 3b (rebuttable presumption) | 3c (actual-knowledge trap — what triggers it) |
|---|---|---|---|
| US (COPPA) | **No** | **Unclear** *(the foothold)* | Operator asks for — and receives — info that lets it determine age: DOB, grade-level, school type, or in-app chat where a child says "I'm 10". Ignorance is a defense. |
| UK (ICO Code) | **No** | **Unclear** | Any signal that user is a child triggers the best-interests duty. |
| EU (GDPR Art 8 + EDPB) | **No** | **No** | Any age-disclosing information flowing into our system activates the "reasonable efforts" verification obligation. |
| NO (Datatilsynet) | **No** | **Unclear** | Datatilsynet treats age assurance as controller-burden; no platform-side signal recognised. |

### Layer 6 — Domain-specific overlay (LLM-for-minors)

The constraints that exist *because* the product is an LLM tutor for minors, not a generic consumer service or a generic LLM product.

- **FTC 6(b) inquiry — September 2025.** Implied expectation that AI-chatbot operators route crisis signals to professional resources structurally, not via prompt improvisation.
- **EU AI Act Article 50(1) — AI disclosure to user.** Providers must ensure AI systems interacting with natural persons inform them they are interacting with an AI system, unless obvious from context. **"Obvious from context" is the carve-out; whether a one-on-one tutor persona qualifies is unsettled.**
- **EU AI Act Article 5(1)(b) — age-vulnerability exploitation.** Live legal-uncertainty surface. **No EDPB or Commission guidance yet on what counts as "exploitation due to age" for an LLM-tutor product.** This is the headline "open" question for EU.
- **EU AI Act Annex III §3 — high-risk classification for AI in education.** Applies "at all levels" of education with no age carve-out. **Reducing the age floor below 13 does NOT change AI Act classification.** A 7-year-old user and a 17-year-old user both trigger Title III obligations (DPIA, FRIA under Article 27, human oversight under Article 26, deployer notification) once Annex III obligations apply (2 August 2026). *Read in two layers — see Layer 1 for statutory text; this Layer 6 entry captures the LLM-tutor application overlay. Same source, two lenses.*
- **EU AI Act Article 5(1)(f) — emotion-inference in education.** Scope of "educational institutions" (formal school vs. consumer-facing tutor) is unsettled.
- **Our existing envelope.** `llmResponseEnvelopeSchema` and `parseEnvelope` at `apps/api/src/services/llm/envelope.ts:235-252` is the structural seam where a post-hoc safety classifier or content-filter could attach. **The envelope exists; nothing attaches to it today** (see Gap B, Section 4).
- **Structural-vs-prompt question (this layer's headline, and it gates Layer 6's claim about which floor is binding).** OpenAI Model Spec's Root > System > Developer authority layering is the closest evidence in the surveyed corpus that prompt-level is structurally insufficient for under-18 protections. **No direct regulator statement that "prompt-level is insufficient" was located.** This is Question 18 in Section 6.

**The structural-vs-prompt question is the architecturally consequential Layer 6 question — but it is *contingent*.** **If Q18 (Section 6) is answered YES by counsel — i.e., the regulator/AUP position is that prompt-level controls are insufficient for under-18 protections — then the engineering floor (Section 4) becomes the *binding* floor, not the statutory floor.** If Q18 is answered NO or UNCLEAR, the statutory floor (Layer 1) is the binding one, and the engineering gaps in Section 4 are deferred work rather than blockers. **The walkthrough cannot answer Question 19 (the partial-inclusion ruling) until Q18 is ruled.**

---

## 3. Jurisdiction × age-band matrix

The matrix's purpose is to show at a glance where sub-banding exists and where it does not. The expected finding — and the finding the matrix visualises — is that "under 13" is a single homogeneous row across all four jurisdictions. (Note: the EU row collapses a 4-tier Member-State threshold regime into a single "EU" cell; see the inline note below the matrix.)

| Jurisdiction | Under 6 | 6–9 | 9–12 | 11–12 (overlap) | 13–15 | 16–17 |
|---|---|---|---|---|---|---|
| **US (COPPA + FTC + CA AADC folded)** | COPPA; VPC required; statutory single cohort under 13; CA AADC residual obligations post-NetChoice v. Bonta; no sub-band | Same as under 6 | Same as under 6 | Same as under 6 | 13+; no COPPA jurisdiction; Children's Code-equivalent N/A; FTC §5 still applies to unfair/deceptive practices | 13+; no COPPA; FTC §5 applies |
| **UK (DPA 2018 §123 + UK GDPR + Children's Code)** | UK GDPR Art 8 (consent at 13); Children's Code "likely accessed by children" applies; Annex B band 0–5 *(unverified)* | Same as under 6; Annex B band 6–9 *(unverified)* | Same as under 6; **Annex B band 10–12 *(unverified)*** — design-treatment distinct from 13–15, *not* a different consent regime | Same as 9–12 | 13+; UK GDPR Art 8 consent personal; Children's Code still applies to under-18; Annex B band 13–15 *(unverified)* | 13+; UK GDPR Art 8 consent personal; Annex B band 16–17 *(unverified)* |
| **EU (GDPR Art 8 + AI Act + DSA)** | GDPR Art 8 (Member-State threshold applies; floor 13); Recital 38 specific protection; AI Act Art 5(1)(b)/(f) + Annex III §3 apply; DSA Art 28 applies | Same as under 6; all-Regime applies | Same as under 6; all-Regime applies | Same as 9–12 | Depends on MS threshold: 13-floor MSes (SE/DK/FI) → child consents personally; 14/15/16-floor MSes → child still under parental consent; AI Act and DSA still apply to under-18 | 16+ in default-rule MSes; AI Act and DSA still apply to under-18 |
| **NO (personopplysningsloven §5 + Datatilsynet + EEA)** | §5 age of consent 13; parental consent required; Markedsføringsloven special protection; DSA and AI Act apply via EEA incorporation *(counsel to confirm timeline)* | Same as under 6; single cohort | Same as under 6; single cohort | Same as 9–12 | 13+; child can consent personally; Markedsføringsloven still applies to under-18 | 13+; no statutory sub-banding |

**Reading the matrix:** Every cell in the "under 13" columns is a single homogeneous row. There is no consent-regime sub-banding. The only sub-banding anywhere in the matrix is the UK ICO Children's Code Annex B (10–12 / 13–15 design split), and that is a *design* distinction, not a *consent* distinction. **Conclusion: there is no statutory basis for treating 12-year-olds as a distinct legal cohort from younger children in any of the four jurisdictions in scope.** *(The Annex B design distinction is contingent on Annex B verifying — see Section 5.)*

**EU Member-State threshold note:** the EU row in the matrix above is presented as a single row, but GDPR Article 8 allows each Member State to set its own threshold between 13 and 16. The actual four tiers are: 13-floor (SE, DK, FI; plus NO via EEA, UK via retained UK GDPR); 14-floor (ES, CY, BG; PT widely reported as 13, counsel to verify); 14-or-13 (AT, IT, SI); 15-floor (FR); 16-default (DE, NL, IE, SK, and most other MSes). For an architecture decision that hinges on this, a single "EU" cell loses useful detail. Counsel should re-verify the full 27-Member-State list against the EDPB tracker before quoting in the walkthrough.

**Empty cells:** None — every cell is populated, but the cells in the under-13 columns are populated identically, which is the point of the matrix.

---

## 4. Structural-gaps callout (the "what engineering has to do" half)

Seven gaps surfaced in sub-area 4. For each: what it is, which sub-area it came from, the cite. These are the engineering work that would be required *to honor* the platform and LLM-domain floors — they are not themselves the source of any floor, and a "Gaps A and G block partial-inclusion" framing should be read as "the engineering work needed to make partial-inclusion shippable is A + G (+ B + E)," not as a feasibility veto.

| # | Gap | What | Sub-area | Cite |
|---|---|---|---|---|
| **A** | **Provider-routing by age (Gemini-under-18 AUP collision)** | No code guard, no canonical capture. An under-13 conversation routed to Gemini is a Terms-of-Service breach. The fix is an age gate on `rung`/provider selection. | Sub-area 4 | `apps/api/src/services/llm/router.ts:316-462`; Gemini API Additional Terms "Age Requirements" |
| **B** | **Output classifier as a post-envelope structural filter** | The envelope at `apps/api/src/services/llm/envelope.ts` is the attach-point, but nothing attaches. Relying on prompt-layer + model-vendor refusal. | Sub-area 4 | `apps/api/src/services/llm/envelope.ts:235-252` |
| **C** | **Crisis / human-in-the-loop escalation** | Prompt-only at `apps/api/src/services/exchange-prompts.ts:552-558`. No structural escalation channel, no guardian notification, no human-in-loop hold. | Sub-area 4 | `apps/api/src/services/exchange-prompts.ts:552-558`; FTC 6(b) Sept 2025 signal |
| **D** | **Conversation-log + memory_facts retention TTLs** | `person_retain` seam exists in `data-model.md §4.9` (lines 160–165); `retention_period` column values are explicitly deferred to counsel; no LLM-path retention ceiling in code. | Sub-area 4 | `apps/api/src/services/memory/cascade-delete.ts:1-39`; `data-model.md §4.9` |
| **E** | **AI-disclosure to user (EU AI Act Art 50)** | No structural user-visible disclosure; relying on the "obvious from context" carve-out. | Sub-area 4 | `apps/api/src/services/llm/router.ts:214, 218, 220`; AI Act Art 50(1) |
| **F** | **api-side Sentry PII scrubbing for under-13** | Mobile is structurally gated at `apps/mobile/src/lib/sentry.ts:166-206`; api-side has no age gate, no scrub/denyUrls/beforeSend config. | Sub-area 4 | `apps/api/src/services/sentry.ts:24-46` |
| **G** | **`AgeBracket` two-way union** | `packages/schemas/src/age.ts:1` = `'adolescent' \| 'adult'`. The type can't model a sub-13 floor change at all. The safety preamble at `apps/api/src/services/llm/router.ts:207-226` collapses under-13s into "adolescent" with no distinction. | Sub-area 4 | `packages/schemas/src/age.ts:1`; `apps/api/src/services/llm/router.ts:207-226` |

**The engineering work required to make a sub-13 floor shippable** (assuming counsel rules partial-inclusion legally defensible per Q19a in Section 6): **(a)** a new `AgeBracket` value (Gap G); **(b)** age-gated routing that excludes Gemini for any sub-18 user (Gap A — this is honoring the *Layer 3 platform floor*, not creating an engineering floor of its own); **(c)** some form of post-envelope classifier (Gap B — needed if Q18 is answered YES); **(d)** a user-visible AI disclosure (Gap E — required by AI Act Art 50). Gaps C, D, F are additional required work for sub-13 *regardless* of the partial-inclusion ruling, because they reflect existing legal floors that are not currently met for any under-13 user (which we don't have today, but would).

**Cost framing, not feasibility framing:** This is a cost claim, not a feasibility veto. Each of the four items is bounded engineering work. The walkthrough should not hear "engineering says we cannot do partial-inclusion"; it should hear "engineering says partial-inclusion requires A + B + E + G, and the cost of those four items is the variable that Q19b (Section 6) is asking counsel to weigh against the cost of holding 13+ and shipping the gaps instead."

---

## 5. Source-verification flag

This section is the **worklist for counsel in the room.** The verified URLs can be read end-to-end with confidence. The unverified URLs are real and authoritative, but the exact text was not directly confirmed by us — counsel should treat these as the verification backlog.

### Real URL, primary text 403'd / unverified

- **FTC COPPA Rule final amendments (90 FR 16977, 22 April 2025).** Cited via IAPP summary. Direct ftc.gov fetch returned 403.
- **FTC press releases for *Epic Games* ($275M, Dec 2022) and *Google/YouTube* ($170M, Sept 2019).** Dollar amounts cited from general knowledge and IAPP enforcement tracker; not re-verified from original press releases.
- **FTC 6(b) order (11 Sept 2025) — AI-chatbot operators.** Existence publicly reported via multiple secondary sources. Primary order text 403'd on every URL variant attempted.
- **FTC "crackdown on deceptive AI tutoring" press release (Sept 2024).** Direct ftc.gov fetch 403'd.
- **ICO Children's Code primary text.** ico.org.uk pages returned HTTP 403 throughout the sub-area passes. All ICO citations in this synthesis derive from the Wikipedia summary and secondary law-firm summaries.
- **ICO Children's Code Annex B (developmental bands 0–5 / 6–9 / 10–12 / 13–15 / 16–17).** Widely cited; **Annex B exact wording was not directly confirmed.** This is the most consequential unverified citation in the synthesis — if Annex B is different from the widely-cited five-band framing, the design-seam argument in Section 1 collapses, and the UK matrix row in Section 3 needs revision. *Counsel to verify Annex B against the live ICO document before quoting.*
- **EDPB Guidelines 05/2020 PDF body.** Only the landing page was parsed. Paragraph-level citations (specifically §3 on platform-side consent) were not directly verified.
- **Datatilsynet June 2024 Nordic DPA declaration.** Identified at headline level only; full text not retrieved.
- **OpenAI Usage Policies (developer).** 403'd in sub-area 4 pass.
- **Anthropic "products serving minors" Help Center article.** 302→404 in sub-area 4 pass.
- **Google Play Generative AI policy (effective 2024).** URL marked "(verify)" in sub-area 2; primary text not directly fetched.
- **Apple App Review Guidelines §1.4.1, §5.1.1 (updated 2024).** URL marked "(verify)" in sub-area 2; primary text not directly fetched.
- **DSA Article 28 Commission guidelines (May 2025).** Existence confirmed; primary text not directly fetched. *Note: previously labeled "DSA Art. 28a" in this synthesis — that is a misnumbering; the correct citation is Art 28.*
- **California AADC (AB-2273) post-NetChoice v. Bonta.** Enjoined in part by 9th Cir. 2024; what remains enforceable needs counsel review.
- **EU Member-State threshold list (per EDPB tracker).** The 27-Member-State list is cited from secondary summary (EDPB landing page, IAPP, Better Internet for Kids); counsel to verify the full list before quoting any individual Member State.

### Real URL, verified

- `https://artificialintelligenceact.eu/article/5/` (Art 5(1)(b) and (f)) — *read in Layer 1 (statute) and Layer 6 (LLM-domain overlay); same source, two lenses.*
- `https://artificialintelligenceact.eu/article/50/` (Art 50(1))
- `https://artificialintelligenceact.eu/annex/3/` (Annex III §3) — *read in Layer 1 and Layer 6; same source, two lenses.*
- `https://gdpr-text.com/read/article-8/` and `https://gdpr-info.eu/recitals/no-38/` (GDPR Art 8 + Recital 38)
- `https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en` (EDPB Guidelines 05/2020 landing page; PDF body unverified)
- `https://ai.google.dev/gemini-api/terms` (Gemini API Additional Terms "Age Requirements")
- `https://model-spec.openai.com/2025-12-18.html` (OpenAI Model Spec)
- `https://www.anthropic.com/legal/aup` (Anthropic Usage Policy "Do Not Compromise Children's Safety")
- `https://lovdata.no/dokument/NLE/lov/2018-06-15-38` (Norway personopplysningsloven)
- `https://lovdata.no/dokument/NL/lov/2009-01-09-2` (Norway Markedsføringsloven)
- `https://en.wikipedia.org/wiki/Children%27s_Online_Privacy_Protection_Act` and `https://en.wikipedia.org/wiki/COPPA` (COPPA summary)
- `https://en.wikipedia.org/wiki/Age_appropriate_design_code` (UK Children's Code summary)
- `https://www.law.cornell.edu/cfr/text/16/part-312` (16 CFR Part 312 source note — includes the COPPA "actual knowledge" Rule text)

**The synthesis can be read end-to-end on the verified URLs alone.** The unverified URLs support the Layer 2 / 3 / 4 enforcement-signal density but are not load-bearing for the Section 1 headline. **The single load-bearing unverified citation is ICO Annex B** — it is the sole statutory source for the design-seam argument. If counsel rules Annex B does not contain the five-band framing, the design-seam collapses to "no statutory sub-banding anywhere in scope" (a slightly stronger version of the Section 1 finding), and the walkthrough's only arguable posture for a sub-13 floor is the US Layer-5 3b (Section 2 Layer 5).

---

## 6. Open questions for the walkthrough

The 19 questions below are triaged into three buckets. **Bucket A is what the walkthrough actually decides today.** Bucket B is homework counsel can take away and report back on. Bucket C is defer — the workstream isn't mature enough yet, or the question is interesting but not load-bearing for the floor ruling.

**Dependency note:** Question 18 (structural-vs-prompt) is a *prerequisite* to Question 19. The walkthrough should rule Q18 first, because Q19b's cost comparison depends on whether Gap B (output classifier) is mandatory or optional. If Q18 is answered NO (prompt-level *is* sufficient), Gap B is optional and the engineering cost of partial-inclusion is lower; if YES, Gap B is mandatory and the cost rises.

### Bucket A — Decide today (the walkthrough's job)

**Q18 — The structural-vs-prompt question.** Has any regulator (FTC, ICO, EDPB, Datatilsynet, AI Office) explicitly stated that prompt-level controls are insufficient for under-18 protections? Or is the OpenAI Model Spec Root > System > Developer layering the strongest evidence we have, with no direct regulator statement on the record? *This question gates Q19 below.* **A "NO/UNCLEAR" answer preserves statutory floor as binding; a "YES" answer makes engineering floor binding.**

**Q19a — The partial-inclusion path-defensibility ruling.** Given (a) statutory homogeneity across all four jurisdictions (Section 1, Section 2 Layer 1), (b) Gemini's 18-floor as a binding Layer 3 platform constraint, (c) the seven unaddressed engineering gaps (Section 4), (d) the UK ICO Annex B design seam (assuming it verifies), and (e) the unsettled US Layer-5 3b posture, **is there a counsel-defensible path to a partial-inclusion floor (e.g., `11+` or `9+`) for v1 in any of the four jurisdictions?** The expected ruling options are: **YES (US only, 3b posture), YES (UK only, contingent on Annex B), YES (multi-jurisdiction, narrow scope), NO (all four jurisdictions).**

**Q19b — The cost-comparison ruling.** If Q19a is YES in any jurisdiction, **is the engineering cost of that partial-inclusion path materially less than the cost of holding the floor at `13+` and shipping the seven gap-fixes (Section 4) instead?** This requires the parallel effort-estimation stream's findings. *Ruling options: YES (partial-inclusion is cheaper), NO (13+ is cheaper), UNDECIDED (need more cost data).*

### Bucket B — Homework; counsel to verify and report back

These are primary-source verification questions where the URL is real but the exact text was not directly confirmed. Counsel can re-verify in the room or take away.

- **Q1 — ICO Annex B exact wording.** Are the developmental bands truly 0–5 / 6–9 / 10–12 / 13–15 / 16–17? Is the 10–12 vs 13–15 design distinction a binding recommendation or illustrative? *This is the most consequential homework question; it is the load-bearing unverified citation in Section 1.*
- **Q4 — California AADC (AB-2273) post-NetChoice v. Bonta.** What obligations remain enforceable? Is the age-estimation duty live, dead, or partially live?
- **Q6 — EDPB Guidelines 05/2020 §3 — paragraph-level reading.** What does §3 actually say about platform-side vs. controller-side verification? Is the Irish DPC TikTok reasoning (€345M) consistent with EDPB, or a national-DPC stricter reading?
- **Q11 — The Netflix-profile analogue.** Has any regulator (FTC, ICO, EDPB, Datatilsynet) ever issued a statement addressing (parent-owned account + child sub-profile + parent-side PIN-gating) as a consent mechanism? The four sub-area passes found none.
- **Q12 — COPPA "actual knowledge" triggered by in-app chat.** Is there a named FTC enforcement case where actual knowledge was triggered specifically by free-text age disclosure in chat? The proposition is well-supported by the general FTC standard but not confirmed by a named case.
- **Q16 — FTC 6(b) order text (Sept 2025).** What specific conduct is the FTC inquiring about? Any explicit standard for crisis handling, age assurance, or content filtering?
- **Q17 — FTC April 2025 COPPA Rule final amendments — full text.** What does the retention cap require? What does "flexible age-assurance" actually permit? Implementation timeline?

### Bucket C — Defer to follow-up (interesting, not load-bearing for v1 floor)

- **Q2 — EU AI Act Art 5(1)(b) "exploitation of vulnerabilities due to age" as applied to an LLM tutor.** Any unpublished/draft guidance? Is the standard "designed to exploit" or "likely to exploit regardless of intent"? *(Live legal-uncertainty surface; will resolve in 2026–2027 enforcement cases.)*
- **Q3 — AI Act Art 5(1)(f) scope — is a consumer-facing AI tutor within "educational institutions"?** *(Unsettled; not load-bearing for v1 floor ruling because it cuts equally across age bands.)*
- **Q5 — Datatilsynet position on AI tutors for minors.** *(Datatilsynet has not spoken publicly; we cannot rule on what has not been said.)*
- **Q7 — Apple's 2024–2025 policy on LLM products aimed at minors.** *(Reactive enforcement only; not prescriptive.)*
- **Q8 — Google's enforcement of its 2024 Generative AI policy in the under-13 context.** *(Has Google rejected or removed any LLM-for-minors apps? Unknown.)*
- **Q9 — IARC self-classification vs. COPPA "directed to children" status.** *(No turning-case located; IARC is not determinative.)*
- **Q10 — DSA Article 28 enforcement against app stores.** *(Commission investigations ongoing; no public action against Apple/Google specifically as of sub-area 2 pass.)*
- **Q13 — Most recent regulator statement on platform-based age signals.** *(EDPB Guidelines 05/2020 still the controlling document; no 2024–2025 update located.)*
- **Q14 — Verbatim OpenAI Usage Policies for developers.** *(403'd; OpenAI Model Spec is the only verified primary source we have on OpenAI's under-18 posture.)*
- **Q15 — Verbatim Anthropic "products serving minors" Help Center article.** *(302→404; Anthropic Usage Policy is the only verified primary source.)*

### Triage summary

- **Decide today (3 questions):** Q18, Q19a, Q19b. The walkthrough's outcome is determined by these three.
- **Homework (7 questions):** Q1, Q4, Q6, Q11, Q12, Q16, Q17. Counsel re-verifies; findings may shift Q19a (most likely Q1 if Annex B is not as widely reported) or Q19b (Q17 retention-cap specifics affect the cost comparison).
- **Defer (10 questions):** Q2, Q3, Q5, Q7–10, Q13–15. Document for a future walkthrough or for the parallel effort-estimation stream.

---

*End of synthesis. The walkthrough decides.*
