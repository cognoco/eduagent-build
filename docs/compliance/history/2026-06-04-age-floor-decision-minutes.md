# Age-Floor Decision — Counsel Session Minutes

**Date:** 2026-06-04
**Subject:** Minimum age floor for launch — what it costs, and the decision
**Status:** Historical counsel-session record. The 13+ floor remains decided; country recommendations and launch controls are superseded by the 2026-07-23 [`13+ EEA launch-country ruling`](../2026-07-23-13-plus-eea-launch-country-ruling.md).
**Context:** Follow-up to the 2026-06-03 compliance session. Product = a parent-mediated AI homework tutor on the *substitute* model (the kid self-serves; the parent buys and oversees, rather than co-uses). The floor sets the entire under-13 compliance surface, so it was settled first.

---

## 0. Recommended way forward (2026-06-05 follow-up)

**Launch MentoMate as a 13+ teen/family learning app, not an 18+ adult-only app and not a global release.**

The practical posture from the follow-up research is:

1. **Keep the launch floor at 13+.** Block under-13 completely. Do not serve 10-12 until the COPPA/VPC/provider phase is deliberately built.
2. **Keep parent consent through 16 at launch.** This is stricter than some local rules, but it matches the current conservative consent shape and avoids fragile per-country teen-consent branching for the first release.
3. **Launch by country allowlist, not worldwide.** Open only markets where the child/privacy/provider posture is understood. Treat Mainland China, Russia, India, Brazil, and unmapped LATAM markets as store-blocked until country-specific launch work exists.
4. **Use both store availability and in-app gating.** App Store / Google Play country is useful, but not enough. Ask date of birth and country of residence before account/LLM access; use IP/store/billing signals as risk checks; fail closed on conflicts.
5. **Use a minor-compatible LLM provider route.** Google Gemini API / Google Cloud generative-AI services are not launch candidates under current default terms unless Google gives written permission or different terms. OpenAI/Anthropic-style API routes remain plausible with DPA/no-training/retention controls and child-safety safeguards.
6. **Keep 18+ only as a fallback product pivot.** It would simplify child-consent work, but it would also prevent honest teen/homework positioning and materially change the product.

Gemini clarification: this is a product/contract-route issue, not a claim that minors can never use Gemini. Google-operated Gemini Apps, supervised accounts, and Workspace for Education can be available to minors under Google-controlled terms. That does **not** automatically make the public Gemini API or Google Cloud generative-AI service terms usable for MentoMate's own minor-facing app.

Decision sentence to carry forward: **MentoMate launches 13+, guardian-gated through 16, country-allowlisted, no Kids Category, no under-13 access, no high-complexity market until policy approval.**

## 1. Why not below 11

- **Legally, 7 vs 11 is identical.** COPPA is a binary cliff at 13 — a 7-year-old and an 11-year-old impose the *same* obligations (verifiable parental consent, data minimization, no behavioural ads). There is no sub-13 gradient, so going lower than 11 buys **zero** legal relief.
- **The only real difference below 11 is product fit.** The product assumes a learner who *reads to learn* — prose explanations, a text/voice dialogue, self-direction. The voice register bottoms out at "early teen", and the young-child machinery was deliberately removed (commit `970a82a5`). A 9–10-year-old can't reliably self-serve a dialogue tutor, so under the substitute model the product *fails to substitute* — the parent ends up supervising the thing meant to free them.
- **Conclusion:** below 11 adds cost and scrutiny with no product or legal upside. The floor is never below 11.

## 2. What 11+ vs 13+ actually means

The choice that changes anything is **11 vs 13** — that is the COPPA cliff.

| | **11+** | **13+** |
|---|---|---|
| COPPA (US under-13) | **Applies** — "directed to children" | **Gone** (neutral age gate at 13) |
| Parental-consent flow | already built (serves ≤16) | already built |
| Verification method | email-link **insufficient** for COPPA | email-link **sufficient** (GDPR) |
| Geo-detection | must **re-add** (scope COPPA to US) | not needed |
| EU consent (13–16; DE/PL = 16, FR = 15) | required | **still required** (unchanged) |
| Net new build | **VPC vendor + geo + COPPA legal** | **~2 constants + copy** |

Key facts:
- The GDPR parental-consent lifecycle is **already built and already serves everyone ≤16, location-blind** (`apps/api/src/services/consent.ts`). So **13+ is nearly free** — change `MINIMUM_AGE` 11→13 (`consent.ts:197`) + the age-gate copy. The system was over-built for the harder case.
- **11+ adds the one thing not built:** a **COPPA-grade verifiable parental consent** method. Email-link is GDPR-adequate but not COPPA-grade, and because conversations are disclosed to LLM providers, COPPA holds us to the higher bar. That means a VPC-vendor integration + re-adding geo + a COPPA legal review.
- **13+ is not "compliance-free."** EU parental consent for 13–15/16-year-olds (Germany/Poland set 16, France 15), the full minor-protection layer (AADC, AI Act, DSA), and the provider-data baseline all remain.

## 3. COPPA legal — what it is

A **bounded, mostly one-time** engagement with a privacy specialist (US COPPA; 16 CFR Part 312, as amended 2025). It is a closed checklist, not an open tab. Deliverables:
- Children's privacy-policy section + direct-notice-to-parents copy.
- Confirmation the chosen VPC method is FTC-approved and correctly applied.
- Written data-retention policy + security program (mandatory since the 2025 amendment).
- The "directed to children" determination.
- **The product-shaping item:** whether disclosing a child's conversation to the LLM provider needs *separate* parental consent, or is covered as "support for internal operations". The answer depends on how tightly the provider is contractually pinned — a **no-training / Zero-Data-Retention DPA** keeps it "internal operations" (no separate consent); a loose provider makes it a disclosure needing its own consent. So the provider-DPA work and the COPPA analysis reinforce each other.
- **Cost:** low-thousands to low-five-figures USD for the specialist engagement, mostly one-time (recurs only on rule/data-flow changes). An FTC **Safe Harbor** program (PRIVO, kidSAFE) is an *alternative* route bundling audit + certification + seal — but it is **not** a cheaper one-time substitute: membership pricing is quote-only, and 16 CFR §312.11 mandates a comprehensive review at least annually, so it is a recurring membership cost. *(Corrected 2026-06-05 verification pass: previously framed Safe Harbor as the cheaper one-time option.)* **Exists only at 11+.**

