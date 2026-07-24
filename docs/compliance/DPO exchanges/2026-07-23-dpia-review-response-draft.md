# Draft response to Stephan’s DPIA review

**Review received:** 23 July 2026<br>
**Response revised:** 24 July 2026<br>
**Status:** Draft for management attestation and DPO/counsel review<br>
**Source review:** [Stephan’s complete ten-point review](2026-07-23-dpo-dpia-review-findings.md)<br>
**Decision annex:** [Management and DPO sign-off annex](2026-07-24-stephan-decision-annex.md)<br>
**Current configuration evidence:** [Privacy surface evidence refresh — 24 July 2026](../privacy-surface-evidence-2026-07-24.md)

Hi Stephan,

Thank you for the detailed cross-read. We agree with your central conclusion:
the DPIA is not ready for signature and production processing involving
children should not begin until the material blockers are closed and evidenced.

We will send the OpenAI DPA pack separately as a rolling submission. We are
collecting the equivalent executed terms, annexes, configuration, retention,
subprocessor, transfer, incident, and rights-support evidence for Anthropic and
Cerebras. We will not treat a vendor’s public privacy page, an API key, or a
repository description as a substitute for the applicable executed contract
and account configuration.

This response distinguishes four evidence states:

- **Verified in current code** means the behaviour is present on current
  `origin/main` and was inspected against source and tests.
- **Observed in production** means a dated configuration, deployment, runtime,
  database, or request-trace artefact exists.
- **Management decision** means the controller has chosen a product posture; it
  is not a legal conclusion or DPO approval.
- **Open** means the response cannot responsibly claim completion.

## Executive response

| Review item | Present answer | State |
|---|---|---|
| 1. Controller | ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway is the intended controller. Main establishment, accountable executive, lead authority, and cross-surface consistency still require signed evidence. | **Partial** |
| 2. Production architecture | Routing v2 is enabled in the production-source configuration. The live Worker is 332 commits behind current main and has Gemini registered. Current routing-v2 code excludes Gemini/Vertex, but key absence, current-code deployment, serving region, and request-level route evidence cannot be claimed. | **Material production gap** |
| 3. Scope and countries | Launch is consumer-only and 13+. Only jurisdictions whose current Article 8 self-consent threshold is verified as 13 may be enabled. Higher-threshold countries are a later expansion after jurisdiction-aware guardian authorisation is implemented and approved. Unknown or unverified residence fails closed. | **Management decision; implementation and legal verification open** |
| 4. Legal bases and consent | A proposed purpose matrix can be supplied, but counsel/DPO must approve it. Current code is not country-aware and does not consistently require an affirmative adult `llm_disclosure` grant before AI use. | **Open blocker** |
| 5. Article 9 | We withdraw any categorical claim that special-category data cannot be processed. The service does not intentionally solicit or use it, but incidental disclosure, inference, and storage are foreseeable; current suppression is narrow. | **Open blocker** |
| 6. Retention | Transcript purge and account/consent-deletion workflows exist, but configuration is not proof of execution. Derived records, dormancy, provider retention, backups/caches, monitoring coverage, and end-to-end erasure evidence remain incomplete. | **Open blocker** |
| 7. Other providers/transfers | The code can identify functions and likely data flows. Legal roles, contracting entities, executed terms, locations, retention, transfer mechanisms, and TIAs require a vendor-by-vendor evidence pack. | **Open blocker** |
| 8. Rights/access | Owner export and deletion exist, and guardian views are designed not to expose raw private chats by default. Export completeness, correction/restriction/objection, external erasure, staff access, identity verification, and cross-profile testing remain incomplete. | **Partial** |
| 9. Transparency/consultation | An in-chat AI disclosure exists. The adult and child notices remain drafts and need accurate controller/DPO, memory, profiling, retention, recipient, transfer, and store information. Article 35(9) consultation needs a documented decision and evidence. | **Open blocker** |
| 10. Approval | We accept your proposed sequence. Management will make the final proceed/no-proceed decision after receiving your separate opinion. Article 36 will be decided after residual-risk reassessment. | **Agreed process** |

## Provider-contract submission

For each LLM provider pack we will supply, where applicable:

