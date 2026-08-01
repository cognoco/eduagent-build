# Processor and transfer evidence ledger

**Controller:** ZWIZZLY AS, organisation no. 811 696 072
**Product:** MentoMate / EduAgent
**Prepared:** 25 July 2026
**Last revalidated:** 26 July 2026
**Code baseline reviewed:** `main` at `2df76a9147fe0cdec35761b23327b9e083310b3e`
**Work Item:** WI-1192 - Prepare processor and transfer evidence ledger for counsel
**External-execution owner:** OPQ-110 - Execute Art 28 processor DPAs and per-vendor transfer TIAs

This ledger is the internal controller evidence package. It records what the
current repository can prove about recipients, routing, data categories, and
available artifacts. It does not sign vendor contracts, store confidential
vendor material, or make the final legal conclusion that a DPA, SCC set, TIA,
or supplementary-measures package is sufficient.

## Bottom line

The repository-controlled reconciliation is complete enough to separate three
things clearly:

1. **Live recipients on current `main`:** Cerebras, Mistral, OpenAI, Anthropic,
   Voyage AI, Clerk, Neon, Cloudflare, Inngest, Sentry, Resend, RevenueCat,
   Apple/Google app stores, Expo push service, Apple APNs, and Google FCM.
2. **Dormant or excluded paths:** OpenRouter is eval-only, Gemini/Vertex are
   policy-excluded for this app, DeepInfra/DeepSeek is dormant, Stripe is
   runtime-capable but unconfigured in production, and the country/residence-aware
   LLM rule table is not yet implemented.
3. **Remaining external/legal work:** OPQ-110 owns execution or legal
   acceptance of DPAs, SCCs, TIAs, ZDR/no-training evidence, subprocessor
   review, and DPO/counsel sign-off.

One controller-owned engineering follow-up was found during this review and
resolved by WI-2740: Mistral is documented as the EU secondary/vision route,
and the adapter now uses
`https://api.eu.mistral.ai/v1/chat/completions`. This aligns the runtime with
the EU endpoint identified in the procurement research.

## Reconciliation inputs

| Source | Evidence used |
|---|---|
| LLM model register | `docs/registers/llm-models/master.md` active, dormant, excluded, and region-axis sections |
| Runtime provider registration | `apps/api/src/middleware/llm.ts` registers Gemini, OpenAI, Anthropic, Cerebras, and Mistral from env keys |
| Runtime LLM matrix | `apps/api/src/services/llm/router.ts` V2 matrix, fallback ladder, judge routing, and Gemini/Vertex exclusion |
| Provider adapters | `apps/api/src/services/llm/providers/*.ts`, `apps/api/src/services/embeddings.ts`, `apps/api/src/services/ocr.ts` |
| DPIA / ROPA | `docs/compliance/dpia.md`, `docs/compliance/ropa.md` |
| Privacy-surface evidence | `docs/compliance/history/2026-07-22-privacy-surface-evidence.md` |
| Provider evidence index | `docs/compliance/evidence/providers/README.md` |
| Provider assessments/research | Cerebras assessment and Mistral/Voyage research under `docs/compliance/assessments/providers/` and `docs/compliance/research/providers/` |

Production configuration was rechecked by secret name only in Doppler `prd` on
2026-07-26; no secret values were copied into this package. The production
configuration contains keys for Cerebras, Mistral, OpenAI, Anthropic, Voyage,
Clerk, Neon, Inngest, Sentry, Resend, RevenueCat, Expo, and Cloudflare. The six
non-secret runtime gates checked (`LLM_ROUTING_V2_ENABLED`,
`CHALLENGE_ROUND_GRADER_ENABLED`, `CHALLENGE_ROUND_RUNTIME_ENABLED`,
`JUDGE_FRAMEWORK_ENABLED`, `JUDGE_ENFORCEMENT_ENABLED`, and
`RETENTION_PURGE_ENABLED`) were all `true`. Key presence proves configuration,
not that a vendor contract or transfer assessment is legally sufficient.