## 4. Decision

**Launch at 13+. Add 10+ / under-13 later as a demand-triggered phase 2.**

**Rationale:** pre-launch with no demand data, defer the only specialist cost (VPC vendor + geo + COPPA legal) until under-13 demand proves it worth the spend. Reversibility runs the right way — lowering the floor later is purely *additive*, and 13+ ships on consent infrastructure that is already done. Builds COPPA against a proven market rather than on spec.

This **supersedes the "Strictly 11+" product constraint** in `CLAUDE.md` (to be reconciled at implementation).

**Guardrails to keep "10+ / under-13 later" cheap (must hold at launch):**
1. **Keep the COPPA scaffolding warm** — do not delete the dormant `'COPPA'` consent type (defined in `packages/schemas/src/consent.ts:4` and the `consent_type` DB enum; `consent.ts:944` is only a comment referencing it) or the age-register tuning. The floor has **two** code levers, not one: `MINIMUM_AGE` (`consent.ts:197`) and the independently hardcoded 11-floor in `birthYearSchema` (`packages/schemas/src/profiles.ts:52`) — the schema is the actual request-boundary rejector, so both must move together (consistent with the "~2 constants" cell in §2 and the gap list below). Annotate "retained for 10+ / under-13 phase 2" + a guard test. *(Corrected 2026-06-05 verification pass: previously claimed `MINIMUM_AGE` was the single lever.)*
2. **Instrument the under-13 bounce count** at the age gate (`belowMinimumAge`, `consent.ts:275`) from day one — this is the demand signal that triggers the 10+ / under-13 build. Otherwise "later" becomes "never".
3. **Marketing discipline** — neutral age gate, age-neutral copy; do not court 11–12s before VPC exists (else "actual knowledge" of under-13s with no COPPA controls).
4. **Keep the under-13 rejection wired.**

**Ships regardless of floor:** the provider-data baseline — a minor-compatible LLM provider route with DPA/no-training/retention controls, Chapter V transfers, endpoint allowlist, and payload minimization. The earlier "Gemini paid/Vertex tier" assumption is superseded by the 2026-06-05 follow-up below: Google Gemini API / Google Cloud generative-AI services are not launch candidates for a teen-facing app under current default terms unless Google gives written permission or different terms. This provider baseline is launch-blocking at every floor, and also what keeps the future 10+ / under-13 phase simpler.

## 5. Follow-up market overview (2026-06-05)

**Status:** research overview, not legal advice. Use this as the launch-market policy map until counsel replaces it with a signed jurisdiction table. The table answers a practical question: **where can the app be downloadable at launch, and where must the store listing or in-app account creation fail closed?**

### How to read this

- **Store block** means do not make the app downloadable in that country/region until a country-specific launch plan exists.
- **In-app parent gate** means app-store availability can be coherent if the app collects residence, computes the jurisdiction class, and blocks account/LLM access until the required parent/guardian authorization exists.
- **Self-serve 13+** means the under-13 floor still blocks 12-and-under, but a 13-year-old can provide the privacy consent needed for the core tutoring service in that jurisdiction.
- If the code keeps the current conservative shape (parent consent for everyone <=16, location-blind), the app is safer than the per-country rules below, but rougher UX. If we relax by geography, these rows become policy config.

### Operating matrix by user category

| User category | Data storage | LLM access | Consent level | Does a Netflix-style parent account avoid consent? |
|---|---|---|---|---|
| 18+ adult | Normal adult privacy baseline: notice, lawful basis, retention schedule, export/delete rights, security. | Yes, if provider terms allow and DPA/no-training/retention controls are in place. | Adult's own consent, contract, or other lawful basis. | Not relevant. |
| 13+ self-consenting teen | Store only necessary tutoring/profile/progress data. Still treat as under-18: child-readable notice, high privacy defaults, no targeted ads/profiling, clear retention. | Yes with a minor-compatible provider. Do not use Google Gemini API / Google Cloud generative-AI services for a teen-facing app absent written permission or different terms. | Teen can consent for privacy processing in that geography. Parent may still pay/manage. | Not needed for consent. Useful for billing, family oversight, and child profiles. |
| 13+ non-self-consenting teen | Before approval: collect only age/residence/parent-contact data needed to run the consent flow. After approval: same child-minimized storage. | Gate LLM until parent/guardian authorization exists, then route only through a minor-compatible provider. | Parent/guardian authorization under GDPR-style "reasonable efforts," not COPPA VPC. Launch default can remain lightweight: parent/guardian account or email confirmation, policy-versioned consent receipt, and no LLM before consent. Escalate to payment-card/store-family/vendor attestation only if counsel flags a specific jurisdiction or LLM disclosure pattern as higher-risk. | No. It can be the UX mechanism for consent if the adult is identified and the consent receipt is stored. |
| 10-12 / under local threshold | Highest minimization. Before consent: age band + parent contact only. After consent: necessary learning data, strict retention, parent review/delete rights. | No open LLM until consent + provider controls are complete. In the US, under-13 requires COPPA-grade VPC and a tightly controlled provider posture. | US: COPPA VPC. EU/UK/NO: parent authorization with reasonable efforts. Other countries: local rule, often parent/legal representative. | No. It is account structure, not a legal bypass. In the US it only works if it includes COPPA-grade VPC. |