1. the complete executed DPA and evidence of acceptance, version, and date;
2. all annexes, security terms, product terms, and incorporated documents;
3. contracting entity, account/product tier, and configured service;
4. models and data flows actually used;
5. subprocessor list and change-notification mechanism;
6. processing locations and remote-access posture;
7. SCC, Data Privacy Framework, adequacy, or other transfer mechanism;
8. retention/deletion and training/service-improvement terms;
9. special privacy/retention settings and dated console evidence;
10. incident and data-subject-rights assistance terms.

OpenAI, Anthropic, and Cerebras will be submitted on a rolling basis. No provider
may receive children’s data merely because its adapter exists or its credential
is present.

## 1. Controller identity and establishment

### Evidence supported now

The intended controller is:

> **ZWIZZLY AS**<br>
> Norwegian organisation number **811 696 072**<br>
> Fiskekroken 3B, 0139 Oslo, Norway

The official
[Brønnøysund Register Centre entry](https://virksomhet.brreg.no/en/oppslag/enheter/811696072)
confirms that legal name, organisation number, form, and registered address.
Repository-held DPIA, RoPA, notices, breach plan, and store-review drafts use
ZWIZZLY AS.

### Challenge and limitation

A Norwegian registered address does not by itself prove main establishment or
the lead supervisory authority. The decision must be based on where decisions
about the purposes and essential means are made and can be implemented. The
[Datatilsynet cross-border guidance](https://www.datatilsynet.no/regelverk-og-verktoy/internasjonalt/grenseoverskridende-behandling-av-personopplysninger/)
supports that factual analysis.

The repository cannot prove:

- where the relevant decision-makers work and exercise authority;
- the accountable executive’s identity and role;
- executed contracts and live Apple/Google console identity;
- that the historical “Cognoco s.r.o.” reference is absent from every external
  system;
- the final competent or lead supervisory authority.

We therefore do **not** ask you to accept the earlier unsupported conclusion
that the fabricated reference creates no controller or joint-controller issue.
Management must attest the underlying facts and external search.

### Close artefact

A signed controller/main-establishment memorandum, registry extract, named
accountable executive, reasoned supervisory-authority conclusion, and dated
reconciliation across the DPIA, RoPA, notices, terms, contracts, rights
workflow, support system, and both app-store consoles.

## 2. Current production architecture and LLM routing

### Production facts observed on 24 July

The `mentomate/prd` source configuration had:

- `LLM_ROUTING_V2_ENABLED=true`;
- `CHALLENGE_ROUND_GRADER_ENABLED=true`;
- credentials present for Cerebras, Mistral, OpenAI, Anthropic, Voyage **and
  Gemini**.

The scheduled Doppler-to-Worker sync completed successfully shortly before the
check. The live production health endpoint reported:

- deploy SHA `23951a69` from 14 July 2026;
- registered providers Gemini, OpenAI, Anthropic, Cerebras, and Mistral.

That deployed SHA was 332 commits behind current `origin/main`. This corrects
two overstatements in the earlier draft: Gemini’s production credential is
present, and current main cannot be described as the currently deployed
production code. See the
[dated evidence refresh](../privacy-surface-evidence-2026-07-24.md).

### Current-main routing inventory

When routing v2 is enabled, current main selects:

| Provider/model | Current-main role | Children’s data possible? |
|---|---|---|
| Cerebras `gpt-oss-120b` | Default conversational text; deep/asynchronous routes where called through the same router | Yes |
| Mistral `mistral-small-2603` | Free vision/OCR and free text fallback | Yes |
| OpenAI `gpt-5-mini` | Paid vision/OCR and text fallback | Yes |
| OpenAI `gpt-5.4` | Eligible premium/deep rungs | Yes |
| Anthropic `claude-sonnet-4-6` | Challenge/suitability judge and fallback | Yes |
| Voyage `voyage-3.5`, 1,024 dimensions | Embeddings outside the conversational fallback chain | Yes |
| Gemini/Vertex | Excluded from routing-v2 candidates; Gemini adapter is registered when its key exists and legacy code remains | Not under routing v2; regression exposure remains |

Code authority:
[router](../../../apps/api/src/services/llm/router.ts),
[provider registration](../../../apps/api/src/middleware/llm.ts), and
[configuration validation](../../../apps/api/src/config.ts).

### Fallback behaviour and defects

The implementation does not execute a multi-hop cascade. After the primary
route exhausts its retry policy, it selects one eligible fallback and makes one
fallback call. Streaming can fall back only before the first response bytes.
Transient network/timeout, 408, 429, and 5xx failures are eligible; policy,
validation, safety, and ordinary client errors are not treated as availability
failures. Circuit state opens after three recorded failures for 60 seconds, but
that state is process/isolate-local rather than a durable global control.

There is a current same-primary defect:

- free vision can select Mistral as “fallback” after Mistral failed;
- paid vision can select `gpt-5-mini` as “fallback” after that same route failed.

The code therefore cannot support a statement that vision always fails over to
a different provider. Nor can the preference list be described as a complete
runtime chain.

### Data sent and identifiers

Providers receive the learner’s authored conversation content and, for vision,
the submitted image. System context can include learning state, safety context,
and persistent-memory material. A minor’s profile display name is excluded;
an adult’s sanitised first name may be supplied.

`sanitizeUserContent()` removes a server-note marker. It is not a general PII
or Article 9 egress filter. The minor PII-echo control evaluates provider output
after provider processing; it does not prevent sensitive input reaching the
provider. We therefore cannot claim that direct identifiers or sensitive text
are comprehensively removed before transmission.

### Geography, retention, and fail-closed limits

The router currently labels candidates with `servingRegion: 'global'`; it
receives no habitual-residence or jurisdiction input. Provider-side retention,
training restrictions, remote support, subprocessors, and processing location
are contractual/account-configuration facts, not established by code.

Routing v2 excludes Gemini/Vertex and throws if no permitted registered
candidate exists. That is useful design evidence. It is not sufficient
production proof while:

- production runs an older deployment;
- Gemini is credentialled and registered;
- legacy routing and a reversible feature flag remain;
- there are no retained representative production route traces;
- the country/processing-location policy is not implemented.

### Close artefact

Deploy the approved current code; retain the production workflow and resulting
health SHA; remove or formally control the dormant Gemini credential; fix and
test the vision fallback defect; and run synthetic text, vision, deep,
asynchronous, judge, embedding, outage, and fail-closed traces for adult and
13–17 profiles. The trace pack must record effective provider, model, region,
fallback, and persistence result without using real children’s data.

## 3. Scope, launch countries, and current processing status

### Management decision

The launch perimeter is:

- direct-to-consumer only;
- credentialled accounts;
- minimum age 13;
- no school or institutional deployment;
- only countries whose **current, verified Article 8 digital self-consent
  threshold is 13**;
- unknown, unsupported, stale, or legally unverified residence blocked;
- under-13 access blocked.

The present candidate set is Belgium, Estonia, Finland, Iceland, Latvia, Malta,
Norway, Portugal, and Sweden. It is not a final launch allowlist. Each country
must pass the common launch gates and a launch-day legal check. Norway has a
pending threshold-change proposal; Portugal has pending legislative change and
must not be enabled without current counsel confirmation. The sourced working
matrix is in the
[13+ EEA country ruling](../2026-07-23-13-plus-eea-launch-country-ruling.md).

After launch, MentoMate intends to add every country it can lawfully and
operationally support. A higher-threshold country may be enabled only after the
country matrix and jurisdiction-specific guardian-authorisation flow are
implemented, legally verified, tested, and activated. That is expansion work,
not part of the initial launch claim.

### Current code gap

Current code has a minimum profile age of 13 and rejects the under-13 creation
path. Some family/guardian scaffolding exists, but it is inaccurate to describe
under-13 support as “built but dormant.”

The implemented residence model collapses geography to `EU`, `US`, or `OTHER`;
the consent service applies a global guardian rule at age 16 or below. It does
not resolve national Article 8 thresholds, habitual residence, effective dates,
or launch-country enablement. Store availability is therefore a
compliance-load-bearing control until server-side country enforcement exists.

### Operational facts still required

Management/Operations must attest:

- exact enabled Apple and Google countries on the proposed launch date;
- expected closed-beta and public-launch user counts and age distribution;
- anticipated transcript, image, memory, assessment, and telemetry volumes;
- whether any live production processing involving 13–17-year-olds has begun;
- the current count and age bands of production profiles, including test and
  staff accounts;
- that school/institutional use is not being marketed or enabled.

The repository cannot prove “no production child users.” That needs a dated
database query and accountable operational attestation.

The DPIA must be reopened before younger children, additional jurisdictions,
school/institutional use, grading or placement decisions, advertising, emotion
recognition, or model training on user data.

## 4. Legal bases, consent, and Article 8

### Working matrix for legal review

| Purpose | Data/role | Proposed basis requiring DPO/counsel confirmation |
|---|---|---|
| Adult account administration | Account, authentication, profile, service settings | Article 6(1)(b); security/legal records separated below |
| Child tutoring conversations | Child prompts, images, outputs, session context | Consent under Article 6(1)(a) and Article 8 where the service is offered directly to the child |
| Persistent learning memory | Summaries, notes, concepts, misconceptions, quotes, embeddings | Consent, separate and as granular as required; necessity and minimisation to be justified |
| Assessment/progress profiling | Mastery, progress, recommendations, derived learning state | Consent unless counsel establishes another suitable basis; profiling transparency required |
| Guardian/supporter access | Link, authority, recap/progress visibility | Contract/consent split by actor and purpose; best-interests/necessity assessment |
| Age/residence/authority | Date of birth, habitual residence, assurance, guardian evidence | Legal obligation and/or legitimate interests as advised; retention minimised |
| Security and abuse prevention | Logs, identifiers, rate limits, incident records | Article 6(1)(f), with balancing assessment; Article 6(1)(c) where a specific obligation applies |
| Billing | Purchaser, subscription, transaction and tax records | Articles 6(1)(b) and 6(1)(c), activity by activity |
| Transactional communications | Verification, receipts, service and safety messages | Article 6(1)(b)/(c)/(f), message by message |
| Optional communications/waitlist | Email, preferences, provenance | Article 6(1)(a), with independent withdrawal |

This is a proposal, not the final legal-basis determination.

### Current consent evidence and challenge

Current code records `platform_use` and `llm_disclosure` purposes and exposes
authenticated accept, withdraw, and accountability-history endpoints. A
parental authorisation path exists for minors.

However, `isLlmExchangeConsentAllowed()` allows AI exchange when there is no
consent row and denies only an explicit withdrawn state. It is therefore an
explicit-withdrawal block, not proof of prior affirmative consent for every
user. The global age-16 rule is not a national Article 8 implementation. The
code also cannot yet enforce the launch allowlist by habitual residence.

### Close artefact

1. DPO/counsel-approved purpose/role/data/basis matrix.
2. Effective-dated country threshold matrix with primary-law provenance.
3. Fail-closed habitual-residence and launch-country enforcement.
4. Affirmative, versioned, purpose-specific consent before applicable AI use.
5. Jurisdiction-correct guardian authority for later expansion.
6. Tests for refusal, withdrawal, re-consent, ageing across a threshold,
   residence change, disputed authority, and deletion/archive consequences.
7. Notices and product behaviour consistent with the approved matrix.

## 5. Special-category data

We withdraw the categorical statement that no Article 9 data are collected or
inferred. For open-text tutoring, incidental disclosure or model-generated
inference concerning health, disability, religion, politics, ethnicity, sexual
orientation, or other special-category matters is foreseeable.

The intended product rule is narrower:

> MentoMate does not intentionally ask for, infer for product purposes, or use
> special-category data to personalise tutoring, assess the learner, advertise,
> or train models. Incidental processing remains a risk that must be minimised,
> suppressed from durable learning records, and given short retention.

### Current controls and their limit

The
[persisted-learning-text guard](../../../apps/api/src/services/persisted-learning-text-guard.ts)
blocks a small English-language list of explicit health/disability
characterisations in selected learning fields. It does not cover all Article 9
categories, languages, paraphrases, contextual inferences, raw transcripts,
summaries, or every derived record. `sanitizeUserContent()` is not a sensitive
data filter. These controls cannot support an “Article 9 out” implementation
claim.

The crisis path records limited event metadata and directs the user toward
external help. It does not notify a guardian. Whether that is an appropriate
safeguarding posture requires a documented legal, clinical/safeguarding, and
best-interests review; code cannot decide it.

### Close artefact

- child-readable discouragement and just-in-time notices;
- prompt and server controls against solicitation/unnecessary inference;
- multilingual detection/suppression tests across every memory and derived
  field;
- prohibition on durable storage and profiling use;
- short, explicit retention and deletion rules, including provider handling;
- safeguarding/crisis procedure, escalation boundaries, and ownership;
- documented Article 9 legal conclusion addressing incidental processing and
  any applicable condition or prohibition.

The internal product decision not to use Article 9 data is useful risk intent;
it is not legal or technical closure.

## 6. Retention and deletion

### Current code evidence

The daily transcript-purge job is gated by `RETENTION_PURGE_ENABLED`, which was
`true` in the 24 July production-source configuration. It selects completed
sessions 30 days after `summaryGeneratedAt`, requires complete summary fields,
and processes at most 100 eligible sessions per run. A delayed/incomplete check
starts at day 37 and processes at most 50 records.

Important gaps:

- sessions with `summaryGeneratedAt=null` are not covered by the delayed query;
- backlogs beyond the batch caps are not proved absent;
- Voyage embedding creation occurs before transcript deletion and a Voyage
  failure can delay deletion;
- configuration and cron registration do not prove execution or deletion;
- summaries, assessments, mastery, misconceptions, notes, quotes, and
  replacement embeddings survive according to separate or undefined periods.

The account-deletion workflow has a seven-day grace period and coordinates
database erasure with Clerk and external billing teardown, with retries and
terminal alerting. Consent withdrawal also uses a seven-day grace period;
eligible older profiles may choose a 30-day archive. The archive-cleanup path
does not have equivalent dedicated terminal-failure evidence. There is no
complete general dormancy sweep.

### Retention schedule still required

The approved schedule must separately cover:

- account/profile and identity/authority evidence;
- raw conversation events, images, and attachments;
- summaries, recaps, notes, quotes, assessments, mastery, misconceptions,
  recommendations, and embeddings;
- consent grants/withdrawals and accountability evidence;
- billing, tax, and transaction records;
- security, telemetry, Sentry/error, support, and incident records;
- waitlist and optional communications;
- deletion-job logs and legal holds;
- caches, queues, vector stores, replicas, backups, and provider copies.

### Close artefact

Production scheduler history, backlog metrics, failure/terminal alerts,
representative database sampling, a null-summary/backlog remediation test,
provider deletion evidence, backup/restore-deletion policy, and an end-to-end
erasure test covering the database, vector data, Clerk, billing, messaging,
observability, queues, caches, and each processor.

## 7. Other providers and international transfers

The provider register must include more than the three LLM vendors:

| Provider/category | Processing function evidenced in the product | Evidence not established by code |
|---|---|---|
| Clerk | Authentication and account identity | Contracting entity, executed DPA, locations, retention, transfer/TIA |
| Voyage AI | Learning-memory embeddings | Executed terms, retention/training, locations, subprocessors, transfer/TIA |
| Stripe/RevenueCat | Payments, subscriptions, entitlements, webhooks | Activity-specific role, terms, retention, transfers, erasure limits |
| Resend | Transactional email | Executed terms, locations, retention, subprocessors, transfer/TIA |
| Sentry | Error and performance observability | Scrubbing effectiveness, retention, locations, terms, transfer/TIA |
| Inngest | Durable workflow/event orchestration | Payload inventory, terms, retention, locations, transfer/TIA |
| Neon/AWS | Primary database and underlying infrastructure | Contract chain, region, backups, subprocessors, transfer/TIA |
| Cloudflare | API execution, network/security, KV and operational metadata | Activity-specific role, locations, logs, terms, transfer/TIA |
| Expo/EAS | Build/update and mobile operational services | Payload boundary, role, terms, locations, retention, transfer/TIA |
| APNs/FCM | Push delivery | Payload minimisation, role, terms, retention, transfer analysis |
| Apple/Google | Store distribution, payments, device/platform services | Controller/processor role per activity, notices, terms, transfers |

For each row the pack must contain the function, data fields, data-subject
groups, legal role, contracting entity, executed agreement, subprocessors,
processing/remote-access locations, retention/deletion, security evidence,
transfer mechanism, and TIA where required.

Apple and Google will be assessed activity by activity; we will not assume one
role covers store distribution, payment, analytics, notifications, and device
services.

## 8. Rights, access controls, and guardian visibility

### What current code supports

Authenticated account owners can request export and account deletion. Export
includes substantial profile, session/event, summary, assessment, and embedding
data. Owner-only controls hide export/delete, billing, and account security from
non-owner child profiles.

The guardian/supporter design exposes recaps and progress rather than raw
private conversations, notes, or memory by default. That is the intended
least-visibility posture.

### Gaps

The export is not demonstrably complete; at least topic-note and
concept-mastery coverage needs reconciliation. End-to-end evidence is also
missing for:

- correction of date of birth, residence, authority, and inferred learning
  data, including disputed inferences;
- restriction and objection;
- consent withdrawal consequences;
- portability format and completeness;
- external-provider deletion;
- identity and authority verification for rights requests;
- staff/privileged access and audit;
- cross-profile and cross-tenant isolation;
- guardian/supporter unlink, expiry, and access revocation.

Application-level scoping tests are useful. The controller’s separate risk
acceptance of application-layer rather than database-native row-level security
is a management risk decision, not evidence that cross-tenant access is
impossible or DPO-approved.

### Close artefact

A rights test matrix using adult owner, 13–17 learner, guardian/supporter,
former guardian, and staff roles; complete export schema reconciliation; and
end-to-end access, correction, withdrawal, restriction, objection, portability,
and erasure tests across internal and external systems.

Guardian access to raw child conversations must remain off by default unless a
documented necessity, proportionality, best-interests, transparency, and
authorisation assessment supports a specific exception.

## 9. Transparency, child consultation, and AI disclosure

The chat UI shows the message “You’re talking to an AI mentor.” That is useful
point-of-interaction disclosure. It does not complete the transparency package.

The repository-held adult notice and child-readable summary remain drafts. They
must accurately and consistently explain:

- controller and working DPO/rights contact details;
- AI interaction and relevant limitations;
- persistent memory, assessment, profiling, derived records, and guardian
  visibility;
- purposes, legal bases, recipients, processing locations, transfers, and
  retention;
- consent/refusal/withdrawal and rights;
- crisis/safeguarding limits;
- actual launch countries and age rules;
- app-store declarations.

We agree that use of the UK Children’s Code as a design reference does not
replace the Article 35(9) assessment. Management must choose and document one of:

1. age-appropriate comprehension/usability consultation with children and
   guardians before public child processing; or
2. a reasoned conclusion that consultation is not appropriate, with an
   alternative evidence method and your review.

The recommended route is consultation using prototypes and synthetic content,
without recruiting participants into live child-data processing before the
DPIA gate is closed.

## 10. Approval process

We accept your proposed sequence and role separation.

No public child processing should begin until the launch blockers are closed
and evidenced. A tightly controlled non-child synthetic production test does
not change that rule. If management proposes any child beta before final
approval, it must be presented as a separate, specifically assessed decision
with its own lawful basis, notices, safeguards, data minimisation, stopping
rules, and DPO advice; this draft does not authorise it.

The closure sequence is:

1. reconcile the DPIA and Technical Companion to verified production facts;
2. approve and implement the legal-basis and Article 8 position;
3. complete the Article 9 and safeguarding conclusion;
4. review all provider contracts, locations, transfers, retention, and TIAs;
5. verify the controls, rights, retention, deletion, and route traces;
6. publish consistent adult, child, just-in-time, and store transparency;
7. reassess every residual risk;
8. decide whether Article 36 prior consultation is required;
9. obtain and record the DPO’s separate opinion and recommendations;
10. have accountable management make and sign the proceed/no-proceed decision.

Your signature would record independent DPO advice and review. It would not
constitute the controller’s approval. The accompanying
[decision annex](2026-07-24-stephan-decision-annex.md) is structured to preserve
that distinction.

Best regards,<br>
Zuzana