## Two-way recipient diff

Every runtime-discovered recipient has a ledger row below. Every live ledger
row maps to current code, the DPIA/ROPA, provider evidence, or an explicit
external dependency.

| Discovered recipient | Runtime/evidence source | Ledger disposition |
|---|---|---|
| Cerebras Systems Inc. | V2 primary text path; `createCerebrasProvider`; model register active row | Live row L1 |
| Mistral AI | V2 free vision/secondary path; `createMistralProvider`; model register active row | Live row L2; runtime uses `https://api.eu.mistral.ai/v1/chat/completions` |
| OpenAI | V2 paid vision/secondary/deep reasoning; `createOpenAIProvider`; signed DPA evidence | Live row L3 |
| Anthropic | Judge and rung 4-5 fallback; `createAnthropicProvider`; model register active row | Live row L4 |
| Voyage AI | `VOYAGE_API_URL` embedding endpoint | Live row L5 |
| Clerk | Auth/JWKS/login binding and backend delete API | Live row I1 |
| Neon | Database hosting / pgvector | Live row I2 |
| Cloudflare | API compute / Workers / KV | Live row I3 |
| Inngest | Durable background jobs and event/state processing | Live row I4 |
| Sentry | Error/performance monitoring | Live row I5 |
| Resend | Transactional email endpoint | Live row I6 |
| RevenueCat | Subscription and entitlement state | Live row I7 |
| Apple App Store / Google Play | Store purchase/payment rails | Live row I8 |
| Expo push service | Push send endpoint | Live row I9 |
| Apple APNs / Google FCM | Downstream mobile push delivery | Live row I10 |
| OpenRouter | Adapter header says eval-only and not registered in production middleware | Excluded/dormant row X1 |
| Gemini / Vertex | `FALLBACK_FORBIDDEN = {'gemini','vertex'}` under V2; model register excluded | Excluded row X2 |
| DeepInfra / DeepSeek | Model register dormant, no pinned production route | Dormant row X3 |
| Stripe | Billing and webhook routes are present, but the 2026-07-26 production secret-name inventory contains no `STRIPE_*` bindings | Dormant/unconfigured row X5 |

No additional live personal-data recipients were found in the reviewed
current-main code paths. Local/mobile OCR can run on-device before server
fallback; when it falls back server-side, the server OCR provider is the LLM
router's vision capability, not a separate OCR vendor.

## Live AI, OCR, and embedding rows

