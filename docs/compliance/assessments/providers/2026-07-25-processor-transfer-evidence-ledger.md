# Processor and transfer evidence ledger

**Controller:** ZWIZZLY AS, organisation no. 811 696 072
**Product:** MentoMate / EduAgent
**Prepared:** 25 July 2026
**Code baseline reviewed:** `main` at `7ad419507e311b5c0d2f8e945c1b567677f6642c`
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
   policy-excluded for this app, DeepInfra/DeepSeek is dormant, and the
   country/residence-aware LLM rule table is not yet implemented.
3. **Remaining external/legal work:** OPQ-110 owns execution or legal
   acceptance of DPAs, SCCs, TIAs, ZDR/no-training evidence, subprocessor
   review, and DPO/counsel sign-off.

One controller-owned engineering follow-up was found during this review:
Mistral is documented as the EU secondary/vision route, but the current adapter
uses `https://api.mistral.ai/v1/chat/completions`, not the EU endpoint
identified in the procurement research (`https://api.eu.mistral.ai`). This is
not a vendor signature problem; it should be fixed or explicitly ruled before
Mistral is used as an EU-residency control.

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

## Two-way recipient diff

Every runtime-discovered recipient has a ledger row below. Every live ledger
row maps to current code, the DPIA/ROPA, provider evidence, or an explicit
external dependency.

| Discovered recipient | Runtime/evidence source | Ledger disposition |
|---|---|---|
| Cerebras Systems Inc. | V2 primary text path; `createCerebrasProvider`; model register active row | Live row L1 |
| Mistral AI | V2 free vision/secondary path; `createMistralProvider`; model register active row | Live row L2; endpoint engineering follow-up |
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

No additional live personal-data recipients were found in the reviewed
current-main code paths. Local/mobile OCR can run on-device before server
fallback; when it falls back server-side, the server OCR provider is the LLM
router's vision capability, not a separate OCR vendor.

## Live AI, OCR, and embedding rows

| ID | Service / contracting entity | Role | Data and purpose | Runtime evidence | Region / transfer position | Internal artifact status | What remains outside code |
|---|---|---|---|---|---|---|---|
| L1 | Cerebras Systems Inc. - Cerebras Inference API | Processor | Tutoring prompts, selected session history, learning context, generated outputs, async learning jobs; no direct MentoMate IDs intentionally sent by adapter | `router.ts` default V2 text path uses `gpt-oss-120b`; `cerebras.ts` posts to `https://api.cerebras.ai/v1/chat/completions`; model register says universal primary, including async jobs | US transfer. Current country/residence primary substitution is not built; EEA traffic uses this primary path unless product gating avoids launch traffic | Controller assessment complete; proposed DPA prepared; Trust Center evidence reviewed under NDA; DPA not yet binding | Cerebras must provide binding DPA/order form, SCC coverage, TIA evidence/acceptance, retention/log and subprocessor confirmations; DPO/counsel and management must approve |
| L2 | Mistral AI - La Plateforme API | Processor | Free-tier secondary text and free vision/OCR when V2 matrix routes `capability='vision'`; image content and extracted homework text may be included | `router.ts` V2 vision branch routes free to `mistral-small-2603`; `mistral.ts` posts to `https://api.mistral.ai/v1/chat/completions`; OCR uses `routeAndCall` through the same router | Register describes EU secondary/vision, but adapter currently uses global API host. Research says EU guarantee requires `api.eu.mistral.ai` | Public DPA PDF and ZDR-enabled screenshot retained; research memo complete | Engineering follow-up to use/rule EU endpoint; counsel/DPO to accept stock DPA, special-category mismatch, SCC/onward-transfer position, and ZDR sufficiency |
| L3 | OpenAI, L.L.C. / applicable OpenAI contracting entity | Processor | Paid secondary text/vision, GPT-5 mini fallback, and GPT-5.4 deep reasoning for non-Family paid tiers/add-on | `router.ts` V2 matrix routes paid vision to `gpt-5-mini`, premium rung 4-5 to OpenAI advanced model; `openai.ts` direct provider | Register records EU-residency deployment and ZDR for minors | Organization-specific signed OpenAI DPA naming ZWIZZLY AS is retained in provider evidence | Confirm current ZDR/minor settings and region configuration in account evidence; DPO/counsel TIA/sign-off |
| L4 | Anthropic, PBC | Processor | Judge/grader and rung 4-5 fallback; may receive learner answers or model output under review; judge must be vendor-independent from tutor output | `router.ts` `ANTHROPIC_SONNET_MODEL`, `resolveGraderConfig`, and fallback logic; `anthropic.ts` direct provider | Region not established in current internal evidence | No current provider evidence file found in `docs/compliance/evidence/providers/` during this review | Obtain DPA, no-training/retention evidence, transfer safeguards, subprocessor evidence, and DPO/counsel TIA/sign-off |
| L5 | Voyage AI Innovations, Inc. - Voyage hosted embeddings API | Processor | Text used to create semantic embeddings for memory recall; vectors stored in Neon | `embeddings.ts` posts to `https://api.voyageai.com/v1/embeddings` with `voyage-3.5` | US/unknown hosted region; no EU region selector found in public research | Public DPA PDF retained; research memo complete | Add payment method and opt-out/ZDR evidence; confirm organization/account identity; DPO/counsel TIA and acceptance of hosted-region uncertainty |

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

## Dormant, eval-only, or excluded rows

| ID | Recipient | Current disposition | Evidence |
|---|---|---|---|
| X1 | OpenRouter | Eval-only adapter; not registered by production LLM middleware. Do not treat as launch processor unless promoted to production. | `openrouter.ts` header says eval-only and warns not to ship production minor data through broker; `llm.ts` middleware does not register it |
| X2 | Gemini / Vertex | Excluded for this app; V2 fail-closed guard excludes `gemini` and `vertex`. Legacy code still contains provider support, but current model register says excluded. | `router.ts` `FALLBACK_FORBIDDEN`; model register excluded table |
| X3 | DeepInfra / DeepSeek | Dormant and not pinned in production route. Activation requires provider DPA and DPIA paragraph. | model register dormant table |
| X4 | Country/residence-aware AI routing | Not implemented. Register explicitly says Europe/rest primary substitution is a future rule-table addition. | model register region-axis section; router uses `V2_SERVING_REGION_PLACEHOLDER='global'` |

## Handoff checklist for OPQ-110

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
| Mistral adapter uses the global endpoint while compliance research says EU processing requires the EU endpoint | The model register treats Mistral as the EU secondary/vision route. If the endpoint remains global, it cannot be used as proof of EU-resident processing. | Create a Work Item to either switch the adapter/config to `api.eu.mistral.ai` for the EU route or amend the register and transfer package so it no longer claims EU-region processing. |

## Current launch posture from this ledger

This ledger supports a clean DPO/counsel handoff, but it does not by itself
clear launch. The current blocker is not that the repo lacks a list; the
blocker is that several external facts still need execution or acceptance:

- Cerebras is live on the primary path but not yet contractually closed.
- Anthropic evidence is not present in the provider evidence folder.
- Voyage opt-out/ZDR and hosted-region acceptance remain open.
- Mistral's endpoint must be aligned with the EU-region claim or the claim must
  be withdrawn.
- Infrastructure vendors still need DPA/TIA evidence gathered or linked.

Those items belong to OPQ-110. WI-1192 is satisfied when this ledger, the
provider evidence index, and the OPQ-110 handoff record are review-ready.
