# GDPR Recipient Matrix — MentoMate

**DRAFT — generated from codebase sweep 2026-07-26; role determinations pending legal review; TODO markers = evidence to collect.**

Prepared for DPIA advice item **A7 / action 10** (external DPO request: a recipient-by-recipient
determination for every external service that receives users' personal data). This is a
code-evidence sweep, not a legal opinion — every "role" determination below is a best-guess
reasoning for counsel/DPO to confirm, not a ruling.

Cross-reference: [`docs/compliance/ropa.md`](../ropa.md) (existing ROPA, processing-activity table
rows #1–16) and [`docs/compliance/identity-compliance-register.md`](../identity-compliance-register.md)
(C-1 through C-5 binding rules, esp. C-1 LLM vendor-papering requirement). This document is more
granular than the ROPA's recipient column — it adds file:line evidence, per-recipient data
categories, and the learner-conversation-content flag.

**This exact deliverable is Stephan Hartmann's DPO action-register item #10** ("Recipient matrix
(Clerk, RevenueCat, Apple, Google, Resend, Sentry, Inngest, Neon, Cloudflare, Expo, APNs, FCM)
reconciled with RoPA" —
[`docs/compliance/DPO exchanges/2026-07-26-action-register-tracker.md:30`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)).

**A separate, independently-produced internal ledger already exists and reaches a consistent
live-recipient list:**
[`docs/compliance/assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md`](../assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md)
(dated 2026-07-25, code baseline `7ad4195`, prepared for OPQ-110/WI-1192). Its live-recipient set
(rows L1–L5 for AI/embedding vendors, I1–I10 for infra/comms) and dormant/excluded set (X1–X4:
OpenRouter eval-only, Gemini/Vertex policy-excluded under V2, DeepInfra/DeepSeek dormant,
country-aware routing not built) match this sweep's independent findings. That ledger is the
better source for **DPA/Article-28 status** specifically — see the Cerebras and Mistral rows below,
which pull directly from it — and this document does not duplicate its full handoff checklist.
Two things this sweep adds that the other ledger does not carry: the mobile speech-recognition and
homework-OCR flows (§5c), and the Stripe-webhook liveness finding (§2d).

---

## 0. Summary of findings — read this first

> **Single most urgent item in this matrix: Cerebras is the live default text-LLM recipient for
> essentially all tutoring traffic, and it does not yet have a binding DPA.**
> `docs/registers/llm-models/master.md:25-33` confirms `LLM_ROUTING_V2_ENABLED=true` in both
> staging and production since 2026-07-11 (WI-1685) — so Cerebras (`gpt-oss-120b`), not Gemini, is
> the current default LLM recipient for all tiers and ages (§3d/§3e). Per the dedicated assessment
> completed 2026-07-24
> (`docs/compliance/assessments/providers/2026-07-24-cerebras-processor-transfer-assessment.md:9,36,287`),
> Cerebras is only "conditionally suitable, not yet approved for launch use," its only available
> DPA is an unexecuted template with 8 open contractual gaps, and the assessment's own decision
> record says explicitly: **"Do not launch EEA personal-data processing through Cerebras until
> section 8 is closed."** Meanwhile the region-aware routing layer that would give EU learners an
> EU-hosted model does not exist yet (`docs/registers/llm-models/master.md:74-81`), so all traffic,
> EU included, currently resolves to Cerebras-US. Full detail in §3d. Two vendor outreach emails
> are already in flight in this evidence folder (`2026-07-26-cerebras-dpa-followup-email.md`,
> `2026-07-26-provider-dpa-request-email.md`) — confirm response status before re-sending, and
> escalate this specific item to the DPO/counsel as a live, dated blocker distinct from the
> routine "confirm DPA" TODOs elsewhere in this document.

**DPO's expected list:** Clerk, RevenueCat, Apple, Google, Resend, Sentry, Inngest, Neon,
Cloudflare, Expo, APNs, FCM.

**Confirmed recipients NOT on the DPO's list** (surprises):

| Recipient | Why it's missing from the list | Severity |
|---|---|---|
| **OpenAI** | LLM tutoring text provider — actively routes real learner conversation content | Should be added — high-sensitivity |
| **Anthropic** | LLM tutoring text provider (premium tier + judge/grader) — same | Should be added — high-sensitivity |
| **Mistral** | LLM text/vision provider (V2 routing free-tier secondary) — same | Should be added — high-sensitivity |
| **Cerebras** | LLM text provider (V2 routing universal default, `gpt-oss-120b`) — same | Should be added — high-sensitivity |
| **Google Gemini / Vertex** | LLM text provider on the **legacy** (V2-flag-off) routing path — corrected per §3e: **not** the live production default (V2 is confirmed live since 2026-07-11, `FALLBACK_FORBIDDEN` excludes Gemini); remains the automatic fallback if the V2 flag is ever unset/reverted, and `GEMINI_API_KEY` has not been removed from the codebase's required-key set for that path. **Banned for under-18** on both routing paths | Should be added — high-sensitivity (contingent live path, not currently selected); also note Apple/Google are already on the list for billing, but this is a *different* Google product (Gemini API) |
| **Voyage AI** | Embedding provider — receives raw learner conversation text (not just summaries) to generate semantic-memory vectors | Should be added — high-sensitivity |
| **Stripe** | Webhook route is live and mounted (`apps/api/src/routes/stripe-webhook.ts:90` wired into `index.ts`), even though product docs call it "dormant" | Needs a definitive dormant/live ruling — see §4 |

**Confirmed items on the DPO's list that the sweep could NOT find a *direct* code recipient for:**

- **APNs / FCM** — the code never calls Apple's or Google's push endpoints directly. All push
  traffic is mediated through **Expo's push relay** (`https://exp.host/--/api/v2/push/send`,
  `apps/api/src/services/notifications.ts:59`), which internally forwards to APNs/FCM using
  Expo's own credentials. APNs/FCM are real recipients of push payloads, but as **Expo's
  sub-processors**, not direct integrations of this codebase. Recommend the matrix row show
  Expo as the direct recipient and APNs/FCM as Expo's downstream sub-processors (verify against
  Expo's own DPA/sub-processor list — TODO).