| ID | Service / contracting entity | Role | Data and purpose | Runtime evidence | Region / transfer position | Internal artifact status | What remains outside code |
|---|---|---|---|---|---|---|---|
| L1 | Cerebras Systems Inc. - Cerebras Inference API | Processor | Tutoring prompts, selected session history, learning context, generated outputs, async learning jobs; no direct MentoMate IDs intentionally sent by adapter | `router.ts` default V2 text path uses `gpt-oss-120b`; `cerebras.ts` posts to `https://api.cerebras.ai/v1/chat/completions`; model register says universal primary, including async jobs | US transfer. Current country/residence primary substitution is not built; EEA traffic uses this primary path unless product gating avoids launch traffic | Controller assessment complete; proposed DPA prepared; Trust Center evidence reviewed under NDA; DPA not yet binding | Cerebras must provide binding DPA/order form, SCC coverage, TIA evidence/acceptance, retention/log and subprocessor confirmations; DPO/counsel and management must approve |
| L2 | Mistral AI - La Plateforme API | Processor | Free-tier secondary text and free vision/OCR when V2 matrix routes `capability='vision'`; image content and extracted homework text may be included | `router.ts` V2 vision branch routes free to `mistral-small-2603`; `mistral.ts` posts to `https://api.eu.mistral.ai/v1/chat/completions`; OCR uses `routeAndCall` through the same router | Runtime and register consistently use the documented EU secondary/vision endpoint | Public DPA PDF and ZDR-enabled screenshot retained; research memo complete | Counsel/DPO to accept stock DPA, special-category mismatch, SCC/onward-transfer position, and ZDR sufficiency |
| L3 | OpenAI, L.L.C. / applicable OpenAI contracting entity | Processor | Paid secondary text/vision, GPT-5 mini fallback, and GPT-5.4 deep reasoning for non-Family paid tiers/add-on | `router.ts` V2 matrix routes paid vision to `gpt-5-mini`, premium rung 4-5 to OpenAI advanced model; `openai.ts` direct provider | Register records EU-residency deployment and ZDR for minors | Organisation-specific signed OpenAI DPA naming ZWIZZLY AS is retained in provider evidence | Confirm current ZDR/minor settings and region configuration in account evidence; DPO/counsel TIA/sign-off |
| L4 | Anthropic, PBC | Processor | Judge/grader and rung 4-5 fallback; may receive learner answers or model output under review. Vendor independence is required when the judged tutor output came from another provider; the router now threads the actual producer vendor so an Anthropic-produced tutor reply is not incorrectly treated as independent | `router.ts` `ANTHROPIC_SONNET_MODEL`, `resolveGraderConfig`, fallback logic, and effective-provider propagation; `anthropic.ts` direct provider | Region not established in current internal evidence | No current provider evidence file found in `docs/compliance/evidence/providers/` during this review | Obtain DPA, no-training/retention evidence, transfer safeguards, subprocessor evidence, and DPO/counsel TIA/sign-off |
| L5 | Voyage AI Innovations, Inc. - Voyage hosted embeddings API | Processor | Text used to create semantic embeddings for memory recall; vectors stored in Neon | `embeddings.ts` posts to `https://api.voyageai.com/v1/embeddings` with `voyage-3.5` | US/unknown hosted region; no EU region selector found in public research | Public DPA PDF retained; research memo complete | Add payment method and opt-out/ZDR evidence; confirm organisation/account identity; DPO/counsel TIA and acceptance of hosted-region uncertainty |

## Live infrastructure and communications rows

| ID | Service / contracting entity | Role | Data and purpose | Runtime evidence | Region / transfer position | Artifact status | What remains outside code |
|---|---|---|---|---|---|---|---|
| I1 | Clerk | Processor | Authentication, login identity, email, Clerk user/session binding | Mobile uses `@clerk/expo`; API verifies Clerk JWT/JWKS; `clerk-user.ts` calls Clerk Backend API; account deletion calls `deleteClerkUser` | US transfer expected | ROPA and DPIA record Clerk; code erasure path present | DPA and TIA evidence package still belongs in OPQ-110 unless already held outside repo |
| I2 | Neon | Processor | PostgreSQL database, pgvector embeddings, identity and learning records | Database package README and schema; `DATABASE_URL`; Drizzle/Neon usage | Host region depends on deployed Neon project | ROPA/DPIA identify Neon | Confirm production project region, DPA, backup/deletion retention, TIA where needed |
| I3 | Cloudflare | Processor | API compute, Workers runtime, KV, request handling | `wrangler.toml`; Hono Worker API; Cloudflare deployment architecture | Region depends on Cloudflare service configuration; Workers can be global | ROPA/DPIA identify Cloudflare | Confirm DPA, regional settings if any, logs, subprocessor and transfer position |
| I4 | Inngest | Processor | Durable background events/step state for deletion, purge, reports, jobs | `inngest/client.ts`, `/v1/inngest` route, event schemas | US transfer expected unless contract says otherwise | ROPA/DPIA identify Inngest | Confirm DPA, event retention, payload minimisation, TIA |
| I5 | Sentry | Processor | Error/performance monitoring; scrubbed diagnostics, may include IDs/metadata | `apps/api/src/services/sentry.ts`, mobile Sentry setup, package dependencies | US transfer expected unless configured otherwise | ROPA/DPIA identify Sentry and scrubbing | Confirm org DPA, retention, PII scrubbing settings, TIA |
| I6 | Resend | Processor | Transactional and consent/security emails | `notifications/email.ts` posts to `https://api.resend.com/emails` | US transfer expected | ROPA/DPIA identify Resend | Confirm DPA, sender/domain account identity, retention, TIA |
| I7 | RevenueCat | Processor | Subscription entitlement, store correlation identifiers, webhook events | RevenueCat env keys and billing schema fields; mobile RevenueCat hook | US transfer expected | ROPA/DPIA identify RevenueCat | Confirm DPA, API key/account entity, retention, TIA |
| I8 | Apple App Store / Google Play | Independent controller / payment platform, with processor-like touchpoints for store IDs | Store purchase/payment rail and receipts; MentoMate stores correlation IDs | Billing/store fields and mobile purchase integration | Store-platform processing under their own terms | ROPA records app stores via RevenueCat | Counsel/DPO to classify role, notice wording, and transfer/contract needs |
| I9 | Expo push service | Processor | Expo push tokens and notification payloads | `notifications.ts` posts to `https://exp.host/--/api/v2/push/send` | US transfer expected | ROPA row added for push | Confirm DPA/terms, payload minimisation, retention, TIA |
| I10 | Apple APNs / Google FCM | Downstream push delivery provider | Push token/payload delivery to device OS | Expo push service forwards to APNs/FCM; ROPA row records chain | US/global | ROPA records downstream chain | Counsel/DPO to classify role and transfer/notice treatment |