### LLM provider baseline from the research thread

| Provider route | 13+ launch | 10+ / under-13 phase 2 |
|---|---|---|
| Google Gemini API / Google Cloud generative-AI services | Do not use for MentoMate's teen-facing app under the public/default terms unless Google gives written permission or different terms. Current API/Cloud gen-AI terms restrict customer API clients directed toward or likely accessed by under-18s. This is separate from Google-operated Gemini Apps / Workspace for Education routes that may serve minors under different terms. | Same problem, worse. Needs written Google permission/special terms plus child-data controls. |
| OpenAI API | Plausible with under-18 safeguards, DPA/no-training posture, endpoint allowlist, child-readable AI disclosure, and safety filters. | Plausible only after COPPA/GDPR child-consent stack is live. OpenAI says not to process personal data of children under 13 or below the applicable digital-consent age without Zero Data Retention. |
| Anthropic API | Plausible with Anthropic's minors safeguards: age assurance, filtering/moderation, monitoring/escalation, disclosures, and compliance with child privacy laws. | Plausible only with the same safeguards plus Zero Data Retention / enterprise terms where required by the child-data posture. |
| Self-hosted/local model | Provider-permission issue avoided. | Provider-permission issue avoided. We own quality, safety, moderation, retention, security, and evaluation burden. |

### Launch country matrix

| Country / region | Launch posture | Consent floor for a 13+ app | Reason to care |
|---|---|---|---|
| United States | Allow 13+; block under-13 at account creation | Self-serve at 13 for COPPA purposes | COPPA is the binary cliff at under 13. Monitor state app-store accountability laws separately. |
| United Kingdom | Allow 13+ | Self-serve at 13 | UK GDPR / Data Protection Act 2018 sets the ISS consent age at 13; Children's Code still applies to all under-18 users. |
| EU/EEA 13 group: Belgium, Estonia, Finland, Iceland, Latvia, Malta, Norway-current, Portugal, Sweden | Allow 13+ | Self-serve at 13 | GDPR Article 8 permits member-state thresholds down to 13. Norway is current 13; monitor proposals to raise some online consent/age-assurance thresholds. |
| New Zealand | Allow 13+ with child-safeguard baseline | No fixed digital-consent age found; 13+ is a practical self-serve launch assumption | Privacy Act applies to children/young people; use child-readable notices, minimization, PIA, and AI safeguards. |
| Singapore | Allow 13+ | Self-serve at 13 | PDPC guidance requires parent/guardian consent below 13. |
| Canada | Allow only with province-aware gate, or use Canada-wide parent gate for age 13 | Practical rule: parent gate age 13; self-serve 14+ unless province-gated | Federal OPC says under-13 generally cannot meaningfully consent; Quebec Law 25 requires parent/tutor consent under 14. Store country alone cannot distinguish Quebec. |
| Australia | Allow only with parent gate for 13-14 | Practical rule: parent gate under 15; self-serve 15+ | OAIC says consent capacity is case-by-case; if not assessing individually, presume 15+ capacity. Draft Children's Online Privacy Code points in the same direction. |
| EU age-14 group: Austria, Bulgaria, Cyprus, Italy, Lithuania, Spain | Allow only with in-app parent gate for age 13 | Self-serve at 14 | GDPR Article 8 national thresholds are above the 13+ launch floor. |
| South Korea | Allow only with in-app parent gate for age 13 | Self-serve at 14 | PIPA requires legal-representative consent when consent is needed for children under 14. |
| EU age-15 group: Czechia, Denmark, France, Greece, Slovenia | Allow only with in-app parent gate for ages 13-14 | Self-serve at 15 | Denmark is now 15; older trackers showing 13 are stale. |
| Ecuador | Allow only with in-app parent gate for ages 13-14 | Self-serve at 15 for ordinary personal data; sensitive/automated processing needs counsel | Ecuador rules require legal representative involvement below 15 and treat children's/adolescents' data as specially protected. |
| EU/EEA age-16 group: Croatia, Germany, Hungary, Ireland, Liechtenstein, Luxembourg, Netherlands, Poland, Romania, Slovakia | Allow only with in-app parent gate for ages 13-15 | Self-serve at 16 | GDPR Article 8 national thresholds are above the 13+ launch floor. |
| Switzerland | Allow only with conservative parent gate for ages 13-15 until counsel confirms otherwise | No fixed statutory digital-consent age; conservative 16 policy | Swiss law does not map cleanly to GDPR Article 8. Use 16 as the safe product rule unless Swiss counsel approves a lower threshold. |
| Japan | Allow only with conservative parent gate for ages 13-15 until counsel confirms otherwise | No fixed current age; conservative 16 policy | PPC guidance says legal-representative consent is generally needed for children around 12-15 who cannot judge consequences; a 2026 APPI bill would introduce explicit under-16 child-data rules. |
| Paraguay | Allow only with in-app parent gate for ages 13-15 | Self-serve at 16 for ordinary data; sensitive data for 16-17 needs teen + parent/guardian authorization | New 2025 personal-data law has specific child/adolescent treatment and a sensitive-data rule for 16-17. |
| Chile | Counsel-gate before broad launch; if launched, parent gate under 14 and treat 14-15 carefully | Law 21.719 effective 2026-12-01: under 14 parent/legal rep; 14-15 parent for sensitive data | The transition and sensitive/free-text/AI-tutor risk make a simple 13+ self-serve launch unattractive without counsel. |
| Peru | Counsel-gate or parent gate under 14 | Under 14 parent/tutor; 14-17 may consent if maturity/language conditions are met | Needs implementation detail for capacity, notices, and child-friendly language. |
| Brazil | Store block until Brazil-specific launch plan | Under-18 digital-child regime, not a simple Article-8 age table | LGPD Article 14 covers children/adolescents; ECA Digital took effect in 2026 and adds broad obligations for digital products likely accessed by minors, including age assurance, parental supervision, profiling/ads, and generative-AI transparency/risk work. |
| India | Store block for teen self-serve; country-specific under-18 parent flow required | Under 18 requires verifiable parent consent before child personal-data processing | DPDP treats anyone under 18 as a child for this purpose. Do not launch India as 13+ self-serve. |
| Mainland China | Store block until China-specific legal/product launch | Under 14 guardian consent under PIPL; broader under-18 online-minors and GenAI obligations | Not just an age gate. Public AI service, content rules, data export, algorithm/GenAI filings, minor anti-addiction/overreliance measures, and local distribution all need China-specific review. Hong Kong, Macau, and Taiwan require separate checks. |
| Russia | Store block until Russia-specific legal/product launch | Treat minors as counsel-gated; parent/legal-representative consent likely needed for under-18 processing | The larger blocker is operational: Russian-citizen data localization, cross-border-transfer rules, child harmful-information/age-rating law, and current enforcement/sanctions risk. |
| Mexico, Colombia, Costa Rica, Uruguay | Store block or counsel-map before teen self-serve | Treat under-18 as parent/legal-representative gate until counsel confirms a teen self-consent path | These regimes do not give the clean GDPR/COPPA-style 13/14/15/16 map needed for safe self-serve. |
| Argentina, Panama, Dominican Republic, Guatemala, Bolivia, Venezuela, El Salvador | Store block until mapped | Unknown / counsel required | Do not rely on regional analogy. Map the country before enabling downloads or teen self-serve. |