- **Apple / Google as billing recipients** — confirmed as real (via RevenueCat SDK on-device +
  App Store/Play Store as the actual payment processor), but the codebase itself never calls
  StoreKit or Play Billing directly; it's mediated by the `react-native-purchases` (RevenueCat)
  SDK client-side. See §2.

**Learner-conversation-content exposure — the critical distinction (task item 5):**

| Tier | Recipients | What they receive |
|---|---|---|
| **Receives full/raw learner conversation content** | OpenAI, Anthropic, Mistral, Cerebras, Gemini (legacy path), Voyage AI | Full tutor-exchange prompts/messages (system + user + assistant turns), homework images (vision calls), session-summary/session-event text embedded for memory recall |
| **Receives conversation-DERIVED but structured/limited content** | Neon (DB) | Everything, by construction — it's the system of record | 
| **Receives only account/telemetry/billing metadata — never conversation content** | Clerk, RevenueCat, Apple, Google (billing), Resend, Sentry (post-scrub), Inngest (post-scrub), Cloudflare (compute host), Expo (push copy only, templated) | Emails, auth identifiers, subscription state, error diagnostics, push tokens, structured event payloads |

Sentry and Inngest both run **defense-in-depth scrubbing** that specifically targets fields named
`messages`, `content`, `transcript`, `homeworkText`, `rawInput`, etc. (see §5, §6) — the intent is
that conversation content never reaches these two, but the scrubbing is denylist-based
call-site discipline, not a structural guarantee, so it is evidence of *intent to exclude*, not
proof of zero historical leakage.

---