## Per-recipient contracting and lifecycle facts

This table completes the fields that are easy to lose in a runtime-only
inventory. "Unknown" means the current internal evidence does not establish
the fact; it is deliberately left for OPQ-110 rather than inferred by
engineering.

| Row | Product tier / account | Serving or processing region | Known subprocessors | Retention / deletion facts in internal evidence | Contract or transfer artifact location / status |
|---|---|---|---|---|---|
| L1 Cerebras | Inference API; production key present; exact commercial tier unknown | US endpoint | Trust Center materials reviewed under NDA; publishable list not retained in git | Proposed requirement is ZDR/no training; binding vendor commitment remains open | Controller assessment and proposed DPA under `docs/compliance/assessments/providers/`; executable agreement, SCCs and TIA remain with OPQ-110 |
| L2 Mistral | Scale/API organisation evidence; production key present | Runtime uses `https://api.eu.mistral.ai/v1/chat/completions`, aligned with the documented EU endpoint | Current list referenced through vendor trust materials; exact approved snapshot remains for OPQ-110 | Public evidence says 30-day default for applicable APIs; retained screenshot records ZDR enabled for ZWIZZLY AS; coverage exceptions remain documented in research | Public DPA and non-secret ZDR evidence indexed in `docs/compliance/evidence/providers/`; counsel acceptance and onward-transfer review open |
| L3 OpenAI | Organisation-specific API account; production key present; exact commercial tier unknown | Register claims EU-residency deployment; live account setting requires external confirmation | Unknown from current non-confidential internal evidence | ZDR for minors is required by the register; current account-level confirmation remains open | Organisation-specific DPA is indexed under `docs/compliance/evidence/providers/`; region/ZDR evidence and TIA acceptance remain with OPQ-110 |
| L4 Anthropic | Direct API; production key present; exact commercial tier unknown | Unknown | Unknown | No-training, provider retention and deletion facts are not established in current internal evidence | No provider artifact is indexed; DPA, transfer mechanism and TIA are open in OPQ-110 |
| L5 Voyage | Hosted embeddings API; production key present; organisation opt-out requires a paid plan | US / hosted region unknown | Public DPA identifies AWS and Google | Current stateless embeddings path; zero-day retention begins only after organisation opt-out, which remains pending; Files API has a separate 30-day rule but is not used | Public DPA and dated research are indexed; opt-out evidence, organisation identity and TIA acceptance remain with OPQ-110 |
| I1 Clerk | Production auth account; publishable and server keys present | US transfer expected | Unknown | App deletion flow erases the external Clerk identity; provider backup/log retention unknown | DPIA/ROPA and deletion code are internal evidence; DPA/TIA location not recorded and remains with OPQ-110 |
| I2 Neon | Production PostgreSQL project; `DATABASE_URL` present | Exact production project region not recorded in this package | Unknown | Application erasure cascades delete person-scoped records; provider backup retention unknown | DPIA/ROPA and schema are internal evidence; project-region, DPA and transfer artifacts remain with OPQ-110 |
| I3 Cloudflare | Workers/KV production account; account and deploy credentials present | Global/unknown for the enabled services | Unknown | Application request handling is transient; Worker/KV/log retention settings are not established here | `wrangler.toml`, deployment configuration and DPIA/ROPA are internal evidence; DPA/transfer package remains with OPQ-110 |
| I4 Inngest | Production event/signing keys present; exact plan unknown | US transfer expected | Unknown | Durable event and step-state retention is not established in current internal evidence | Client, event schemas and DPIA/ROPA are internal evidence; DPA, retention and TIA remain with OPQ-110 |
| I5 Sentry | Production DSN/account configuration present; exact plan unknown | US transfer expected | Unknown | Application-side PII scrubbing is documented; provider event retention is not established here | Sentry setup and DPIA/ROPA are internal evidence; account settings, DPA and TIA remain with OPQ-110 |
| I6 Resend | Production API key present; exact plan unknown | US transfer expected | Unknown | Transactional message retention/deletion is not established in current internal evidence | Email endpoint and DPIA/ROPA are internal evidence; DPA, retention and TIA remain with OPQ-110 |
| I7 RevenueCat | Production mobile/webhook configuration present; exact plan unknown | US transfer expected | Unknown | MentoMate retains financial correlation records for the applicable legal/tax window; provider retention is unknown | Billing integration and DPIA/ROPA are internal evidence; DPA and TIA remain with OPQ-110 |
| I8 Apple / Google stores | Production app-store payment rails; exact contracting accounts not recorded here | Global | Platform-specific downstream providers unknown | Store receipt/payment retention follows platform and legal requirements; MentoMate keeps only correlation records described in the ROPA | Billing code and ROPA are internal evidence; role classification and platform contract/transfer treatment remain with OPQ-110 |
| I9 Expo push | Production Expo account/token present; exact plan unknown | US transfer expected | Apple APNs and Google FCM are the known delivery chain | Push tokens live for device registration; notification payloads are transient in the application; provider retention unknown | Push code and ROPA are internal evidence; DPA/terms and TIA remain with OPQ-110 |
| I10 APNs / FCM | Downstream service selected by device platform | Global | Platform-specific downstream providers unknown | Device token/payload lifecycle is platform-controlled and not established in this package | ROPA records the chain; counsel role classification and transfer/notice treatment remain with OPQ-110 |