### What the overview still must not hide

1. **Store country is only a signal.** Apple/Google storefront, billing country, IP country, and declared residence can diverge. For minors, collect declared residence, read coarse server-side IP/store/billing signals where available, and if any signal says a stricter country or signals conflict, fail closed. Store the decision snapshot: declared residence, IP country, store/billing country if available, timestamp, and policy version.
2. **Article 8 is not the whole privacy analysis.** GDPR/UK GDPR still require lawful basis, DPIA, child notices, minimization, data-subject rights, processor contracts, transfer mechanism, retention, and age-appropriate design.
3. **The AI layer is separate from the age floor.** Even at 13+, provider terms and app-store AI policies remain launch blockers. The tutor must disclose AI use, filter unsafe content, support reporting/escalation, avoid targeted ads/profiling, and avoid sending unnecessary child data to providers.
4. **Voice and free-text raise sensitivity.** Do not retain raw audio unless explicitly scoped. Avoid biometric identification. Treat spontaneous disclosure of health, family, school, location, or special-category facts as a minimization and safety-design problem, not just generic tutoring content.
5. **No social/community layer without a new review.** Messaging, public profiles, leaderboards, peer-to-peer sharing, creator tools, or recommendation feeds would pull in social-media/minor-safety regimes that this overview intentionally does not price.
6. **If we learn a user is under 13 despite the gate, delete/suspend rather than "pretend not to know."** A 13+ floor reduces COPPA scope; actual knowledge of an under-13 user reactivates the under-13 handling duty for that user.

### Broader compliance coverage check

**Status:** added after the 2026-06-05 double-check. This table answers a different question from the country matrix: not "where can we launch?", but "which legal/product surfaces are already covered by this decision note, and which still need their own launch work?"

