# Draft response to DPIA evidence request

> **Superseded snapshot — do not send.** This retained draft is incomplete
> (questions 7–10 are absent) and contains production and launch-policy claims
> corrected on 24 July 2026. Use the
> [current working response](DPO%20exchanges/2026-07-23-dpia-review-response-draft.md).

**Review date:** 23 July 2026  
**Status:** Draft for management, DPO/counsel, Engineering, Operations, and Product completion  
**Purpose:** Answer the questions that current evidence supports, identify what cannot yet be supplied, and define the close artifact for each gap.

> This is an evidence response, not legal advice or a management attestation. The operator has confirmed that the historical “Cognoco s.r.o.” reference was fabricated, that no such entity exists in this context, and that it has no role in MentoMate processing. Item 6 of the request supplied to us contained only the heading “Retention and deletion”; this draft gives the evidence presently available and flags that the reviewer's complete item 6 must still be obtained.

## Executive response

| Item | Present answer | Status |
|---|---|---|
| 1. Controller | The intended controller is **ZWIZZLY AS**, organisation number **811 696 072**, Fiskekroken 3B, 0139 Oslo, Norway. “Cognoco s.r.o.” was a historical fabricated reference, not an entity with any role in MentoMate processing. | **Identity supplied; establishment and management attestation required** |
| 2. Production architecture | The 22 July 2026 production evidence shows routing v2 enabled and active credentials for Cerebras, Mistral, OpenAI, Anthropic, and Voyage. Gemini/Vertex is excluded from every production routing-v2 selection, not only from routes for minors. | **Substantially answerable; contractual and console evidence missing** |
| 3. Scope and launch | The ratified launch product is consumer-only, credentialised, and 13+; under-13 support is built but dormant. The intended policy perimeter is all 30 EEA countries, with the UK and every other non-EEA country disabled. A closed beta of 5–10 families with 13+ teenagers is planned. The first operational country wave, public-launch volume, and current production child-user count are not established by repository evidence. | **Operational enablement statement and attestation required** |
| 4. Legal bases | A working purpose-by-purpose matrix and a sourced 30-country Article 8 threshold matrix can be supplied. They are not yet final legal determinations; DPO/counsel must approve them and Engineering must implement habitual-residence-based consent gating. | **DPO/counsel approval and country-policy implementation required** |
| 5. Special-category data | The categorical statement that no Article 9 data can be collected or inferred is not supportable for an open-text AI service. Current controls are useful but too narrow to close this risk. | **DPIA correction and engineering/legal remediation required** |
| 6. Retention and deletion | Raw-transcript purge and account-deletion mechanics can be evidenced. Dormancy, survivor-record periods, provider retention, and complete special-category deletion cannot. | **Partial; complete reviewer wording and further evidence required** |

No final DPIA approval should be requested until the establishment, accountable-manager, country-policy implementation, Article 8 sign-off, provider-contract, and Article 9 matters below are closed.

## 1. Controller identity and establishment

### What can be supplied now

The operator has confirmed that the intended controller is:

> **ZWIZZLY AS**  
> Norwegian organisation number **811 696 072**  
> Fiskekroken 3B, 0139 Oslo, Norway

This identity is currently repeated in the:

- [main DPIA](dpia.md);
- [RoPA](ropa.md);
- [filled EDPB DPIA companion](edpb_dpia_filled_2026_v1.md);
- [breach-response plan](breach-response-plan.md);
- adult privacy notice, child-readable summary, and all repository-held translations in the mobile application;
- repository-held app-store reviewer notes and compliance checklist.