## Targeted policy-exclusion evidence

- **Minor-routing guard:** `apps/api/src/services/llm/router.ts` defines
  `isUnder18AgeBracket` and uses it in both legacy primary and fallback
  selection so a child or adolescent cannot reach Gemini; the break and
  fail-closed cases are preserved in
  `apps/api/src/services/llm/router.fallback-compliance.test.ts`.
- **Production V2 exclusion floor:** the same router defines
  `FALLBACK_FORBIDDEN` for Gemini/Vertex before provider selection. Production
  had `LLM_ROUTING_V2_ENABLED=true` at the 2026-07-26 check, so the stronger
  age-independent exclusion is the active path; the legacy minor guard remains
  regression evidence for flag-off behavior.
- **OCR path:** `apps/api/src/services/ocr.ts` sends server-side vision work
  through `routeAndCall`; it therefore uses the LLM vision rows above rather
  than an undisclosed OCR processor.
- **Embedding path:** `apps/api/src/services/embeddings.ts` directly calls the
  Voyage hosted embeddings endpoint recorded in L5.
- **Engineering resolution:** WI-2740 - Align Mistral runtime endpoint with
  EU-region processor claim - routes the Mistral adapter through
  `https://api.eu.mistral.ai/v1/chat/completions` and protects the endpoint
  with a provider regression test.