| Area | Covered in this document today? | What still needs to be explicit before launch |
|---|---|---|
| Lawful basis and the consent trap | Partial. The note says Article 8 is not the whole analysis and consent cannot be treated as magic. | Build the ROPA/DPIA lawful-basis map per processing purpose: account, profile, learning history, LLM tutoring, safety, telemetry, support, billing, and marketing. Do not rely on a child's contract capacity or a bundled T&C acceptance for profiling/personalization. |
| Age verification / age assurance | Partial. The country matrix and implementation gaps require DOB, residence, store/IP/billing conflict handling, and fail-closed behavior. | Define the actual age-assurance design: DOB + country/residence + risk signals at 13+ launch; no invasive ID by default; escalation only for conflicts, high-risk jurisdictions, or under-13/VPC phase. |
| DPIA | Mentioned as part of the broader GDPR surface, but not worked through here. | Treat the DPIA as a hard launch gate for systematic children's-data processing and LLM tutoring. It must cover child risks, AI/provider flows, Sentry/telemetry, age assurance, profiling, and mitigations. |
| Data minimization and purpose limitation | Covered in principle through lifecycle, provider minimization, no raw audio, and no open-ended input before consent. | Convert this into enforceable product constraints: minimum pre-consent fields, no free-text before gate, strict raw photo/audio/transcript retention, endpoint allowlist, and logging/Sentry scrubbing. |
| Profiling / automated decision-making | Partial. The note flags personalization/profiling and child safeguards, but not GDPR Article 22 separately. | Decide whether any recommendation, scoring, level placement, risk flag, or paywall decision has legal/significant effects. Keep tutoring personalization advisory and reversible; avoid automated decisions that materially affect the child without human override. |
| International transfers and processor contracts | Covered. Provider table and source anchors include DPAs, Chapter V transfers, DPF/SCC/TIA checks, and Google/Gemini route limits. | For the actual chosen providers, store contract version, subprocessor list, transfer mechanism, retention/no-training terms, and the launch-date DPF check. |
| DPO | Mentioned in broader GDPR surface but not in a table before this one. | Appoint or outsource a DPO before launch if counsel confirms large-scale monitoring / systematic child processing. Publish DPO contact in the privacy policy. |
| UK Age Appropriate Design Code | Covered at a high level through AADC references and the no-manipulation/no-location/no-social warnings. | Run the 15-standard checklist explicitly: high privacy by default, no nudge techniques, no detrimental use of data, geolocation off, parental controls transparent to child, and child-readable notices. |
| California AADC / US state child-design laws | Not covered enough. | Treat as a watch/counsel-gate item. California AADC status is litigation-sensitive and partly effective/partly enjoined as of 2026; other states have their own age-assurance/minor-design rules. Do not generalize from COPPA alone. |
| COPPA | Covered for under-13: VPC, direct notice, parent rights, retention/deletion, provider scope, and actual-knowledge handling. | For 13+ launch, keep neutral under-13 rejection and bounce-count instrumentation. For 10+ phase, build VPC, direct notice, parent dashboard, deletion, provider scope, and negative-path tests before access. |
| EU AI Act | Covered for AI disclosure, provider baseline, and voice/facial emotion-inference avoidance. | Add the Art. 50 AI-tutor disclosure in product UI before the deadline; keep voice as transcription-only; avoid biometric/emotion inference; check whether any future school/evaluation feature becomes high-risk. |
| Manipulation / dark patterns | Covered at a high level: no pressure-sell, no guilt/streak manipulation, no persuasive child nudges. | Audit reminders, streaks, upsells, tutor tone, and cancellation/account flows against AADC, DSA dark-pattern rules, and child-consumer standards. |
| EU DSA / UK Online Safety Act / content safety | Partial. The note says no social/community layer without new review and that AI safety matters. | Add a content-safety workstream for AI-generated text even without user-to-user messaging: harmful-content taxonomy, reporting/escalation, moderation logs, risk assessment, and UK/EU counsel check. If UGC or sharing is added, redo the review. |
| CSAM / image-upload obligations | Partial. The 10+ table mentions photos/OCR and SDK gating, but CSAM is not called out. | If camera, image upload, OCR, or attachments are enabled, define CSAM handling, reporting/escalation, storage minimization, and support-team procedure before launch. |
| Consumer billing and minors' contracts | Covered at a high level through adult billing / parent account assumptions. | Enforce adult-owned subscription and family profile rules. Verify the known double-billing risk: teen on family plan must not also start an independent store subscription without clear entitlement handling. |
| Subscription and cancellation law | Partial. Store billing and cancellation are mentioned, but this note is not a consumer-law memo. | Use ROSCA and state auto-renewal laws for US baseline, plus UK DMCC and Norway/EU consumer rules. Do not cite the FTC click-to-cancel rule as an active federal rule unless counsel confirms its current status after the 2025 vacatur. |
| Advertising / upsell to children | Covered at a high level: no targeted ads/profiling and no pressure-selling to children. | Decide whether there will be any ads at all. For launch, safest is no ads, no behavioral advertising, and adult-directed subscription copy only. |
| Store platform rules | Covered in provider/store package and Kids Category notes. | Complete App Store Connect / Play Console target-audience, privacy labels, AI disclosure, data safety, review notes, and country availability honestly. Store policy can be stricter than law. |
| Accessibility / European Accessibility Act | Not covered enough. | Add accessibility as a launch requirement for the mobile app and purchase/account flows. Use WCAG-style design/testing expectations for consumer digital services offered in the EU; include small-screen, screen-reader, contrast, text scaling, and voice alternatives. |
| Schools / education-data deployments | Flagged only indirectly by the "no new review" posture. | Treat schools as a trip-wire. B2C family launch is one posture; selling to schools can add FERPA-style US duties, EU processor/controller changes, procurement/security terms, and possible AI Act FRIA/high-risk analysis. Do not sell to schools without a separate deployment memo. |
| Health / special-category data | Covered as a product decision: avoid dyslexia/ADHD/disability labels unless explicit consent and DPIA expansion exist. | Keep tutor prompts and analytics from inferring or storing health, disability, emotional state, or wellbeing labels. If wellbeing/emotion support is added, redo Article 9 / AI Act / safety review. |

### Implementation check: what the current app collects before access

**Status:** code audit on 2026-06-05. This is not a legal sign-off; it records what the current implementation appears to do so the policy decision is grounded in the actual product.

| Stage | What the user can see | What is collected, stored, or sent | Access result |
|---|---|---|---|
| First open, signed out | Welcome/audience intro, sign-in/sign-up, optional "Try MentoMate" preview | Device-local state: intro-seen flag, selected audience, and preview intent/sample-topic state with a 1-hour TTL. The app also uses Sentry breadcrumbs for intro/preview events when Sentry is configured. | No local account/profile. No learning data. No LLM access. |
| Pre-signup preview | Static sample lesson/value-prop screens using fixed sample topics | Preview state is stored locally in SecureStore. The current preview topic choices are fixed samples, not free text. | No API profile and no LLM call. |
| Clerk sign-up/sign-in | Email/password, email-code verification, and configured SSO options | Clerk receives authentication data: email/password or SSO identity data. After verified sign-in and first API request, the API lazily creates an account row with Clerk user id and verified email. | User is authenticated, but still has no app/LLM access until profile creation and any required consent gate pass. |
| Profile creation | Display name and birth date form | Mobile sends display name plus full birth date to the API. The API uses month/day only for exact age calculation and stores display name plus birth year. Current code still says/enforces minimum age 11, not the decided 13. | Profile exists. If under the consent threshold and self-registering, consent status becomes PENDING and the app gate takes over. |
| Consent request | Parent/guardian email form | Parent email, consent type, token, policy version, request metadata, resend/change counts, and response status are stored in `consent_states`. | No LLM access while status is PENDING or PARENTAL_CONSENT_REQUESTED. |
| Pending consent gate | "Waiting for parent" screen, resend/change parent email, profile switch where allowed, and static "while you wait" previews | Static preview components only; no learner input and no LLM. Parent-email changes/resends hit the consent API. | Main app tabs are not rendered. API consent middleware blocks data-collecting routes for pending/withdrawn profiles. |
| After consent | Normal app shell | Learning/profile/session data begins only after consent and normal app use. LLM calls run after the API consent middleware and metering middleware. | LLM access is allowed only for a consented or not-consent-required profile. |