The official [Brønnøysund Register Centre entry for organisation number 811 696 072](https://virksomhet.brreg.no/en/oppslag/enheter/811696072) confirms the legal name, organisation form, number, and registered business address. A digitally signed company certificate or registered-information extract should be downloaded from that official entry and placed in the approval evidence pack.

The repository contains no current compliance artifact naming Cognoco s.r.o. as controller. The operator has confirmed that the name came from a historical hallucination, does not identify an entity involved with MentoMate, and should be removed from any external material where it survives. It does not create a joint-controller or group-company question.

### What cannot yet be supplied

We cannot yet confirm:

- where the people who actually decide the purposes and essential means of processing are based;
- which establishment has authority to make and implement those decisions;
- the accountable management decision-maker by name and role;
- the final competent or lead supervisory authority;
- consistency with executed contracts or the live Apple and Google store-console records, because those records are not in the repository.

The current documents name the Norwegian Datatilsynet as lead supervisory authority. That conclusion is conditional, not established merely by a Norwegian registered address. The [Datatilsynet’s cross-border-processing guidance](https://www.datatilsynet.no/regelverk-og-verktoy/internasjonalt/grenseoverskridende-behandling-av-personopplysninger/) explains that the main establishment turns on where decisions about the purposes and means are made and can be implemented. If those facts point elsewhere, the supervisory-authority analysis must be revised.

### Close action

Management and DPO/counsel should produce one signed **controller and establishment memorandum** containing:

1. the selected controller’s full legal name, number, legal form, and registered address;
2. a current digitally signed registry extract;
3. a factual account of where decisions about purposes and essential means are made, by whom, and which establishment can implement them;
4. the named accountable executive and their role;
5. the reasoned competent/lead-supervisory-authority conclusion;
6. a recorded correction that “Cognoco s.r.o.” was fabricated and has no controller, processor, joint-controller, or group-company role;
7. an appendix reconciling the signed conclusion against the DPIA, RoPA, privacy notices, child notice, processor contracts, terms, breach plan, support/rights workflow, and both live app-store consoles, including removal of any surviving fabricated reference.

Compliance should now search external contracts, publication systems, and both live app-store consoles for the fabricated name, remove it wherever found, and retain dated screenshots or exports. The **controller identity** is resolved as ZWIZZLY AS; the **main-establishment, accountable-manager, lead-authority, and cross-surface verification** evidence remains open.

## 2. Current production architecture and LLM routing

### Authoritative engineering snapshot available now

The following is the current engineering inventory as of the production evidence check on **22 July 2026**. That check found `LLM_ROUTING_V2_ENABLED=true`, `CHALLENGE_ROUND_GRADER_ENABLED=true`, and credentials present for Cerebras, Mistral, OpenAI, Anthropic, and Voyage without exposing the credential values. The code authority is the [LLM model register](../registers/llm-models/master.md), `apps/api/src/services/llm/router.ts`, and the routing tests named below.

| Provider and model | Production role | Route status | Can receive children’s data? |
|---|---|---|---|
| Cerebras — `gpt-oss-120b` | Default text route except eligible paid deep-reasoning requests; also used for asynchronous deep jobs | **Active primary outside paid deep-reasoning rungs** | **Yes**, including eligible 13+ learners |
| Mistral — `mistral-small-2603` | Free-tier text fallback and free vision/OCR | **Active primary for free vision; active fallback for text** | **Yes** |
| OpenAI — `gpt-5-mini` | Paid vision/OCR and paid/free text fallback | **Active primary for paid vision; active fallback for text** | **Yes** |
| OpenAI — `gpt-5.4` | Plus/Pro/add-on deep reasoning at routing rungs 4–5 | **Active primary for eligible deep-reasoning calls** | **Yes**, for eligible 13+ paid learners |
| Anthropic — `claude-sonnet-4-6` | Challenge/suitability judge and final text fallback | **Active primary for judge calls; active fallback for text** | **Yes** |
| Voyage AI — `voyage-3.5`, 1,024 dimensions | Persistent-memory embeddings | **Active processor outside the conversational fallback chain** | **Yes** |
| Google Gemini / Vertex | Adapter and legacy-path code remain, but routing v2 excludes both providers from every candidate set | **Production-disabled under the enabled routing-v2 policy** | **No under current production policy** |
| DeepSeek/DeepInfra candidates | Recorded as dormant possibilities; no pinned active route | **Configured in planning material only / inactive** | **No current production route** |

Cerebras’s role needs to be stated precisely. **`gpt-oss-120b` is an OpenAI-authored open-weight model, while Cerebras is the inference host and the recipient/processor for this route.** OpenAI states that gpt-oss can run through third-party hosting providers and is not served through the OpenAI API. A request routed to `gpt-oss-120b` at Cerebras therefore goes to Cerebras, not to OpenAI. The direct OpenAI API relationship in this inventory is separate and covers `gpt-5-mini` and `gpt-5.4`.

The current code supplies routing v2 with `rung`, `llmTier`, and `capability`; it supplies no residence, jurisdiction, or geographic-region input. `pickThroughExchangeRouter()` labels every candidate with the placeholder `servingRegion: 'global'`. For ordinary text, `getModelConfigV2Matrix()` returns Cerebras `gpt-oss-120b` as the universal primary—including for 13+ children—unless the paid deep-reasoning rung selects direct OpenAI instead. The code therefore does not make a regional routing decision, and this response makes no claim about a future regional design.

Gemini/Vertex is therefore blocked for the **entire current application routing-v2 path**, not merely for minors. The production configuration check did not report a Gemini credential as present. The adapter remains in source for legacy compatibility, so the final deployment evidence should also prove key absence and prevent an unreviewed routing-v2 rollback. Independently, the legacy policy excludes Gemini for minors.

### Fallback candidates, effective behavior, and triggers

The routing-v2 selector contains these candidate preference lists:

| Failed starting route | Ordered candidates considered |
|---|---|
| Free vision/OCR | Mistral → Anthropic |
| Paid vision/OCR | OpenAI `gpt-5-mini` → Anthropic |
| Cerebras, free text | Mistral → Anthropic |
| Cerebras, paid text | OpenAI `gpt-5-mini` → Anthropic |
| Mistral text | OpenAI `gpt-5-mini` → Anthropic |
| OpenAI text | Anthropic |
| Anthropic text | OpenAI `gpt-5-mini` |

These are **not a multi-hop runtime cascade**. The implementation returns the first registered, permitted candidate and makes one fallback call. If that selected fallback also fails, the same request does not continue to the next candidate in the list.

There is also a current vision-path defect that must be disclosed rather than obscured by the intended list: because the free vision primary is already Mistral and the paid vision primary is already OpenAI `gpt-5-mini`, the selector can choose the same provider/model again as its single “fallback” before Anthropic. Existing routing tests prove that Gemini/Vertex is excluded and that a vision fallback remains vision-capable, but they do not cover this same-primary reselection case.

Fallback is considered after transient failure: timeout/network failure, HTTP 408, HTTP 429, or HTTP 5xx. Non-transient client, safety, validation, or policy failures are not retried as if they were availability failures. A provider circuit opens after three recorded failures and remains open for 60 seconds. Non-streaming calls allow the initial attempt plus three retries before the single fallback route is considered. Streaming may fall back only before any response bytes have been emitted; a mid-stream failure is surfaced to the caller.

Only registered, permitted providers are eligible. If no approved candidate is available, the router raises an error; it does not select a prohibited route. The fail-closed behavior is covered by:

- `apps/api/src/services/llm/router.fallback-compliance.test.ts`;
- `apps/api/src/services/llm/router.policy-wiring.test.ts`;
- `apps/api/src/services/llm/router.v2-matrix.test.ts`.

### Data sent and minimisation

Depending on the route, the provider payload may contain:

- the learner’s current message and recent in-session transcript;
- tutor system instructions;
- topic and subject titles;
- conversation language, pronouns, and a derived age band rather than raw date of birth;
- consent-gated learning context such as interests, strengths, struggles, learning style, onboarding signals, and limited vocabulary context;
- selected homework-image bytes for an explicit OCR request;
- tutor output and necessary evaluation context for a judge call;
- session text selected for embedding, including user and AI text, for Voyage AI.

The application does not intentionally put account, person, organisation, or session database identifiers into conversational provider messages. A minor’s name is excluded at prompt construction and by a second fail-closed egress guard. An unambiguously adult learner’s sanitised first name may be included. Provider outputs return to the API, are safety/structure checked as applicable, and may be stored as the AI response and distilled into summaries, notes, mastery state, or memory. Raw transcripts are subject to the first-party retention process described in section 6.

### Evidence not yet available

Code cannot establish the following for any provider:

- the executed contracting entity, data processing agreement (DPA), service tier, or incorporated security terms;
- provider-side prompt/output retention and deletion;
- no-training or zero-data-retention (ZDR) status;
- actual processing and support-access locations;
- subprocessors, transfer mechanism, or transfer impact assessment;
- the exact OpenAI residency configuration—the code uses the standard API endpoint;
- provider support for data-subject requests and incident notification;
- whether all production-console settings still match the intended policy;
- representative production request traces showing the effective provider, model, minimised payload fields, and fallback outcome.

### Close action

Engineering and Operations should issue a versioned **production AI-routing evidence bundle** containing:

1. the deployed commit and deployment identifier;
2. key-presence and feature-flag attestations with values redacted;
3. the generated allowlist and model matrix;
4. passing routing, forbidden-provider, age-policy, retry, and fail-closed tests;
5. controlled synthetic canary traces for each primary and fallback path—never real child data—including payload-field manifests and the effective provider/model;
6. proof that prohibited-provider credentials are absent or unusable and that a routing-v2 rollback cannot expose child data;
7. for every provider, executed DPA/terms, account tier, retention/no-training/ZDR settings, region evidence, subprocessors, transfer mechanism, transfer impact assessment, and deletion/rights support.

Engineering must first rule whether the supported policy is a single failover or a true ordered cascade. In either case it must exclude the failed provider/model from candidate selection, add regression tests for free and paid vision, and make the inventory describe effective—not aspirational—behavior.

If every approved route is unavailable, the documented product behavior should be a temporary unavailable/retry response with no prohibited-provider egress. That user-visible behavior and the absence of partial persistence must be covered by an integration test.

## 3. Scope, launch countries, and current processing status

### What can be supplied now

The current ratified product scope in the [MVP definition](../plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md) and [launch runway](../plans/2026-07-10-mvp-roadmap/RUNWAY.md) is:

- a direct-to-consumer, credentialised MentoMate service;
- launch age floor of **13+**;
- family use at launch means an adult with 13+ teenagers, with verified guardian
  authorization where a learner is below the Article 8 threshold for their
  country of habitual residence;
- managed under-13 capability is built but dormant and must not be activated at launch;
- no advertising, emotion recognition, or training of general-purpose models on MentoMate user content;
- a planned closed beta of **5–10 families with 13+ teenagers** before public launch;
- school, institutional, and business licensing are future possibilities, not part of the current consumer launch.

The [`13+ EEA launch-country ruling`](2026-07-23-13-plus-eea-launch-country-ruling.md)
sets the intended policy perimeter as all 30 EEA countries. It requires exact
age and habitual residence, applies the national Article 8 threshold to trigger
guardian authorization where needed, and excludes the United Kingdom and every
other non-EEA country unless separately ruled. Older planning material
referring to other country combinations should not be relied on.

### What cannot yet be supplied

Current evidence does not establish:

- the countries included in the first operational enablement wave within the
  30-country EEA policy perimeter;
- a public-launch user forecast or age distribution beyond the 13+ floor;
- anticipated daily/monthly tutoring turns, images, transcript volume, learning-memory volume, or provider token volume;
- whether the production database currently contains real children’s data;
- whether the earlier “no production users” statement remains correct on 23 July 2026.

Repository evidence cannot prove the contents of a live database or distinguish real users from staff, seeds, and test accounts.

### Close action

Product and management should sign a **launch-scope statement** confirming the
30-country EEA policy perimeter and listing the first operational enablement
wave, platform availability, age range, consumer/institutional scope, beta and
12-month user forecasts, and expected processing volumes. Engineering must
configure a country allowlist and national-threshold lookup that fail closed
for unavailable or uncertain jurisdictions.

Operations should produce a dated, privacy-preserving **production-processing attestation** that:

- reports aggregate real-person counts by adult/minor launch-age band and country, excluding documented staff/test/seed records;
- states the earliest timestamp, if any, at which a real child’s data was processed;
- checks relevant database, authentication, job, and AI-egress records;
- records the query or method without exporting children’s personal data;
- expressly confirms or withdraws the earlier “no production users” statement.

The DPIA change-control section should require reassessment **before** enabling younger children, a new jurisdiction, school/institutional use, grading or placement decisions, advertising, emotion recognition, or model training on user data.

## 4. Legal bases, consent, and Article 8 GDPR

### Working matrix available now

This is a working allocation for counsel review, not a final legal conclusion:

| Purpose | Data subjects / data | Proposed Article 6 basis | Open legal or implementation point |
|---|---|---|---|
| Adult account administration | Adult identity, authentication, settings, support | Art. 6(1)(b), contract | Reconcile contract basis with the product’s separately recorded platform and LLM consents; do not describe necessary service processing as freely withdrawable unless it is |
| Child tutoring conversations | Child messages, context, AI replies | Art. 6(1)(a), consent | Article 8 capacity/parental authorisation by country; Article 9 handling for incidental disclosures |
| Persistent learning memory | Summaries, notes, facts, quotations, embeddings | Art. 6(1)(a), consent | Granularity, special-category exclusion, dormancy period, and withdrawal consequence |
| Learning assessments and progress profiling | Answers, scores, mastery, misconceptions, reports | Art. 6(1)(a), consent | Confirm necessity, access/correction, and that no legally or similarly significant decision is made |
| Guardian and mentor access | Relationship edges and disclosed learner progress | Art. 6(1)(a), consent, subject to counsel confirmation | Separate authority to consent from authority to view data; approve field-level access and best-interests analysis |
| Age and residence determination | Birth date, residence, knowledge/assertion history | Arts. 6(1)(c) and/or 6(1)(f), subject to counsel confirmation | Identify the concrete legal obligation and complete a legitimate-interests assessment where used |
| Security, abuse prevention, and telemetry | Security events, identifiers, errors, limited diagnostics | Art. 6(1)(f), legitimate interests | Complete a legitimate-interests assessment (LIA); prove minimisation, scrubbing, access, and retention |
| Billing | Payer, subscription, transaction/store identifiers | Art. 6(1)(b), contract; Art. 6(1)(c) for statutory retention | State tax/accounting periods and distinguish active billing from survivor records |
| Transactional communications | Email/push destination and service/security content | Art. 6(1)(b) and/or 6(1)(c), depending on message | Classify each message; push-notification basis remains open in the RoPA |
| Optional communications and waitlist | Email, preference, waitlist status | Art. 6(1)(a), consent | Separate from service consent; define proof, withdrawal, suppression, and deletion |

The current implementation records versioned, purpose-specific **`platform_use` — core service-processing consent purpose** and **`llm_disclosure` — AI-provider disclosure consent purpose**, and exposes authenticated self-service acceptance, withdrawal, and accountability endpoints. Code evidence also shows fail-closed consent checks at the conversational route and several asynchronous processing boundaries. That is meaningful evidence, but it is not yet a complete test of every purpose and downstream job.

### Article 8 position

A global “13+” label is insufficient to establish self-consent in every EEA
country. It is the product floor; the national Article 8 threshold determines
whether a 13–17-year-old self-consents or requires verified guardian
authorization. Article 8 permits Member States to set that threshold between
13 and 16. For Norway, the
[Datatilsynet’s consent guidance](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/samtykke/)
states that parental consent is required below 13 for an information-society
service and warns that other EEA states use higher thresholds.

The
[`13+ EEA launch-country ruling`](2026-07-23-13-plus-eea-launch-country-ruling.md)
now supplies a sourced matrix for all 30 EEA countries: 9 at age 13, 6 at age
14, 5 at age 15, and 10 at age 16. Before enablement, counsel must approve or
correct each country's entry, including:

- the applicable Article 8 threshold and source;
- whether the service is offered directly to a child;
- the required parental-authorisation method and reasonable verification;
- the treatment of cross-border families and uncertain residence;
- the minimum product age, even where legal consent capacity is lower;
- any rules beyond GDPR, including consumer, education, or child-safety law.

### Refusal and withdrawal

Before approval, test and document:

1. refusal at sign-up for each optional and necessary purpose;
2. withdrawal of `platform_use` without preventing access to rights, export, or deletion;
3. withdrawal of `llm_disclosure` stopping new LLM and embedding egress, including queued/background work;
4. restoration, grace-period, archive, and final deletion behavior;
5. guardian withdrawal and the learner’s changing consent capacity;
6. residence or age corrections that move the person into a stricter regime;
7. proof that no consent-dependent derived memory is newly created after withdrawal.

The notice must explain, purpose by purpose, whether refusal means that a feature is unavailable, an optional communication stops, existing data is deleted, or a narrowly defined record must be retained.

## 5. Special-category data

### Corrected present position

We agree that the unqualified statement “no Article 9 data are collected or inferred” is not supportable for an open-text AI tutoring service. A learner can disclose sensitive facts without being asked, an AI provider can generate an inference, and that text can enter a transcript or derived field before a control acts.

The defensible current position is narrower:

> MentoMate does not intend to solicit, infer, or use special-category data for tutoring or profiling. Incidental disclosure and model-generated sensitive content are foreseeable risks. Such content must be prevented from entering persistent learning memory and handled under a documented short-retention, deletion, safeguarding, and legal process.

The final Article 9 conclusion—including whether any remaining operation constitutes processing of special-category data and, if so, the applicable Article 9(2) condition—belongs to DPO/counsel. Explicit consent should not be assumed to solve the issue, especially for children.

### Controls that can be evidenced now

- A central persisted-learning-text guard rejects or removes a narrow set of explicit health/disability attributions before selected LLM-written memory facts, topic notes, and misconception text are stored.
- A guard test checks that the control remains wired into the identified persistence boundaries.
- Prompting discourages requests for unnecessary personally identifying information.
- Crisis handling can produce a structured redirect and metadata-only safety event; the event does not include the child’s disclosure and does not automatically notify a guardian.
- Raw transcripts have a first-party 30-day purge mechanism after summary generation.

### Why the present controls are insufficient

The persisted-learning guard:

- mainly recognises a narrow English-language health/disability vocabulary;
- does not comprehensively cover racial or ethnic origin, political opinions, religion or beliefs, trade-union membership, genetic/biometric identification, health, sex life, or sexual orientation;
- does not establish coverage for every supported conversation language;
- does not remove sensitive content from the raw transcript;
- does not prove coverage across summaries, recaps, assessment evidence, challenge-round quotations, learning-profile fields, embeddings, and every other derived free-text field;
- cannot reliably distinguish all sensitive disclosures or model-generated inferences.

Current evidence also does not show:

- a child-readable instruction not to share sensitive information;
- a comprehensive prompt rule against soliciting or unnecessarily inferring Article 9 information;
- a tested server-side, multilingual suppression policy at every persistence and embedding boundary;
- a complete safeguarding/mandatory-reporting procedure, legal escalation owner, or localised crisis-resource workflow;
- a signed Article 9 legal memorandum.

### Close action

Before approval:

1. inventory every user-authored, provider-generated, derived, quoted, summarised, and embedded text field and its retention path;
2. add age-appropriate pre-chat and contextual warnings that do not blame the child;
3. prohibit solicitation and unnecessary inference in system prompts;
4. implement a central, server-side, multilingual special-category policy that fails closed for persistent memory and embeddings;
5. prevent flagged content from being embedded and delete any corresponding vectors;
6. define whether and how sensitive raw-transcript segments are redacted or deleted earlier than the ordinary transcript window;
7. test all Article 9 categories, supported languages, paraphrases, indirect inference, quotations, summaries, and every persistent-memory field;
8. finish the safeguarding/crisis runbook, including human ownership, response times, mandatory-reporting analysis, confidentiality, and country-appropriate resources;
9. have DPO/counsel approve a revised [Article 9 decision](art9-special-category-decision.md) and synchronise the DPIA, RoPA, notices, retention schedule, and processor instructions.

The present DPIA and RoPA statements that special-category processing is absent should be amended now, rather than waiting for the controls to be completed.

## 6. Retention and deletion

### Scope caveat

The received request stops after the heading “6. Retention and deletion.” The following answers the likely evidence question without inventing the reviewer’s missing sub-questions. The complete wording should be requested and appended before this response is finalised.

### Evidence available now

| Data/process | Current evidence | Qualification |
|---|---|---|
| Raw tutoring transcript | Daily purge selects transcripts 30 days after summary generation; production `RETENTION_PURGE_ENABLED` was verified enabled on 22 July 2026 | Delayed or incomplete summaries are detected from day 37; monitoring evidence should accompany the claim |
| Persistent learning memory | Summaries, memory facts, notes, mastery, and some short quotations persist for teaching continuity | No implemented general dormancy sweep is presently proved; quotation age-out remains open |
| Account deletion | Seven-day cancellable grace period, then deletion workflow removes person and learning data and requests deletion of the external Clerk identity | Limited consent, financial, and deletion-audit records are deliberately re-homed before deletion |
| Consent withdrawal | Seven-day restoration window followed by deletion or an optional 30-day archive path in defined cases | DPO must approve the best-interests, eligibility, notice, and retention policy |
| Bring-your-own-key (BYOK) waitlist | Delete flow includes removal of the waitlist email | Confirm whether the waitlist is live and include it in the final purpose/retention matrix |
| Provider-held prompts, outputs, and images | Application code shows what is transmitted but not provider-side deletion | DPA, account-setting, retention, and deletion evidence required per provider |

### What cannot yet be supplied

- final retention periods for **`person_retain` — survivor-record tier outside the deleted person; holds minimal consent, financial, and deletion-audit evidence**;
- the dormancy period and an implemented, monitored dormancy deletion job;
- a field-complete retention schedule for all identity, learning, assessment, support, telemetry, notification, security, and waitlist data;
- proof that sensitive content and its embeddings are deleted from every copy;
- provider-side retention/deletion and backup-expiry evidence;
- a legal-hold procedure and clear suspension/resumption of deletion;
- end-to-end deletion evidence across all processors and subprocessors;
- the reviewer’s actual item 6 questions.

### Close action

Create a DPO-approved retention schedule at field/system/processor level with trigger, active period, grace period, backup period, legal basis for any survivor, deletion method, verification method, and owner. Populate the currently provisional survivor-record periods, implement and monitor dormancy deletion, and run synthetic end-to-end deletion exercises across MentoMate and each processor. Record request, execution, provider confirmation, exception, and final verification timestamps without retaining the deleted content as evidence.

## Consolidated close-artifact register

| Priority | Owner | Required artifact | Gate |
|---|---|---|---|
| 1 | Management + DPO/counsel | Signed controller and establishment memorandum, registry evidence, accountable executive, supervisory-authority analysis | Before DPIA finalisation |
| 2 | Product + management | Signed EEA-perimeter, operational-wave, audience, institutional-scope, user-volume, and data-volume statement | Before country configuration and DPIA finalisation |
| 3 | Operations | Dated production-user/child-processing attestation | Before any claim that no production child processing has occurred |
| 4 | Engineering + Operations | Versioned deployed routing inventory, tests, synthetic traces, fail-closed and rollback evidence | Before provider-risk approval |
| 5 | Vendor owner + DPO/counsel | DPA, tier, retention/no-training/ZDR, residency, subprocessor, transfer, rights, and deletion evidence for every active AI processor | Before child data is sent to that processor |
| 6 | DPO/counsel | Final purpose/data-subject/legal-basis matrix, LIAs, approval or correction of the 30-country Article 8 matrix, and refusal/withdrawal consequences | Before DPIA sign-off |
| 7 | Engineering + Safety + DPO/counsel | Special-category field inventory, suppression controls/tests, safeguarding runbook, and signed Article 9 conclusion | Before DPIA sign-off |
| 8 | DPO/counsel + Engineering + Operations | Complete retention schedule and end-to-end deletion evidence | Before DPIA sign-off |
| 9 | Compliance + Store owner | Reconciled DPIA, RoPA, notices, contracts, support material, and live app-store exports | Immediately after decisions 1–8 |

## Sources and evidence boundary

Primary repository sources:

- [Privacy-surface engineering evidence — 22 July 2026](privacy-surface-evidence-2026-07-22.md)
- [13+ EEA launch-country ruling](2026-07-23-13-plus-eea-launch-country-ruling.md)
- [DPIA](dpia.md)
- [RoPA](ropa.md)
- [Article 9 decision draft](art9-special-category-decision.md)
- [LLM model register](../registers/llm-models/master.md)
- [MVP definition](../plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md)
- [Launch runway](../plans/2026-07-10-mvp-roadmap/RUNWAY.md)
- `apps/api/src/services/llm/router.ts`
- `apps/api/src/services/embeddings.ts`
- `apps/api/src/services/persisted-learning-text-guard.ts`
- `apps/api/src/inngest/functions/transcript-purge-cron.ts`
- `apps/api/src/services/identity-v2/deletion-v2.ts`
- `apps/api/src/inngest/functions/account-deletion.ts`
- `apps/api/src/inngest/functions/consent-revocation.ts`

External primary sources:

- [EU General Data Protection Regulation](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), including Articles 6, 8, 9, 30, 35, and 56
- [Brønnøysund Register Centre — ZWIZZLY AS, organisation number 811 696 072](https://virksomhet.brreg.no/en/oppslag/enheter/811696072)
- [Norwegian Datatilsynet — cross-border processing and lead authority](https://www.datatilsynet.no/regelverk-og-verktoy/internasjonalt/grenseoverskridende-behandling-av-personopplysninger/)
- [Norwegian Datatilsynet — consent and children](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/om-behandlingsgrunnlag/samtykke/)
- [OpenAI — open-weight gpt-oss models and third-party hosting](https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss)

The final evidence pack should identify the exact deployed commit and attach machine-generated results. Repository paths and dates in this draft are evidence pointers, not substitutes for signed legal decisions, live-console exports, provider contracts, or production attestations.