## 1. Auth — Clerk

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor.** Clerk authenticates users and stores login credentials (email, OAuth links) on the app's behalf under the app's instruction; it does not decide processing purposes independently. |
| **Personal data sent** | Email address, Clerk user ID (`clerkUserId`), JWT claims (email-verification status). On erasure: a hard `DELETE` of the full Clerk user record. |
| **Where in code** | Backend API calls: `apps/api/src/services/clerk-user.ts:150` (`GET /v1/users/{id}` — verified-email lookup) and `apps/api/src/services/clerk-user.ts:273` (`DELETE /v1/users/{id}` — erasure). Erasure is invoked from the account-deletion Inngest function at `apps/api/src/inngest/functions/account-deletion.ts:200-206` (confirms ropa.md's citation of line 202). Mobile-side: `@clerk/expo` SDK (`apps/mobile/package.json:32`) handles the actual sign-in UI and session token issuance — the SDK talks to Clerk directly from the device as well (not code-swept in this pass; TODO confirm what the client SDK sends beyond auth flow). |
| **Processing location** | `api.clerk.com` (US-hosted per Clerk's standard architecture) — TODO confirm against Clerk's current sub-processor/DPA docs for any EU data-residency option. |
| **DPA/terms reference** | TODO — confirm signed Clerk DPA on file. |
| **Notes/gaps** | Erasure is real and load-bearing (throws + Inngest retries on failure, never silently skips — `clerk-user.ts:246-320`). Does NOT carry conversation content. |

## 2. Billing — RevenueCat, Apple, Google (IAP), Stripe

### 2a. RevenueCat

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor.** Mediates IAP purchase/subscription state between the app and Apple/Google; the app controls the resulting entitlement grants. |
| **Personal data sent** | RevenueCat `appUserId` (an internal identifier, not raw PII), subscription/purchase state via inbound webhook, and on erasure: a `DELETE` request to remove the RevenueCat customer record. |
| **Where in code** | Inbound webhook: `apps/api/src/routes/revenuecat-webhook.ts` (Bearer-token HMAC-verified, dispatches to `apps/api/src/services/billing/billing-v2/dispatch.ts`). Outbound GDPR erasure: `apps/api/src/services/billing/store-teardown.ts:105-126` (`deleteRevenueCatCustomerForErasure`, `REVENUECAT_API_BASE = 'https://api.revenuecat.com/v1'` at line 6). Mobile SDK: `react-native-purchases` (`apps/mobile/package.json:80`) — the on-device SDK sends purchase receipts and the RevenueCat-generated app-user-id directly to RevenueCat's servers as part of the IAP flow; the specific client-side call sites were not read in this pass (TODO). |
| **Processing location** | TODO — confirm RevenueCat's hosting region from their DPA/sub-processor list. |
| **DPA/terms reference** | TODO. |
| **Notes/gaps** | No conversation content. Env vars confirm two RevenueCat secrets: `REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_REST_API_KEY` (`apps/api/src/config.ts:80-81`). |

### 2b. Apple (App Store / StoreKit)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Independent controller** for the payment transaction itself (Apple is the merchant of record for IAP) — best-guess; DPO/counsel should confirm this framing rather than "processor," since Apple sets its own purposes for App Store financial/fraud data. |
| **Personal data sent** | Apple ID / device purchase identifiers — handled entirely inside Apple's native StoreKit APIs via the RevenueCat SDK; no direct StoreKit calls were found in the app code (mediated through `react-native-purchases`). |
| **Where in code** | No direct StoreKit integration found in `apps/api` or `apps/mobile/src` (grep for StoreKit found nothing outside `react-native-purchases`'s own native module, which is third-party and out of scope for this sweep). Also the recipient for app-store review/publishing per `google_play_publishing.md`/Apple enrollment memory (org-level, not runtime data flow). |
| **Processing location** | TODO. |
| **DPA/terms reference** | Apple Developer Program License Agreement (not a traditional DPA) — TODO confirm counsel's read on Apple's role. |
| **Notes/gaps** | No conversation content. |

### 2c. Google (Play Billing)

Same shape as Apple — mediated entirely through the RevenueCat SDK; no direct Play Billing calls
found in this codebase. **Role/notes identical to 2b**, substituting Google Play for the App
Store. TODO confirm counsel's controller/processor read.

### 2d. Stripe — dormancy determination

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor**, if/when live. |
| **Personal data sent** | Would be: email, subscription/price IDs, payment method metadata (Stripe-hosted, not touching this codebase directly). |
| **Where in code** | The integration is **not dead code** — it is a live, mounted route: `apps/api/src/routes/stripe-webhook.ts` is imported and mounted in `apps/api/src/index.ts:90`. The route does real signature verification (`verifyWebhookSignature`, `services/stripe.ts`) and dispatches to `apps/api/src/services/billing/billing-v2/dispatch.ts`'s `getStripeWebhookHandlers()`. The GDPR-erasure teardown path also has a live Stripe cancel call: `apps/api/src/services/billing/store-teardown.ts:55-103` (`cancelStripeSubscriptionForErasure`, calls `client.subscriptions.cancel(...)`). |
| **Processing location** | TODO. |
| **DPA/terms reference** | TODO. |
| **Notes/gaps** | **This needs a definitive ruling, not a "dormant" label taken at face value.** `apps/api/src/config.ts:26-35` labels all `STRIPE_*` env vars "optional... Dormant until web client added; mobile uses RevenueCat IAP" and `AGENTS.md`'s snapshot says the same. That is a *product* statement about the absence of a web checkout client, not proof the webhook route can never fire — Stripe will POST to this endpoint if a Stripe account/dashboard is configured with a webhook pointed at it, independent of whether any of *this* app's clients initiate a checkout (e.g. a manually-created Stripe customer/subscription, migrated-in legacy billing data, or a test/staging Stripe account). **TODO (cannot be verified from source alone): confirm in Doppler whether `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are actually populated in any environment (dev/stg/prd), and whether any Stripe account currently has a webhook configured against this API's URL.** If both are empty/unconfigured, the recipient is genuinely inert (never called, never dials out, and the webhook 400s on missing signature) — the sweep could not confirm this without reading environment secrets, which is out of scope for a codebase-only sweep. |

## 3. LLM / embedding providers — the sensitive core

All routed through the single dispatch point `apps/api/src/services/llm/router.ts` (per
`AGENTS.md`'s "LLM calls go through services/llm/router.ts" rule) and registered conditionally
at boot based on which API keys are present: `apps/api/src/middleware/llm.ts:100` (Gemini),
`:104` (OpenAI), `:108` (Anthropic), `:117` (Cerebras), `:121` (Mistral).

**Role (reasoning, applies to all five text/vision providers below):** **Processor.** The app
fully controls what is sent (prompts, safety preamble, personalization) and for what purpose
(tutoring); the providers do not repurpose the data. Counsel should confirm each vendor's
terms don't carve out a training-use right that would make them an independent controller for
that secondary purpose — the `identity-compliance-register.md` C-1 rule already requires
minors be pinned to a single "papered" (contractually vetted) endpoint for exactly this reason.

**Personal data sent — the important finding:** these providers receive **full tutor-conversation
messages** (system prompt + safety/personalization preamble + the actual multi-turn
user/assistant exchange), not just metadata. Evidence:
- Safety/personalization preamble construction: `router.ts:302-427` (`withSafetyPreamble`) —
  built once at the router layer and prepended to every provider call regardless of vendor.
- Personalization line includes the learner's **pronouns** verbatim (sanitized, `router.ts:365-373`)
  and a **conversation-language directive** (`router.ts:356-364`) — both learner-identifying
  signals riding inside the prompt sent to the vendor.
- Per `docs/compliance/ropa.md:53`, "minors' names never in prompts; adult first name disclosed" —
  this sweep did not independently re-verify that exclusion in `session-exchange.ts` (TODO: a
  separate grep of the actual message-assembly call site for name interpolation would confirm
  this claim rather than taking the ROPA's word for it).
- **Homework images** are also sent to a vision-capable provider (OpenAI `gpt-5-mini` or Mistral
  Small, per the V2 vision branch `router.ts:891-904`) via the OCR flow, `apps/api/src/services/ocr.ts:8`
  (`routeAndCall` with the vision capability) — so a photographed homework page (which can
  contain handwriting, and incidentally a name/school letterhead) reaches the LLM vendor too.

### 3a. OpenAI

- **Role/data:** as above (text, tier-aware; also vision).
- **File:line:** provider registration `middleware/llm.ts:104`; model selection e.g.
  `router.ts:457` (`OPENAI_ADVANCED_MODEL = 'gpt-5.4'`), `router.ts:658` (`OPENAI_MINI_MODEL =
  'gpt-5-mini'`), vision branch `router.ts:899-904`; judge/grader fallback vendor
  `router.ts:681-684`.
- **Processing location:** TODO — `AGENTS.md`'s snapshot mentions "OpenAI the paid vision + EU
  branch" as a planned routing distinction; this sweep did not find an EU-region-specific
  endpoint/config in `router.ts` or `providers/openai.ts` — appears to be the standard OpenAI
  API endpoint today. Needs confirmation whether an EU data-residency endpoint is actually wired
  or still aspirational.
- **DPA:** TODO — see `docs/compliance/evidence/2026-07-26-provider-dpa-request-email.md` (an
  existing draft outreach in this same evidence folder — DPA requests may already be in flight;
  worth checking before re-requesting).

### 3b. Anthropic

- **Role/data:** as above (premium-tier text; sole primary for the vendor-independent
  judge/grader role — `router.ts:470,477,681-684`).
- **File:line:** provider registration `middleware/llm.ts:108`; `ANTHROPIC_SONNET_MODEL =
  'claude-sonnet-4-6'` (`router.ts:470`); `GRADER_MODEL = 'claude-sonnet-4-6'` (`router.ts:477`).
- **Processing location:** TODO.
- **DPA:** TODO.

### 3c. Mistral

- **Role/data:** as above (V2-routing free-tier secondary text + free-tier vision).
- **File:line:** provider registration `middleware/llm.ts:121`; `MISTRAL_SECONDARY_MODEL =
  'mistral-small-2603'` (`router.ts:656`); vision branch `router.ts:894-898`.
- **Processing location:** TODO.
- **DPA:** TODO.

### 3d. Cerebras

- **Role/data:** as above — the **universal default text model** under
  `LLM_ROUTING_V2_ENABLED` (`CEREBRAS_DEFAULT_MODEL = 'gpt-oss-120b'`, `router.ts:654`), i.e.
  once V2 routing is live this is the primary recipient of ordinary tutoring conversation text
  for most rungs/tiers (`router.ts:919-926`). Per
  [`docs/registers/llm-models/master.md:25-33`](../../registers/llm-models/master.md), V2 routing
  is documented as **live in both staging and production since 2026-07-11** (WI-1685) — i.e. this
  is not a hypothetical future state, Cerebras is the current default text recipient for
  essentially all tutoring traffic today, pending Doppler confirmation that the flag is actually
  set that way in every environment (see Open TODO #10 below).
- **File:line:** provider registration `middleware/llm.ts:117`.
- **Processing location:** US (Cerebras Systems Inc., United States) — confirmed directly, not
  merely inferred: `docs/compliance/assessments/providers/2026-07-24-cerebras-processor-transfer-assessment.md:164-171`
  names the transfer explicitly (Norway → US, controller → processor, "continuous while the
  service is used").
- **DPA:** **Not yet binding.** A full controller-side Article 28 + international-transfer
  assessment already exists —
  [`docs/compliance/assessments/providers/2026-07-24-cerebras-processor-transfer-assessment.md`](../assessments/providers/2026-07-24-cerebras-processor-transfer-assessment.md) —
  and its bottom line is explicit: the Trust Center DPA is an **unexecuted template**, not a signed
  agreement naming ZWIZZLY AS, and 8 conditions must close before approval (assessment §8). The
  assessment's own decision record states: **"Do not launch EEA personal-data processing through
  Cerebras until section 8 is closed"** (assessment §9) — yet Cerebras is the live default text
  provider per the paragraph above. This is the single largest live compliance/code-state gap
  found in this entire sweep: the vendor most learner conversation content flows through today has
  no binding processor contract. A follow-up evidence request went to Cerebras (A. Mikoyan)
  2026-07-26 (`docs/compliance/evidence/2026-07-26-cerebras-dpa-followup-email.md`); response
  pending.

### 3e. Google Gemini / Vertex — legacy-path default; policy-excluded, not code-removed

- **Role/data:** Same text-provider shape as the others (full conversation history) when selected.
  **Current state:** `docs/registers/llm-models/master.md:25-33` documents V2 routing as live in
  production since 2026-07-11, and V2's `FALLBACK_FORBIDDEN` set excludes Gemini/Vertex entirely —
  so Gemini is **not** actually being called in production today. But this exclusion is a
  routing-flag/policy-layer guarantee, not a removed dependency: `config.ts:222` schema-defaults
  `LLM_ROUTING_V2_ENABLED` to `'false'`, `GEMINI_API_KEY` remains the hard production-boot
  requirement on the legacy path specifically (`config.ts:659-662`,
  `productionRequiredLlmKeys()` — only requires Cerebras/Mistral/OpenAI when V2 is on), and
  `docs/registers/llm-models/master.md:129-132` lists removing `GEMINI_API_KEY` as a still-pending
  "defense-in-depth" step post-cutover. **Any environment where the flag is unset or reverted
  (dev by schema default; any misconfigured env) falls straight back to Gemini as the default
  adult/light-tier text provider**, with no code change required — confirmed directly:
  `router.ts:1065-1088` (`useGemini = providers.has('gemini')`, selected whenever the key is
  registered, for every adult/non-premium request). Do not describe Gemini to the DPO as
  unconditionally "excluded" (contrast `docs/compliance/dpia.md:45`, "Gemini excluded for this
  app") — it is excluded only while V2 stays on and only pending the key's removal.
- **Under-18 ban — confirmed, code-enforced, not just documented:**
  - `router.ts:665-674` (`FALLBACK_FORBIDDEN = new Set(['gemini', 'vertex'])`) — hard exclusion
    from the V2 fallback/candidate selector.
  - `router.ts:977-979` (`isUnder18AgeBracket`) gates the **legacy** primary-selection path
    (`router.ts:1026-1027`) and the **legacy fallback** path (`router.ts:1193-1195`) — both
    routes a minor to `approvedTextFallbackConfig` instead of Gemini, fail-closed (throws) if no
    approved provider is registered (`router.ts:962-968`).
  - This satisfies `docs/compliance/identity-compliance-register.md`'s C-1 rule ("Guard test
    required — a forward-only CI guard that fails if a minor path can reach an unpapered
    model") at the routing-logic level; TODO confirm the actual CI guard test file exists and is
    wired (this sweep read the router, not the CI config).
- **Processing location:** TODO — historically US-hosted Gemini API; Vertex AI has EU-region
  options but no region-specific code was found.
- **DPA:** TODO.

### 3f. Voyage AI (embeddings)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor.** |
| **Personal data sent** | **Raw learner conversation text** — not a summary. `apps/api/src/services/embeddings.ts:184-216` (`extractSessionContent`) pulls `user_message` + `ai_response` event content straight from `session_events` and joins it into a single string (truncated to 8 000 chars, line 171/213-215) which is then sent verbatim as the `input` field to Voyage's embeddings endpoint (`generateEmbedding`, lines 110-127, `VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'` at line 81). Called from `apps/api/src/services/embeddings.ts:227-243` (`storeSessionEmbedding`), invoked by the `session-completed` Inngest function (per the file's own doc comment, line 219). |
| **Where in code** | `apps/api/src/services/embeddings.ts` (see line citations above). |
| **Processing location** | TODO. |
| **DPA/terms reference** | TODO. |
| **Notes/gaps** | This is arguably the **least-visible** high-sensitivity recipient — it doesn't appear anywhere in typical "LLM vendor" framing because it's an embeddings-only API call, but it receives the same raw conversation text the tutoring LLMs do. ROPA row #9 already lists Voyage as a recipient for "Semantic embeddings" but does not flag that the *input* to the embedding call is raw transcript text (not a pre-summarized/anonymized derivative) — worth a ROPA wording tightening. |

## 4. Infra / observability

### 4a. Sentry (error tracking)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor.** |
| **Personal data sent (intended)** | Error diagnostics, stack traces, `userId`/`profileId` tags (`apps/api/src/services/sentry.ts:26-30`), request path, structured `extra` context. **Conversation content is explicitly denylisted**, see below. |
| **Where in code** | Wrapper: `apps/api/src/services/sentry.ts` (`@sentry/cloudflare`, line 6). Extensive scrubbing pipeline in the same file: a denylist of known PII-bearing key names — `rawInput`, `name`, `firstName`, `lastName`, `birthDate`, `transcript`, `messages`, `content`, `homeworkText`, plus several raw-LLM-output-sample field names (`jsonStrSample`, `rawSnippet`, `responsePreview`, `jsonStr`, `rawResponse`, `chunk`) — `sentry.ts:101-119`, recursively stripped from `extra`/`contexts`/breadcrumb `data` (`scrubKeys`/`scrubValue`, lines 121-148). Also strips the `Authorization` header (`scrubAuthorizationHeader`, lines 194-200), strips query strings and request bodies wholesale (`scrubRequestUrlFields`, lines 273-285), redacts quoted substrings in exception messages (`redactQuotedSnippets`, lines 166-176, defends against a JSON.parse SyntaxError echoing raw LLM output), and drops all `console.*`-sourced breadcrumbs entirely (`dropConsoleBreadcrumb`, lines 449-453, because the app's own `logger.warn` JSON-stringifies entries that could carry raw content into an unstructured breadcrumb string). Mobile also ships to Sentry: `@sentry/react-native` (`apps/mobile/package.json:42`), wired as an Expo config plugin (`apps/mobile/app.json:85`, `"@sentry/react-native/expo"`) — the mobile-side scrubbing config was **not** read in this pass (TODO — a client-side breadcrumb/event could carry different risk than the server wrapper above). |
| **Processing location** | TODO — Sentry SaaS, typically US-hosted unless an EU-region org is configured. |
| **DPA/terms reference** | TODO. |
| **Notes/gaps** | This is a genuinely well-engineered defense-in-depth scrub (multiple WI-tagged hardening passes per the code comments — WI-1990, WI-2339, WI-2353) but it is call-site-discipline-backed, not structurally impossible to bypass — the comments themselves note "Defense-in-depth, not a substitute for call-site discipline." `config.ts:765-767` also notes `SENTRY_DSN` is a non-fatal *warning* if missing in production (not a hard boot failure), meaning a misconfigured production deploy could silently drop all error telemetry — worth flagging to the DPO as a monitoring-gap risk, not a data-protection one. |

### 4b. Resend (transactional email)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor.** |
| **Personal data sent** | Recipient email address, subject line, and full email body text (`apps/api/src/services/notifications/email.ts:150-159`, POSTs `{ from, to: [payload.to], subject: payload.subject, text: payload.body }` to `https://api.resend.com/emails`, line 99). Email types (`EmailPayload.type`, lines 30-46) include: consent request/approved/reminder/warning/expired/archived, subscribe request, feedback, weekly/monthly progress, security notification, account reclaim, payment failed, family-join store-cancel/invite, and blocked-safety digest. |
| **Where in code** | `apps/api/src/services/notifications/email.ts` (send function); called from `apps/api/src/routes/consent.ts`, `consent-web.ts`, `settings.ts`, `family-join.ts`, `feedback.ts`, and Inngest functions `account-security-notification.ts`, `account-reclaim-attempt.ts`. |
| **Content check — does any email body carry learner conversation text?** | The `blocked_safety_digest` type (`apps/api/src/services/blocked-safety-digest.ts`) was specifically checked: it aggregates only **counts** (`dangerousProcedureBlockedCount`, `minorPiiEchoRedactedCount`, `suitabilityBlockedCount`, lines 17-32) into daily buckets — no raw content. The "weekly/monthly progress" email types are plausible carriers of derived learning-summary text (topic names, streaks) but this sweep did not read their formatter functions to confirm whether any verbatim learner quote could appear (TODO — check `formatWeeklyProgressEmail`/`formatMonthlyProgressEmail` equivalents for quote inclusion, given ROPA's own flag that "verbatim quotes survive the 30-day purge" (`ropa.md:54`) as a *known* open risk area). |
| **Processing location** | TODO. |
| **DPA/terms reference** | TODO. |
| **Notes/gaps** | Bounce/suppression handling exists (`isEmailSuppressed`, `email.ts:130-136`) — a defensive control, not a data-flow concern. |

### 4c. Inngest (background jobs)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor.** |
| **Personal data sent** | Event payloads — typically `accountId`/`profileId`/`personId` plus job-specific structured fields (e.g. `apps/api/src/inngest/functions/account-deletion.ts:182-191` sends `{ accountId, identityVersion, reason, requestedAt, subscriptions }` for a subscription-store-teardown event). Client init: `apps/api/src/inngest/client.ts:112-115` (`new Inngest({ id: 'eduagent', middleware: [piiScrubMiddleware] })`). |
| **Where in code** | `apps/api/src/inngest/client.ts` (client + `piiScrubMiddleware`, referenced lines 100-107: `transformOutput({ result, step }) { return scrubStepOutput(result.data, step?.displayName); }` — every step's *output* is scrubbed before it's visible in the Inngest dashboard/API, not just event payloads). Individual function payload shapes vary — 78 registered functions per `AGENTS.md`'s snapshot; this sweep spot-checked `account-deletion.ts` only (TODO: a full payload audit across all 78 functions was out of scope for this pass — flag to DPO that this is a sampling, not exhaustive, coverage claim). |
| **Processing location** | TODO — Inngest Cloud, US-hosted per their standard offering. |
| **DPA/terms reference** | TODO. |
| **Notes/gaps** | The existence of a dedicated `piiScrubMiddleware` for step *outputs* is a strong signal that the team is already aware conversation-adjacent content could leak into Inngest's dashboard via a step's return value — same "defense-in-depth, not structural guarantee" caveat as Sentry applies here. |

### 4d. Neon (Postgres hosting)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor (sub-processor — infrastructure hosting).** Not really a "recipient we choose to send curated data to" in the same sense as the others — it is the system of record, so by construction it holds essentially every personal-data category in the ROPA. |
| **Personal data sent** | Everything — full DB contents. |
| **Where in code** | `packages/database/src/client.ts:1-23` — `@neondatabase/serverless` `Pool`, `drizzle-orm/neon-serverless`; `DATABASE_URL` env var, `apps/api/src/config.ts:7`. |
| **Processing location** | TODO — project memory (`project_dev_schema_drift_trap.md`) names three Neon projects/branches (dev/stg="fancy-cherry"/prd) but does not record hosting region; check the Neon project dashboard directly. |
| **DPA/terms reference** | Already listed in `ropa.md:72-73` as a named sub-processor requiring a DPA — TODO confirm signed. |
| **Notes/gaps** | None beyond region confirmation. |

### 4e. Cloudflare (Workers compute + KV)

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor (infrastructure/compute hosting).** The API itself runs *inside* Cloudflare's edge network — Cloudflare processes every request's data in-transit and in-memory during execution, plus two KV namespaces (`IDEMPOTENCY_KV`, `SUBSCRIPTION_KV`) persist keyed data at rest. |
| **Personal data sent** | Whatever any given request/response carries (transient compute) plus KV-cached billing/idempotency state. |
| **Where in code** | `apps/api/wrangler.toml:1-40` (Workers config; `account_id`, `compatibility_date`); KV bindings referenced in `apps/api/src/config.ts:724-727` (`ProductionBindings.IDEMPOTENCY_KV`, `SUBSCRIPTION_KV`). |
| **Processing location** | Cloudflare's global edge network by design (no single region) — `wrangler.toml` does not pin a region; TODO confirm whether any Cloudflare regional-restriction / EU-jurisdiction feature is configured (Cloudflare offers a "Data Localization Suite" — not evidenced as enabled in this sweep). |
| **DPA/terms reference** | Already listed in `ropa.md:72-73`. TODO confirm signed / which tier (the wrangler.toml comment at line 20 notes "Free plan (100K req/day) is fine for launch" — confirm this doesn't affect DPA availability). |
| **Notes/gaps** | None beyond region/tier confirmation. |

## 5. Mobile / push

### 5a. Expo push service

| Field | Value |
|---|---|
| **Role (reasoning)** | **Processor**, and itself relies on APNs/FCM as its own sub-processors (see §0 summary). |
| **Personal data sent** | Expo push token (device-bound, profile-scoped) and the notification payload — title/body copy is app-templated. **Resolving the prior TODO here with a direct finding:** the templates checked do NOT carry verbatim conversation text, but several DO interpolate the child's first name plus the literal topic name plus a derived learning-status label — e.g. `"It looks like {name} is finding {topic} challenging."` / `"{name} has been working hard on {topic}"` / `"{name} seems to have overcome their difficulty with {topic}"` (struggle-notice pushes, `apps/api/src/services/notifications.ts:496-516`, `type: 'struggle_noticed'/'struggle_flagged'/'struggle_resolved'`); review-reminder pushes similarly carry `{childName}` + fading-topic counts (`:278-294`); subscribe-request pushes carry `{childName}` (`:450-473`). This is a **derived learning-state signal about a named child**, not raw transcript — more granular than a generic "templated copy" characterization would suggest, and worth its own DPIA line rather than folding into "push token only." |
| **Where in code** | `apps/api/src/services/notifications.ts:59` (`EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send'`), `sendPushNotification` (lines 88+); struggle/review/subscribe templates at `:278-301,450-473,496-516`. Mobile SDK: `expo-notifications` (`apps/mobile/package.json:60`), Expo config plugin `apps/mobile/app.json:83`. |
| **Processing location** | TODO. |
| **DPA/terms reference** | Already listed in `ropa.md:63,72-73`. TODO confirm signed. |
| **Notes/gaps** | Template-content TODO above is now resolved (see Personal data sent) — no verbatim conversation text found, but child-name + topic + learning-status is a real, more-than-generic data category worth flagging to the DPO explicitly. |

### 5b. APNs / FCM (as Expo sub-processors)

Per §0: no direct integration found in this codebase. Recommend the matrix carry these as
Expo's named sub-processors rather than independent rows the app "sends to" — verify this
framing against Expo's own DPA/sub-processor documentation (TODO).

### 5c. Mobile third-party SDK sweep — no unexpected recipients found

Full read of `apps/mobile/package.json` (lines 31-101) and the `plugins` array in
`apps/mobile/app.json` (lines 50-101). Findings:

- **Data-sending SDKs present:** `@clerk/expo` (auth, §1), `@sentry/react-native` (errors, §4a),
  `react-native-purchases` (RevenueCat, §2a), `expo-notifications` (push, §5a).
- **No analytics/ads/attribution SDK found** (no Amplitude, Mixpanel, Segment, PostHog, AdMob,
  Firebase, AppsFlyer, etc.) — this matches the DPO's list not naming one, and is a genuinely
  clean result, not just an absence-of-evidence artifact (the `app.json` plugins array is short
  and fully enumerated at lines 50-101).
- **On-device, no-network-recipient (worth noting for completeness, not a GDPR recipient):**
  `@react-native-ml-kit/text-recognition` (line 40) — Google ML Kit's on-device text recognition
  runs locally on the phone; TODO verify it does not silently fall back to a cloud API for some
  languages/models (ML Kit has both on-device and cloud variants in general — the specific
  package pinned here was not independently checked for which mode it defaults to).
- **Possible undocumented recipient — speech recognition:** `expo-speech-recognition`
  (`apps/mobile/package.json:65`, confirmed direct dependency), used at
  `apps/mobile/src/hooks/use-speech-recognition.ts` (and referenced from `ChatShell.tsx`,
  `MentorInputBar.test.tsx`, `NoteInput.test.tsx`). This wraps the OS-native speech-to-text API
  (iOS `Speech` framework / Android `SpeechRecognizer`), which on many device/OS configurations
  streams audio to Apple's or Google's cloud speech-recognition backend rather than processing
  fully on-device. **This is a plausible additional recipient of raw learner voice input that
  is not on the DPO's list and is distinct from Apple/Google's billing role.** TODO: confirm
  whether on-device vs. cloud transcription mode is configured/forced, since that changes the
  recipient determination entirely (on-device = no external recipient at all). Not read in this
  pass: the hook's actual configuration flags.

---

## Open TODOs (evidence to collect before DPO sign-off)

1. **Stripe dormancy** — confirm in Doppler whether `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`
   are populated in any environment, and whether any Stripe account has a live webhook
   configured against this API. (§2d)
2. **Processing locations** — nearly every recipient above needs a confirmed hosting
   region/country from the vendor's own DPA or sub-processor list; this sweep could only infer
   "US, typically" from general vendor knowledge, not from this codebase.
3. **DPA/terms references** — none were found *in the codebase* (expected — DPAs live in
   Doppler/legal filing systems, not source control). Cross-check against
   `docs/compliance/evidence/2026-07-26-provider-dpa-request-email.md` and
   `2026-07-26-cerebras-dpa-followup-email.md` (both already in this evidence folder) for
   in-flight DPA requests before re-requesting.
4. **Minors' names never in prompts** claim (`ropa.md:53`) — not independently re-verified
   against the actual message-assembly code in this pass; a follow-up grep of
   `session-exchange.ts`'s prompt-building code for name interpolation would close this.
5. **Weekly/monthly progress email content** — confirm no verbatim learner quote appears in the
   Resend-delivered email body (§4b).
6. **Speech-recognition mode** (on-device vs. cloud) — resolves whether Apple/Google Speech
   services are a real additional recipient (§5c).
7. **Mobile-side Sentry scrubbing config** — the server-side scrub (`services/sentry.ts`) was
   read in full; the mobile `@sentry/react-native` init/scrub config was not (§4a).
8. **CI guard for the C-1 minor/Gemini-ban rule** — the router-level enforcement was confirmed
   directly; the existence of the "forward-only CI guard" the compliance register calls for was
   not independently verified in this pass (§3e).
9. **Full 78-function Inngest payload audit** — only `account-deletion.ts` was spot-checked;
   the `piiScrubMiddleware` step-output scrub is global, but per-event *input* payload shapes
   were not exhaustively reviewed (§4c).
10. **Cerebras DPA closure + `LLM_ROUTING_V2_ENABLED` Doppler confirmation** — the single most
    urgent item in this matrix (§0, §3d). `docs/registers/llm-models/master.md` documents V2 as
    live in staging + production since 2026-07-11, but this sweep could not read Doppler directly
    to confirm the flag's actual value in every deployed environment today, nor whether Cerebras's
    section-8 conditions (`2026-07-24-cerebras-processor-transfer-assessment.md`) have closed since
    that assessment was written. Confirm both before treating Cerebras processing as
    launch-cleared.
11. **Apple/Google direct-integration confirmation** — this sweep did not find direct StoreKit/Play
    Billing API calls outside the RevenueCat SDK boundary, but a dedicated grep across
    `apps/mobile`'s native config (`ios/`, `android/`, `Podfile`, `build.gradle`) was not performed
    (§2b/§2c) — only `package.json`/TS source was swept.