**Backend enforcement found:** `apps/api/src/index.ts` installs `consentMiddleware` before metering and LLM middleware. `apps/api/src/middleware/consent.ts` fails closed when profile metadata is missing, blocks PENDING / PARENTAL_CONSENT_REQUESTED / WITHDRAWN profiles from non-exempt data routes, and only exempts limited surfaces such as consent, profile reads/switching, billing, GET onboarding, and support outbox for non-withdrawn consent states.

**Current implementation gaps before the 13+ launch decision is actually implemented:**

1. **Age floor mismatch:** code and copy still say 11+. Update `MINIMUM_AGE`, `birthYearSchema`, create-profile copy, tests, and under-13/under-floor bounce instrumentation to 13+.
2. **Country allowlist not implemented:** create-profile does not ask country of residence. The database has only coarse `EU | US | OTHER`, and consent logic is currently location-blind. A country allowlist needs a real declared-residence field plus policy-versioned decision snapshot.
3. **Third-party disclosures:** privacy/app-store disclosures must name the actual processors/surfaces: Clerk auth, Sentry telemetry, RevenueCat/store billing, Resend/email, push notifications, camera/voice features when enabled, and the selected LLM provider.
4. **Pre-auth telemetry decision:** root app startup enables Sentry before a profile/age is known, then re-evaluates after profile load. Decide whether that pre-auth telemetry is acceptable for launch or whether Sentry should stay disabled until age/profile status is known.
5. **Support-route exemption:** pending-consent users can reach support/outbox routes, by design. Keep the payload minimized and make sure support copy does not invite learning data before consent.

### 10+ launch decision

**Do not launch 10+ in the first release. Keep 10-12 as an explicitly separate phase 2.**

A 10+ launch is not a small variation of 13+. It is a deliberate under-13 product, which means the US COPPA stack applies immediately, and many non-US markets also treat this as parent/legal-representative territory. It also creates provider and store-review pressure because the product is an AI tutor, not a static worksheet app.

The important distinction: needing something stronger than a bare email link for some 13-16 consent situations does **not** mean "we might as well build for 10+." For 13-16, stronger verification is a risk-based GDPR-style escalation. For 10-12, it becomes a baseline child-directed/under-13 regime with a different consent, notice, retention, parent-rights, provider, and audit burden.

What exists already and helps: profile creation, `consent_states`, pending-consent UI, API consent middleware, consent withdrawal/restore scaffolding, family links, and the general pattern that LLM access is blocked until consent passes.

What is still missing for a real 10+ stack:

| Missing area | What must be built | Why VPC alone is not enough |
|---|---|---|
| Under-13 intake | A separate 10-12 path that stops normal profile creation, collects only the parent contact/verification data needed for consent, and blocks all LLM/learning features until approval. | The current app creates a profile first and still accepts 11-12. For 10+, collection must be narrowed before consent. |
| COPPA-grade VPC | Frontend flow, backend state machine, vendor/callback integration, retry/error states, parent identity evidence/reference, and stored verification result. | VPC is the entry gate, but it does not define what data may be collected, retained, sent to LLMs, or deleted later. |
| Direct parent notice | Parent-facing notice before child data collection, covering profile data, learning/progress data, homework/session content, AI tutor interactions, processors, LLM disclosure, retention, and deletion/review rights. | Consent is only meaningful if the parent was told exactly what they are authorizing. |
| Explicit consent scope | Consent text/version and affirmative choices for child profile data, learning records, AI interactions, LLM/provider disclosure, photos/OCR, voice/STT, push/email, and optional memory/personalization. | A single "I agree" attached to account creation may be too vague for an AI tutor and too hard to audit later. |
| Parent rights surface | Parent dashboard/actions to view child data, revoke consent, delete the child profile/data, request export/review if counsel requires it, and restore only within the approved grace period. | COPPA/GDPR-style obligations continue after signup; they are not satisfied by one-time VPC. |
| Retention/deletion program | Specific retention schedule for child data, pending-consent cleanup, withdrawn-consent deletion, support/outbox minimization, and strict defaults for raw photos/audio/transcripts. | Under-13 risk is as much about what remains in systems as what is collected at signup. |
| Provider and processor posture | LLM provider terms that permit under-13 or under-digital-consent processing, Zero Data Retention where required, DPA/subprocessor review, transfer mechanism, endpoint allowlist, and payload minimization. | The tutor sends child content to external systems; VPC does not make a provider contract safe by itself. |
| Child AI safety | Age-appropriate AI disclosure, content filters, unsafe-content handling, monitoring/reporting/escalation, and prompts/evals tuned for 10-12. | A 10-year-old AI tutor is a different safety product from a teen tutor. |
| Country eligibility | Declared country of residence, store/IP/billing conflict handling, policy-versioned decision snapshot, and allowlist/blocklist before download or account creation. | Under-13 rules are not US-only if the app is available globally. Current `EU | US | OTHER` is not enough. |
| Parent-created "Netflix profile" guard | Parent may create a 13+ child profile with explicit consent receipt. For 10-12, parent-created profile must route through VPC before the profile becomes active. | A parent adding a profile is useful UX, but it does not contractually transfer operator/controller responsibility away from MentoMate. |
| Third-party SDK gating | Decide and implement age/consent behavior for Sentry, analytics breadcrumbs, Clerk, RevenueCat/store billing, Resend/email, push notifications, camera, OCR, voice/STT, and support tooling. | Child data can leak through SDKs and logs even when the main LLM route is blocked. |
| Store/review package | App Store / Google Play age rating, privacy labels, review notes, AI disclosure, child-data explanation, and decision on whether to avoid or intentionally enter Kids Category. | Store reviewers and parental controls must see a coherent child-facing product posture. |
| Tests and audit evidence | Negative-path tests proving no profile/LLM/access before VPC, provider calls are blocked until consent, deletion/withdrawal works, and consent receipts are immutable enough to audit. | The compliance posture must be provable, not just designed. |