## Dormant, eval-only, or excluded rows

| ID | Recipient | Current disposition | Evidence |
|---|---|---|---|
| X1 | OpenRouter | Eval-only adapter; not registered by production LLM middleware. Do not treat as launch processor unless promoted to production. | `openrouter.ts` header says eval-only and warns not to ship production minor data through broker; `llm.ts` middleware does not register it |
| X2 | Gemini / Vertex | Excluded for this app; V2 fail-closed guard excludes `gemini` and `vertex`. Legacy code still contains provider support, but current model register says excluded. | `router.ts` `FALLBACK_FORBIDDEN`; model register excluded table |
| X3 | DeepInfra / DeepSeek | Dormant and not pinned in production route. Activation requires provider DPA and DPIA paragraph. | model register dormant table |
| X4 | Country/residence-aware AI routing | Not implemented. Register explicitly says Europe/rest primary substitution is a future rule-table addition. | model register region-axis section; router uses `V2_SERVING_REGION_PLACEHOLDER='global'` |
| X5 | Stripe | Billing, checkout and webhook code is mounted but fail-closed without configuration. The 2026-07-26 Doppler `prd` inventory contains no `STRIPE_*` secret or price binding, so Stripe is not in the current production recipient set. Reconcile the ledger and ROPA before enabling it. | `apps/api/src/routes/billing.ts`, `apps/api/src/routes/stripe-webhook.ts`, `apps/api/src/config.ts`; production secret-name inventory |

## Handoff checklist for OPQ-110

The Cosmo relation was rechecked on 2026-07-26: WI-1192 and OPQ-110 point to
each other, OPQ-110 is `In progress`, and Zuzka is its authority. OPQ-110 owns
vendor/counsel contact, execution and acceptance; those activities are not
completion criteria for this internal package.

For each live processor row, OPQ-110 should hold or obtain:

| Check | Required evidence / decision |
|---|---|
| Article 28 DPA | Binding DPA or incorporated online DPA evidence for ZWIZZLY AS, with service scope matching actual use |
| No-training / ZDR / retention | Contractual or account-level proof for AI and embedding providers; not just public marketing text |
| SCC / UK Addendum / adequacy | Transfer mechanism for EEA/UK/Swiss transfers where no adequacy applies |
| TIA | Per-vendor transfer impact assessment or counsel/DPO acceptance of a documented lower-risk path |
| Subprocessors | Current subprocessor list, update notice mechanism, and any content-access restrictions |
| Supplementary measures | TLS, minimisation, no direct IDs where true, prompt/name stripping, retention limits, kill switch/fallbacks, monitoring |
| DPO/counsel acceptance | Explicit advice on residual risk, special-category incidental data, minors, and launch-country scope |
| Management decision | Zuzana Kopecna or Jorn records the controller decision after advice |

## Engineering follow-up captured from this review

| Finding | Why it matters | Proposed handling |
|---|---|---|
| Mistral adapter previously used the global endpoint while compliance research requires the EU endpoint | The model register treats Mistral as the EU secondary/vision route. | Resolved by WI-2740: all Mistral adapter traffic uses `https://api.eu.mistral.ai/v1/chat/completions`, guarded by a provider regression test. |

## Current launch posture from this ledger

This ledger supports a clean DPO/counsel handoff, but it does not by itself
clear launch. The current blocker is not that the repo lacks a list; the
blocker is that several external facts still need execution or acceptance:

- Cerebras is live on the primary path but not yet contractually closed.
- Anthropic evidence is not present in the provider evidence folder.
- Voyage opt-out/ZDR and hosted-region acceptance remain open.
- Infrastructure vendors still need DPA/TIA evidence gathered or linked.

Those external/legal items belong to OPQ-110. The Mistral runtime now uses
`https://api.eu.mistral.ai/v1/chat/completions`; WI-1192 is satisfied when
this ledger, the provider evidence index, and the OPQ-110 handoff record are
review-ready.