Data lifecycle means the whole route child data takes through the product, not just "what is in Postgres." For a 10+ build, the lifecycle must be explicit at each stage:

| Lifecycle stage | Product question | 10+ answer needed |
|---|---|---|
| Collection | What do we ask before consent? | Only age/date-of-birth pathing, country/residence risk signal, and parent contact/verification data needed to obtain consent. No open-ended child input. |
| Creation | When does a child profile actually exist? | Prefer a pending shell or consent request record before VPC; activate the child profile only after parent verification/consent. |
| Use | What do we use child data for? | Narrow to tutoring, progress, safety, billing/family administration, support, and legally required operations. No targeted ads/profiling. |
| Disclosure/processing | Which third parties receive it? | Only approved processors: auth, email, billing/store, telemetry if allowed, LLM provider, OCR/STT if enabled. Each needs a child-data/provider decision. |
| Storage | Where does it live? | Database rows, object storage/photos, transcripts, caches, device storage, logs, Sentry/errors, support tools, provider logs, backups. Each needs an owner and retention rule. |
| Parent access/control | What can the parent do later? | Review relevant child data, revoke consent, delete the profile/data, and request export/review if counsel says required. |
| Retention | How long do we keep each class? | Separate timers for pending consent, active learning data, raw photos/audio, transcripts, summaries, support tickets, telemetry/logs, and backups. |
| Deletion/withdrawal | What happens when consent is denied, absent, or withdrawn? | Fail closed, stop LLM/provider processing, archive or delete according to grace period, purge child data, and keep only minimal audit/legal records. |
| Audit evidence | How do we prove it happened? | Immutable-enough consent receipt, policy version, country decision snapshot, processor posture, deletion job evidence, and negative-path tests. |

Minimum implementation decision for 10+: **a parent-created profile can be the consent UX only after it becomes explicit and auditable. For 10-12, it must also include COPPA-grade VPC before any child profile, learning record, photo, voice, transcript, or LLM interaction becomes active.**

Decision sentence: **10+ is not a launch variant; it is the future COPPA/child-data phase. Do 13+ first, measure under-13 demand at the age gate, then fund 10+ only if demand justifies the VPC/provider/legal build.**

### Source anchors used in the follow-up

- US COPPA: 16 CFR Part 312 / FTC COPPA rule, especially §312.5 VPC and §312.10 retention/deletion: <https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312>
- EU GDPR Article 8 / children safeguards: <https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en>; EDPB consent guidelines: <https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en>
- UK ISS consent age 13: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/children-and-the-uk-gdpr/what-are-the-rules-about-an-iss-and-consent/>
- Norway current age 13: <https://lovdata.no/dokument/NLE/lov/2018-06-15-38/%C2%A716>; Denmark current age 15: <https://www.elov.dk/lov-om-supplerende-bestemmelser-til-forordning-om-beskyttelse-af-fysiske-personer-i-forbindelse-med-behandling-af-personoplysninger-og-om-fri-udveksling-af-saadanne-oplysninger-databeskyttelsesloven/paragraf/6/>
- Australia OAIC children/capacity + Children's Online Privacy Code: <https://www.oaic.gov.au/privacy/your-privacy-rights/more-privacy-rights/children-and-young-people>; <https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code>
- Canada OPC meaningful consent + Quebec Law 25: <https://www.priv.gc.ca/en/privacy-topics/business-privacy/collecting-personal-information/consent/gl_omc_201805/>; <https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1>
- New Zealand Privacy Act / child guidance: <https://www.privacy.org.nz/assets/DOCUMENTS/Childrens-Privacy-Guidance/Chapter-1_Children-Young-People-and-their-personal-information-20260306-A1140220.pdf>
- Singapore PDPC children's personal data guidance: <https://www.pdpc.gov.sg/guidelines-and-consultation/2024/03/advisory-guidelines-on-the-pdpa-for-childrens-personal-data-in-the-digital-environment>
- South Korea PIPA under-14 legal-representative consent: <https://elaw.klri.re.kr/eng_service/lawTwoView.do?hseq=62389>
- India DPDP child consent: <https://www.indiacode.nic.in/handle/123456789/22037>
- Japan PPC child consent FAQ + APPI reform watch: <https://www.ppc.go.jp/all_faq_index/faq1-q1-62>; <https://www.ppc.go.jp/en/legal/>
- China PIPL + GenAI/minors rules: <https://digichina.stanford.edu/work/translation-personal-information-protection-law-of-the-peoples-republic-of-china-effective-nov-1-2021/>; <https://english.www.gov.cn/news/202307/13/content_WS64aff5b3c6d0868f4e8ddc01.html>
- Russia localization / child harmful-information law: <https://b1.ru/en/insights/law-messenger/localization-of-personal-data-of-russian-citizens-6-march-2025/>; <https://www.refworld.org/legal/legislation/natlegbod/2010/en/102782>
- Brazil LGPD Article 14 + ECA Digital: <https://normas.leg.br/?urn=urn%3Alex%3Abr%3Afederal%3Alei%3A2018-08-14%3B13709%21art14>; <https://planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm>; <https://planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12880.htm>
- LATAM anchors: Colombia SIC Article 7 view: <https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/tratamiento-excepcional-y-autorizacion-del-representante-legal-con-interes-superior>; Peru Law 29733: <https://www.gob.pe/institucion/congreso-de-la-republica/normas-legales/243470-29733>; Ecuador LOPDP: <https://www.informatica-juridica.com/ley-organica/ley-organica-de-proteccion-de-datos-ecuador-de-21-de-mayo-de-2021/>; Paraguay Law 7593/2025: <https://www.bacn.gov.py/leyes-paraguayas/12924/ley-n-75932025-de-proteccion-de-datos-personales-en-la-republica-del-paraguay>; Chile Law 21.719 transition: <https://cms.law/en/int/expert-guides/cms-expert-guide-to-data-protection-and-cyber-security-laws/chile>
- Online safety / design / accessibility anchors: EU DSA: <https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package>; UK Online Safety Act / Ofcom duties: <https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/codes-of-practice>; UK children's risk assessments: <https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/quick-guide-to-childrens-risk-assessments/>; European Accessibility Act: <https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en>; California AADC litigation watch: <https://law.justia.com/cases/federal/appellate-courts/ca9/25-2366/25-2366-2026-03-12.html>
- Consumer billing anchors: ROSCA: <https://www.law.cornell.edu/uscode/text/15/chapter-110>; FTC Negative Option Rule proceeding / vacatur reference: <https://www.ftc.gov/system/files/ftc_gov/pdf/p064202negativeoptionruleanprm.pdf>
- Provider / store policy anchors: Google Gemini API terms: <https://ai.google.dev/gemini-api/terms>; Google Cloud service terms: <https://cloud.google.com/terms/service-terms>; Google Workspace for Education Gemini docs: <https://knowledge.workspace.google.com/admin/gemini/turn-the-gemini-app-on-or-off?co=DASHER._Family=Education&p=edu_supported_editions>; OpenAI under-18 API guidance and data controls: <https://platform.openai.com/docs/guides/safety-checks/under-18-api-guidance>; <https://platform.openai.com/docs/guides/your-data>; Anthropic minors guidance and ZDR: <https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors>; <https://privacy.anthropic.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to>; Apple App Store Review Guidelines: <https://developer.apple.com/app-store/review/guidelines/>; Google Play AI-generated content policy: <https://support.google.com/googleplay/android-developer/answer/14094294>; Google Play Families Policy: <https://support.google.com/googleplay/android-developer/answer/9893335>

### Verification pass — residual unverified items (2026-06-05)

**Status:** a 45-claim verification + adversarial-challenge pass was run over sections 2–6 on 2026-06-05 (primary-source evidence standard; sub-90%-confidence claims challenged by three adversarial lenses). 42/45 claims stand; 3 were corrected inline (the rows tagged "*Corrected 2026-06-05 verification pass*"). The items below were **not** verified by that pass — treat them as unverified assertions until separately checked, not as settled facts:

1. **US state app-store accountability laws** (country matrix, US row): named as a monitor-separately item but never enumerated. Which states, what age-verification/accountability duties, and effective dates remain unmapped.
2. **Schools trip-wire specifics** (coverage table, schools row): the FERPA-style US duties and the EU AI Act FRIA/high-risk analysis for school deployments are asserted but were not verified. Dormant by design while the no-schools posture holds; verify before any school deployment memo.
3. **Clerk lazy account-row creation** (implementation table, Clerk row): the claim that the API lazily creates an account row (Clerk user id + verified email) on first API request after verified sign-in was not code-verified in this pass, unlike the rest of the implementation table.
4. **Processors list completeness** (implementation gap 3): the named processor set (Clerk, Sentry, RevenueCat/store, Resend, push, camera/voice when enabled, LLM provider) was not swept against the actual dependency/SDK surface. An exhaustive processor inventory is still owed before privacy labels / disclosures are written.
5. **Source-anchor URLs** (section above): the ~40 anchors were not checked one-by-one for liveness or currency; several were independently confirmed during verification, but the list as a whole is not certified. Known trap from this pass: even a regulator's own English translation can be years stale (Datatilsynet's English PDF of the Danish act still shows the pre-2024 age 13; the live consolidated Danish statute says 15, raised by LOV nr 1783 af 28/12/2023, effective 2024-01-01). Prefer consolidated native-language statutes over translations and tracker sites.
6. **Least-settled surviving legal judgment** — the COPPA "support for internal operations" vs. disclosure analysis for LLM routing (§3, product-shaping item): it survived adversarial challenge but with the lowest margin of any surviving claim. The existing routing of this question to counsel is load-bearing; do not shortcut it.

## 6. Open / next

P2 (store rating — Apple's 2025 rating overhaul removed 12+/17+ from the global tiers; the set is now 4+/9+/13+/16+/18+ (12+ survives only as a Korea regional value). For an open generative-AI tutor at a 13+ floor the honest Apple rating is **13+**, not 4+/9+ — Apple's questionnaire requires accounting for AI-assistant/chatbot impact on sensitive-content frequency, and 4+/9+ are the Kids-Category-eligible bands we are deliberately staying out of. On Google Play expect a Teen-equivalent IARC rating, declaring the AI-chat interactive element honestly. *Corrected 2026-06-05 verification pass: previously "4+/9+/12+ now all coherent at a 13+ floor", which is wrong on both tiers and coherence.*), P3, P4 (Kids Category — stay out), P5, P6; then re-size Group L against the 13+ floor. Add a launch policy config from section 5 before opening additional countries.
