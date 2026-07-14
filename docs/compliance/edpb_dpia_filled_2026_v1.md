# Data Protection Impact Assessment — MentoMate / EduAgent

> **What this file is.** A completed EDPB DPIA template (2026 v1.0 structure), **filled from the real implemented code** of this repository. It is the code-grounded companion to the design-level [`dpia.md`](dpia.md): where `dpia.md` assesses the *ratified target* identity schema, this document records what the **shipped code actually does**, with `file:line` citations and an honest Implemented / Partial / Planned / Absent status on every control.
>
> **Status:** ENGINEERING DRAFT for DPO + privacy-counsel review. **Not legal advice.** Items in `[brackets]` need the company's registration details or a qualified privacy professional's judgement. Drafted 2026-06-30 against the tree at/near `origin/main`.
>
> **Method note — the two-axis identity state.** The app carries two parallel data layers. The **legacy** schema (`accounts`, `profiles`, `consent_states`, `family_links` + learning/billing tables) is the live *physical* data home. An **identity-v2** schema (`person`, `login`, `consent_grant`, `consent_receipt`, `organization`, `financial_record`, `deletion_audit`) is wired and gated by `IDENTITY_V2_ENABLED` (`apps/api/src/config.ts:214`). **`IDENTITY_V2_ENABLED='true'` in staging + production is operator-confirmed (2026-06-30)** → the **v2 reader/writer tree is the live deployed path for deletion/export/consent**, so the **re-home-then-delete erasure flow is live and the legacy I-C1 consent-receipt-destruction defect is closed** (it was only ever live on the legacy v1 path). The live *physical tables* remain the legacy ones (the `person` table is a baseline shell), so the personal-data inventory in §1.1.a cites legacy columns; this is immaterial to the rights/retention analysis, which follows the live v2 code path. This document describes processing in substance (the personal data, purposes, flows, recipients, rights) — the same across both layers.

---

# 0. OVERVIEW OF THE PROCESSING

## 0.1 Controller(s)

| Controller | |
| --- | --- |
| Management units responsible for the processing inside the organisation | `[Legal entity — TODO]`, the product/engineering organisation operating MentoMate. Single controller (no joint controllership identified in code). |
| Main establishment / point of contact or representative | Established in **Norway** (EEA). Lead supervisory authority via one-stop-shop: **Datatilsynet**. `[Registered address — TODO]`. `[UK Art 27 representative — TODO if serving UK]`. |
| Information about the DPO or similar function, if applicable | **DPO appointment is a launch-blocking condition** (Art 37 assessed mandatory — regular & systematic monitoring of learners is a core activity). `[DPO name / dpo@… — TODO before launch]`. |

## 0.2 Processor(s) and sub-processor(s)

Each row is a processor confirmed **wired in code** (see §1.3 / §2.3.c for `file:line`). Every one requires a signed **Art 28 DPA** on a business/enterprise tier and a **Chapter V transfer assessment** (almost all are US-based).

| # | Processor | Obligations / tasks |
| --- | --- | --- |
| 1 | **Clerk** (US) | Authentication / identity provider. Holds Clerk user ID + email. Login identity erased on account deletion. |
| 2 | **Google (Gemini / Vertex)** (US) | LLM tutor-prose generation — **adults only; hard-excluded for under-18s** in the live routing path. |
| 3 | **OpenAI** (US, via OpenAI Ireland) | LLM — fallback, premium rung, grader fallback, minor-fallback chain member. |
| 4 | **Anthropic** (US) | LLM — premium tier, Challenge-Round judge, first-class minor fallback. |
| 5 | **Cerebras** (gpt-oss, open-weight) | LLM — first-choice minor fallback in live path; standard-tier under the (flag-off) V2 router. |
| 6 | **Voyage AI** (US) | Text embeddings for semantic memory/recall — receives raw learner message + summary text. |
| 7 | **RevenueCat** (US) | In-app-purchase billing orchestration. Holds Clerk user ID + store receipt tokens. |
| 8 | **Apple / Google** (IAP) | App-store payment processing (merchant of record for IAP). |
| 9 | **Resend** (US) | Transactional email (consent, security, progress). Holds guardian/owner email + child first name in consent mails. |
| 10 | **Sentry** (US) | Error / performance monitoring. Opaque IDs only; minor-gated off on device. |
| 11 | **Inngest** (US) | Durable background jobs (deletion, purge, reports, the daily sweep). Reference UUIDs; free-text/names scrubbed by middleware. |
| 12 | **Expo Push** (US) | Push notification delivery. Device push token + message title/body; no profileId. |
| 13 | **Neon** (US, AWS) | Postgres database hosting — holds **all** personal data. |
| 14 | **Cloudflare Workers** (global edge) | API compute. Processes all inbound request data incl. IP/headers; no EU-region pin in config. |
| 15 | **Stripe** (US) | Web-payment rails — **wired but dormant** (no active web-checkout client). |
| N | *Configured-but-inert:* Mistral (EU), OpenRouter (eval only) | Present in code, not in production routing. Listed for completeness so the register matches the codebase. |

## 0.3 Name of the processing

| Internal name (record of processing) | **"MentoMate — AI tutoring service (learner conversation, persistent learning memory, guardian oversight, subscription billing)"** |
| --- | --- |
| Current version / change history | v0.1 (this code-grounded DPIA), 2026-06-30. Supersedes nothing; complements design DPIA `dpia.md` v0.1 (2026-06-08). |

## 0.4 Planning of the processing

| Estimated launch date | `[TODO]` — **pre-launch; zero production users** at time of writing (operator-confirmed). Launch is gated on this DPIA + DPO appointment + provider DPAs. |
| --- | --- |
| Estimated end date / expiration | Ongoing consumer service; no fixed end date. |

## 0.5 DPIA technical sheet

| Field | Value |
| --- | --- |
| Current version & version log | v0.1, 2026-06-30 — initial code-grounded completion of the EDPB 2026 template. |
| Team conducting this DPIA | Engineering (evidence-gathering from source, `file:line`-cited); **DPO + privacy counsel own and sign** (pending appointment). |
| Guidelines / standards used | EDPB DPIA template 2026 v1.0; WP248rev.01; GDPR Arts 5, 6, 8, 9, 13–22, 25, 28, 30, 32, 35; Datatilsynet Art 35(4) list; UK Children's Code (AADC); EU AI Act Arts 5(1)(f) & 50. Companion repo artifacts: `ropa.md`, `art9-special-category-decision.md`, `breach-response-plan.md`, `docs/compliance/minors-compliance-requirements.md`. |
| Reasons to conduct the DPIA | **Category 1 (Art 35(3)) + Category 3 (EDPB/Datatilsynet guidance).** Selected: ☒ Systematic & extensive evaluation based on automated processing incl. profiling (learner knowledge evaluation & tailoring); ☒ Evaluation/scoring incl. profiling & predicting (mastery, misconceptions, learning preferences); ☒ Sensitive/highly-personal data risk (incidental special-category in free-text — see §1.1.a); ☒ Data concerning **vulnerable data subjects (children)** — the decisive factor; ☒ Innovative use / new technology (large language models). **Three+ criteria → DPIA mandatory.** Trigger = first real child's data at scale; **the free tier is not exempt.** |
| Scope of this DPIA | **In scope:** all personal-data processing in the live mobile app + API (auth, onboarding/age-gating, tutoring conversation, persistent learning memory, assessments/progress, guardian dashboard, billing, transactional email, error monitoring, background jobs, LLM/embedding egress). **Out of scope (cross-referenced, not re-assessed here):** the full EU AI Act high-risk provider conformity regime (deferred to ~2 Dec 2027 per the launch-gate memo; see `art9-special-category-decision.md` + the E5 launch-gate analysis); marketing/website analytics (none wired in app code). |
| Completion date | `[TODO — DPO]` |
| Formal validation date | `[TODO — DPO sign-off]` |
| Published / shared externally? | ☒ No (internal accountability document; shown to Datatilsynet on request). A child-readable privacy summary is published separately. |

---

# 1. SYSTEMATIC DESCRIPTION OF THE PROCESSING

## 1.1 High-level description

### 1.1.a Processed personal data

Data subjects: **adult Subscription-administrator/owner** (`isOwner`/`admin`), **learner** (any supported age, 13+ at launch), **child-on-parent's-account** (non-owner minor), **guardian** (consent authority), **mentor** (opt-in data access), **payer** (billing). One human may wear several hats.

| # | Personal data (item) | Explanation (type, subject, where) | Special category? |
| --- | --- | --- | --- |
| 1 | **Identity / account** — `email`, `clerk_user_id`, `timezone`, deletion-lifecycle timestamps | Direct identifiers; owner. `accounts` (`packages/database/src/schema/profiles.ts:42-61`). | ☒ No |
| 2 | **Profile** — `display_name`, `avatar_url`, `birth_year` (+ optional `birth_month`/`birth_day`), `location` (EU/US/OTHER), `is_owner`, `conversation_language`, `pronouns`, `default_app_context` | Learner/owner profile. `profiles` (`profiles.ts:63-146`). Age stored as **year only by default** (privacy-favourable); full DOB only if optional month/day supplied. `pronouns` is gender-expression data. | ☒ No (but `pronouns` is elevated-sensitivity) |
| 3 | **Consent records** — `consent_type` (GDPR/COPPA), `status`, `parent_email`, `consent_token`, `request_ip`, `user_agent`, `policy_version`, timing | Learner + guardian. `consent_states` (`profiles.ts:262-325`); v2 `consent_grant`/`consent_request` (`schema/identity.ts:455-501, 791-877`). Captures **IP + user-agent** at consent time. | ☒ No |
| 4 | **Family / guardianship edges** — parent↔child profile links | `family_links` (`profiles.ts:233-260`); v2 `guardianship.qualification` (legal-relationship type — elevated). | ☒ No (qualification is elevated-sensitivity) |
| 5 | **Learning conversation (raw transcript)** — every learner message + AI reply | Learner. `learning_sessions.raw_input`, **`session_events.content`** (`schema/sessions.ts:125-235`). Highest free-text surface. | **Incidental risk — see note** |
| 6 | **Persistent learning memory** — `memory_facts.text`/`text_normalized`/`category`/`embedding`; `learning_profiles.struggles`/`accommodation_mode`/`interests`/`strengths`/`communication_notes` | Learner. `schema/memory-facts.ts:16-99`, `schema/learning-profiles.ts:15-83`. LLM-inferred facts about the learner. | **Incidental risk — see note** |
| 7 | **Assessments / mastery** — `exchange_history`, `mastery_score`, `needs_deepening_topics.misconception`/`correction`, `concept_mastery.learner_quote` (verbatim) | Learner. `schema/assessments.ts:54-207`, `schema/concept-mastery.ts:80`. | **Incidental risk** |
| 8 | **Summaries / notes / reports** — `session_summaries.*`, `topic_notes.content`, `progress_summaries.summary`, `weekly/monthly_reports.report_data` | Learner (reports also expose child activity to guardian). `schema/sessions.ts:237-304`, `schema/notes.ts:8-48`, `schema/snapshots.ts`. | **Incidental risk** |
| 9 | **Curriculum free-text** — `subjects.name`/`raw_input`/`urgency_boost_reason`, `parking_lot_items.question`, `vocabulary.term` | Learner-chosen text (e.g. a subject like "managing anxiety"). `schema/subjects.ts:46-90`, `schema/sessions.ts:306-336`, `schema/language.ts:21-59`. | **Incidental risk** |
| 10 | **Embeddings** — `session_embeddings.content`+`embedding`, `memory_facts.embedding` (pgvector) | Vector + source text of transcript/summary/fact. `schema/embeddings.ts:15-51`. | **Incidental risk** |
| 11 | **Quizzes / dictation / progress / gamification** — quiz Q&A, `dictation_results.sentences`, `streaks`, `xp_ledger`, `milestones` | Learner performance + behaviour. `schema/quiz.ts`, `schema/dictation.ts:21-57`, `schema/progress.ts:29-47`. | ☒ No |
| 12 | **Billing** — `stripe_customer_id`, `stripe_subscription_id`, `revenuecat_original_app_user_id`, tier/status/trial/cancel; `top_up_credits.revenuecat_transaction_id` | Owner/payer. `schema/billing.ts:31-256`. | ☒ No |
| 13 | **Support / feedback** — `support_messages.content`, `feedback_retry_queue.message` | Learner/owner free-text. `schema/support.ts:29-74`. | **Incidental risk** |
| 14 | **Device / notification** — `notification_preferences.expo_push_token`, `email_suppressions.email`, `notification_log` | Learner/owner. `schema/progress.ts:96-181`, `schema/email-suppressions.ts:24-50`. | ☒ No |
| 15 | **BYOK waitlist** — `byok_waitlist.email` | Prospect. `schema/billing.ts:258-266`. Outside the identity cascade → erased explicitly on delete. | ☒ No |

> **Special-category (Art 9) position — read carefully.** The controller has a **deliberate, enforced policy of NOT processing Art 9 data** (no health/disability collection, inference, labelling or storage — see [`art9-special-category-decision.md`](art9-special-category-decision.md)), backed by CI guards (no-clinical-copy, persona-fossil, functional-vocabulary). **However**, the items marked "Incidental risk" are **free-text or LLM-inferred fields** where a learner could volunteer, or a model could surface, special-category content (health, disability, religion, sexuality, political opinion) even though no feature solicits it. The **highest-risk surfaces are `session_events.content` (full transcript) and `memory_facts.text` / `learning_profiles.struggles` / `accommodation_mode`** (which can proxy a disability signal). This DPIA treats incidental Art 9 as a **risk to mitigate (minimisation, no-clinical-copy guard extended to LLM-written fields, no third-party disclosure of raw transcript)**, not as a deliberate Art 9 processing operation. The Art 9(2) conditions are therefore **not relied upon**; the policy + guards are the control. **DPO/counsel must confirm this characterisation holds for the shipped feature set (§2.1.b).**

### 1.1.b Purposes of the processing

| # | Purpose | Personal data involved & justification |
| --- | --- | --- |
| 1 | **Deliver the AI tutoring conversation** | Items 2, 5, 9 + LLM egress (§1.2). The learner's message and prior-session context are sent to a vetted LLM to generate the next teaching reply. Core service function. |
| 2 | **Persistent learning memory ("the mentor remembers")** | Items 6, 7, 8, 10. Mastery, misconceptions, extracted facts, summaries & embeddings let the tutor adapt across sessions. The defining product promise. |
| 3 | **Track & adapt learning / progress** | Items 7, 11. Assessments, quizzes, streaks, reports. |
| 4 | **Guardian oversight of a child's learning** | Item 8 (derived only) + item 4. A guardian sees progress/summaries — never the raw transcript (§2.3.b). |
| 5 | **Account provision & authentication** | Items 1, 2. Sign-up, sign-in (Clerk), profile management. |
| 6 | **Age & jurisdiction gating / lawful consent** | Items 2, 3. Birth-year + residence drive the consent route and the under-13 block. |
| 7 | **Subscription billing & quota** | Item 12. Paid plan via IAP/RevenueCat; usage quota enforcement. |
| 8 | **Transactional communication** | Items 1, 3, 14. Consent, security, and progress emails/push. |
| 9 | **Security, abuse prevention & reliability** | Items 1, 13, 14 + error telemetry. Auth, webhook-fraud escalation, error monitoring. |

### 1.1.c Secondary or compatible uses

| # | Secondary use | Conditions & compatibility |
| --- | --- | --- |
| 1 | **Semantic recall via embeddings** | Memory item 10 derived from item 8. Compatible — same teaching-continuity purpose; not a new purpose. |
| 2 | **Aggregate/derived progress reports to guardian** | Derived from learning data; consent-gated; redacted to zero when child consent ≠ granted (`apps/api/src/routes/dashboard.ts:150,271-297`). Compatible. |
| — | **Model training on learner data** | **Explicitly fenced OFF.** A new, incompatible purpose; contractually prohibited at the provider (no-training DPA terms required, A11/A12); the AI-training consent toggle must not render for minors. Not a current use. |
| — | **Marketing / behavioural advertising** | **None.** No ad SDKs or marketing-analytics pipelines wired in app code. |

### 1.1.d Nature, scope and context

| Dimension | Description |
| --- | --- |
| **Nature** | Collection (sign-up, conversation, voice→on-device transcription), use (LLM generation, profiling for personalisation, embeddings), storage (Neon Postgres; pgvector; on-device SecureStore for tokens), sharing/transfer (to processors in §0.2; LLM egress per turn), deletion (7-day-grace erasure + scheduled transcript purge). Technologies: large language models, vector embeddings, React Native mobile, Cloudflare Workers/Hono API, Drizzle/Neon. |
| **Scope** | Consumer scale at launch (per `AGENTS.md`: ~88 mobile screens, large learning-data surface). Geographic: EEA (Norway seat) + UK + US, with US-resident under-13 excluded. Per data subject: continuous longitudinal learning record (a child's performance history) — high frequency, long duration. |
| **Context** | B2C consumer subscription, paid by an adult; **children are a primary user group → power imbalance and heightened protection.** Controller↔subject relationship is service-provider↔consumer. **Cross-border: Yes** — almost all processors are US-based (Clerk, the LLM/embedding vendors, RevenueCat, Resend, Sentry, Inngest, Expo, Neon); Cloudflare is global-edge with no EU pin. **International transfer to a third country: Yes** — EEA→US for the processors above; mechanism per Chapter V (DPF where certified, else SCCs + TIA) — see §2.3.c. |

## 1.2 Functional description

| # | Phase | Operations | Explanation (`file:line`) |
| --- | --- | --- | --- |
| 1 | **Sign-up & age/consent gating** | ☒ Collection ☒ Storage | Self-declared 4-digit birth year (`ProfileBasicsStep.tsx:279-291`); server rejects under-13 at parse (`packages/schemas/src/profiles.ts:55-57`); 18+ gate to add a child (`apps/api/src/services/profile.ts:539-574`); consent recorded with IP/UA. **No verified-age/VPC — self-declared only (gap, §risk).** |
| 2 | **Authentication** | ☒ Use | Clerk JWT verified on every request (`apps/api/src/middleware/auth.ts:187-273`, `middleware/jwt.ts`); profileId ownership-checked against the account (`middleware/profile-scope.ts:117-223`). |
| 3 | **Tutoring exchange** | ☒ Collection ☒ Use ☒ Sharing/Transfer | Learner turn → minimised system prompt (`exchange-prompts.ts:576-1115`) → vetted LLM via the router (`services/llm/router.ts`) → reply rendered. Personal data leaving per turn enumerated in §2.3.c. |
| 4 | **Learning-memory distillation** | ☒ Use ☒ Storage | After a session, the conversation is distilled into mastery/notes/facts/summary (scoped `profileId`); embeddings generated via **Voyage** (`apps/api/src/services/embeddings.ts:81-127`). |
| 5 | **Guardian oversight** | ☒ Use | Derived-only dashboard (`apps/api/src/routes/dashboard.ts:1381-1383` — raw transcript never selected). |
| 6 | **Billing** | ☒ Collection ☒ Use ☒ Transfer | IAP via RevenueCat (`apps/mobile/src/lib/revenuecat.ts:62`); quota enforcement. |
| 7 | **Retention / purge** | ☒ Storage ☒ Deletion | Raw `session_events` hard-deleted 30 days after summary (`apps/api/src/inngest/functions/transcript-purge-cron.ts`); `retrieval_events` purged at 37 days always-on. |
| 8 | **Erasure** | ☒ Deletion/Destruction | 7-day-grace account deletion (`apps/api/src/inngest/functions/account-deletion.ts`); re-home-then-delete on v2 (`services/identity-v2/deletion-v2.ts`); Clerk identity + `byok_waitlist` erased. |

*A data-flow diagram should be added by the DPO before sign-off.*

## 1.3 Means of processing & supporting assets

| Phase | Means / supporting assets | Explanation |
| --- | --- | --- |
| Auth | Clerk (IdP), Cloudflare Workers (compute) | JWT verification at the edge. |
| Conversation | LLM router → Gemini/OpenAI/Anthropic/Cerebras; Voyage (embeddings) | `services/llm/router.ts`, `providers/*`. Minor traffic routed off Gemini (§2.3.c). |
| Storage | Neon Postgres (+ pgvector); device SecureStore (iOS Keychain / Android Keystore) | `apps/api/wrangler.toml:55`; `apps/mobile/src/lib/secure-storage.ts:24`. |
| Billing | RevenueCat + Apple/Google IAP; Stripe (dormant) | `apps/mobile/src/lib/revenuecat.ts`. |
| Email / push | Resend; Expo Push | `services/notifications/email.ts`, `services/notifications.ts`. |
| Async jobs | Inngest (deletion, purge, reports, daily sweep) | `apps/api/src/inngest/`. |
| Monitoring | Sentry (API + mobile) | `services/sentry.ts`, `apps/mobile/src/lib/sentry.ts`. |
| Secrets | Doppler (injected at deploy/CI; never in repo) | typed config `apps/api/src/config.ts`. |

## 1.4 Compliance with approved codes of conduct

| # | Code of conduct | Explanation |
| --- | --- | --- |
| 1 | **UK Children's Code (Age-Appropriate Design Code)** | ☒ Compliance necessary/beneficial — extraterritorial to UK-accessed children; informs high-privacy defaults, no nudge/streak pressure, child-readable transparency. Not a formally-approved Art 40 code, applied as binding regulatory guidance. |
| 2 | No formally-approved GDPR Art 40 code of conduct is adhered to | — |

---

# 2. ANALYSIS OF THE PROCESSING

## 2.1 Lawfulness of the processing

### 2.1.a Legal basis (Art 6(1))

| Purpose | Legal basis | Justification |
| --- | --- | --- |
| Account provision, authentication, billing (to the **adult**) | ☒ **(b) Contract** | Necessary to provide the subscribed service to the account-holding adult. Note: a **minor cannot be a party** to the paid contract — billing sits with the adult owner. |
| **Minor's learning data & profiling** | ☒ **(a) Consent** | A minor's learning/profiling rests on consent — the minor where self-consent age is met (Norway 13, banded by jurisdiction), the **guardian** where it is not (Art 8 parental layer). |
| Retained billing/tax records; surviving consent receipts | ☒ **(c) Legal obligation** | Tax/accounting retention; Art 7(1)/(3) proof that consent was validly given/withdrawn. |
| Security, abuse prevention, error monitoring | ☒ **(f) Legitimate interests** | Necessary to keep the service safe and reliable; balanced against subjects, **with heightened weight to children** and minimisation (opaque IDs, minor-gated Sentry). A balancing test (LIA) should be recorded by the DPO. |

> **⚠ Implementation gap (Implemented: Partial → Absent for adults).** There is **no `lawful_basis` / `legalBasis` / `termsAccepted` field recorded for adult self-processing** anywhere in the live schema (whole-repo grep: not found). `lawful_basis` exists **only** on the v2 `consent_grant`/`consent_receipt` tables and only carries **parental/child** consent values (`gdpr_parental_consent` / `coppa_parental_consent`, `schema/identity.ts:470,522`); legacy `consent_states` has no such column. Per-purpose consent has the correct hook but **only one purpose value is ever written** (`'app_usage'`), so there is no granular core/analytics/marketing split today. **Building an accountable basis record (Art 5(2)/7(1)) is a launch condition.** |

### 2.1.b Reasons to lift the processing prohibition (Art 9(2))

**Not relied upon.** The controller's position is that **no Art 9 special-category data is deliberately processed** (`art9-special-category-decision.md`); therefore no Art 9(2) condition is invoked. The residual **incidental** Art 9 risk in free-text/LLM-inferred fields (§1.1.a note) is managed as a security/minimisation risk, **not** by establishing an Art 9(2) basis. **If counsel concludes the incidental exposure is in substance Art 9 processing** (e.g. `learning_profiles.accommodation_mode` as a disability proxy), the appropriate condition would be **(a) explicit consent** and this section must be reopened with an expanded assessment. **This is a DPO/counsel decision point.**

## 2.2 Data minimisation, retention & data quality

### 2.2.a Data minimisation & retention

| Personal data | Need / relevance | Recipients | Retention | Status / `file:line` |
| --- | --- | --- | --- | --- |
| Birth year (not full DOB by default) | Age/consent gating only | Internal | Life of profile | **Minimised** — year-only default (`profiles.ts:74`); full DOB optional. **Birth year is not sent to the LLM** (only a derived age-voice band, `exchange-prompts.ts:54-88`). |
| Learner first name | Personalisation | LLM (adults only) | Life of profile | **Minimised for minors** — name suppressed from LLM payload for non-adults (`exchange-prompts.ts:624-627,721-724`). |
| Raw transcript (`session_events.content`) | Deliver the conversation | LLM, Voyage | **Hard-deleted 30 days after summary** | **Implemented** purge (`transcript-purge-cron.ts`; cutoff `:41`), gated by `RETENTION_PURGE_ENABLED` (`config.ts:107`, default `false`; **doc-asserted `true` in prod — DPO must confirm Doppler value**). |
| `retrieval_events` (learner answers, rationale) | Review scheduling | Internal | **37 days, always-on** | **Implemented** unconditional (`retrieval-events-retention-cron.ts:16,30-34`). |
| Memory facts / learning profile / mastery | Teaching continuity | LLM (consent-gated) | Life of profile / on erasure | Memory egress to LLM is **consent-gated** (`memoryConsentStatus==='granted'`, `learner-profile.ts:887-1019`). |
| Verbatim quotes (`concept_mastery.learner_quote`, `session_summaries.learnerRecap`) | Note drafting / evidence | Internal | **Survive the 30-day purge** | **GAP** — no purge path; verbatim child quotes persist indefinitely (§risk 6.x; A24-b). |
| Consent IP + user-agent | Art 8 audit trail | Internal | Life of consent record | Retained as accountability evidence. |
| Billing / tax records | Legal obligation | RevenueCat/Stripe | Tax window | `financial_record` survives person delete; `retention_period` **written NULL — counsel must set** (`deletion-v2.ts:43-53`). |
| `byok_waitlist.email` | Waitlist | Internal | Until delete | Erased explicitly on account delete (`deletion-v2.ts:541-543`). |

**Retention gaps for the DPO:** (1) no account/profile **dormancy sweep** exists (only subject-level auto-archive at 30 days; the 24-month figure is a query window, not a deletion); (2) `retention_period` values are NULL placeholders; (3) `legal_hold`/`retain_tier` columns are **not present** in any live schema (design-only).

### 2.2.b Data quality

| Personal data | Quality measure | Justification |
| --- | --- | --- |
| Birth year | Numeric 4-digit input, conservative ≤ threshold for month-ambiguity | Drives lawful gating; conservative bias protects the under-13 boundary (`profiles.ts:48-57`). |
| Mastery / misconceptions | Revisable, server-owned, conservative ("all concepts solid" required, `evaluation.ts:128-186`) | Avoids over-claiming learner competence. |
| Profile fields (name/pronouns/language) | User-correctable (§2.3.b) | Subject controls accuracy of identity attributes. |

## 2.3 Measures supporting compliance

### 2.3.a Article 5(1)(a-f) principles

| Principle | Supporting measures | Appropriateness | Status |
| --- | --- | --- | --- |
| **Fairness** | No dark patterns / no streak-guilt pressure; upsell adult-facing & neutral; children's-code defaults. | Reduces manipulation risk for minors. | ☒ Partially implemented (no-clinical-copy + UX rules live; full children's-code audit pending) |
| **Transparency** | Privacy policy + ToS (`en.json:1886-1924`); child-readable summary; **but no in-chat "AI" indicator (Art 50 gap)**. | Policy-level disclosure present; point-of-interaction disclosure missing. | ☒ Partially implemented |
| **Purpose limitation** | Learning memory used for tutoring continuity only; training/marketing fenced off. | Strong contractual + product fence. | ☒ Partially implemented (provider DPAs pending) |
| **Data minimisation** | LLM egress minimised (band-not-age, name suppressed for minors, consent-gated memory); year-only birth date; opaque IDs to Sentry. | Materially implemented at the highest-volume egress. | ☒ Partially implemented |
| **Accuracy** | User-correctable profile; revisable mastery. | Adequate for identity attributes; learning records read-only. | ☒ Partially implemented |
| **Storage limitation** | 30-day transcript purge; 37-day retrieval purge. | Good for transcripts; **gaps**: verbatim quotes survive, no dormancy sweep, NULL retention periods. | ☒ Partially implemented |
| **Integrity & confidentiality** | Per-profile scoped repository; Clerk JWT auth + ownership checks; TLS; SecureStore; webhook breach escalation. | Strong app-layer model; **RLS parked** (single line of defence). | ☒ Partially implemented |
| **Accountability** | This DPIA, ROPA, breach plan, CI guards, typed config. | Documentation strong; **lawful-basis record gap**; DPO not yet appointed. | ☒ Partially implemented |

### 2.3.b Data-subject rights

| Right | Supporting measures (`file:line`) | Status |
| --- | --- | --- |
| **Information (Arts 12–14)** | Privacy policy + ToS in-app; child-readable summary. Pre-publish TODO: DPO name, address, Art 27 rep. | ☒ Partially implemented |
| **Access & portability (Arts 15, 20)** | Self-service JSON export — `GET /account/export` → `generateExportV2` (`routes/account.ts:255-265`); mobile "Export My Data" (`more/privacy.tsx:137-147`). **Caveat:** export reads `session_summaries`, **not** raw `session_events.content` — verbatim transcript is excluded from the subject's own access copy (Art 15 completeness question for the DPO). No operator-side DSAR tooling for third-party/regulator requests. | ☒ Partially implemented |
| **Rectification & erasure (Arts 16, 17, 19)** | **Erasure: Implemented** — `POST /account/delete` (owner-gated) → 7-day grace → re-home-then-delete (v2), Clerk identity erased (`account-deletion.ts:231-238`), `byok_waitlist` erased. Child-consent deletion path with grace + immediate hard-delete for ≤13 (`consent-revocation.ts:256-259`). **Rectification: Partial** — name/avatar/pronouns/language correctable; **birth year, residence, and all learning records are not user-correctable** (no endpoint). | ☒ Partially implemented |
| **Object & restriction (Arts 18, 21)** | Consent withdrawal stops processing and triggers deletion; no granular per-purpose restriction beyond the single `app_usage` purpose. | ☒ Partially implemented |
| **No solely-automated significant decision (Art 22)** | **Not engaged** — profiling personalises teaching only; mastery does **not** gate access to any topic/feature ("never lock topics"; `evaluation.ts` sets metadata, no lockout). Recorded explicitly to close the question. Privacy copy must **disclose profiling as present & lawful** (Art 13(2)(f)), never claim ADM is engineered out. | ☒ Implemented (N/A by design) |

### 2.3.c Other GDPR requirements

| Requirement | Supporting measures | Status |
| --- | --- | --- |
| **Consent provision & withdrawal (Art 7)** | Withdrawal → `revokeConsentV2` → grace → deletion (`consent-v2.ts:603`, `deletion-v2.ts:593-655`); token path for parent-without-profile; restore within grace. `CONSENT_WITHDRAWAL_TOKEN_SECRET` is a boot-required secret (`config.ts:486`). **Gap:** no `termsAccepted`/lawful-basis record for adults; single consent purpose. | ☒ Partially implemented |
| **Processors (Art 28)** | 15 processors wired (§0.2); **DPAs to be signed on business tier** — a launch condition (A11). PII-scrub middleware on Inngest payloads (`packages/schemas/src/pii-scrub.ts`); CI guard bans raw-content forwarding (`pii-scrub.guard.test.ts`). | ☒ Planned (DPAs) / Partially implemented (technical scrub) |
| **International transfers (Chapter V)** | Almost all processors US-based (EEA→US). Per-vendor: DPF where the entity is certified (Google LLC), else **SCCs + TIA** (OpenAI, Anthropic, others). Cloudflare global-edge has no EU-region pin. **Transfer mechanism papering is a launch condition (A12).** **LLM minor-routing control: Implemented** — under-18 traffic is hard-excluded from Gemini in the live path (`router.ts` `isUnder18AgeBracket` gate routes minors to Cerebras→Anthropic→OpenAI, never Gemini), with a guard test (`session-exchange-router.test.ts:20-132`). The estate-wide "Gemini excluded for everyone" is V2-gated (`FALLBACK_FORBIDDEN`, flag-off) — **target, not live**. | ☒ Planned (papering) / Partially implemented (routing control) |

**LLM egress per turn (what actually leaves to the vendor):** pronouns (verbatim, capped); a *derived* age-voice band (**never raw age/birth year**); conversation-language instruction; first name (**adults only**); consent-gated interests/struggles/strengths/learning-style; onboarding signals; native language + ≤60 known vocab (language sessions); topic/subject titles; **the raw learner message and full in-session transcript** (inherent to tutoring); qualitative retention status (no numeric mastery score). Voyage additionally receives raw message text for embeddings. (`router.ts:213-264`, `exchange-prompts.ts`, `learner-profile.ts`, `embeddings.ts`.)

### 2.3.d Data protection by design & by default (Art 25)

| Measure | Appropriateness | Status |
| --- | --- | --- |
| **Per-profile scoped repository** — `createScopedRepository(profileId)` ANDs `profileId` into every query; empty profileId throws at construction (`packages/database/src/repository.ts:26-54`). | Cross-profile read structurally prevented at app layer. | ☒ Implemented |
| **Ownership-verified profile scope** — `X-Profile-Id` checked against the account, not trusted (`middleware/profile-scope.ts:117-223`). | No client-supplied identifier trusted. | ☒ Implemented |
| **High-privacy defaults** — year-only age; memory egress off until consent granted; minor-gated Sentry; minors excluded from Gemini. | Privacy-protective defaults, esp. for children. | ☒ Implemented |
| **Guardian sees derived data only** — raw transcript never selected in dashboard paths (`dashboard.ts:1381-1383`). | Minimises child-data exposure to guardian. | ☒ Partially implemented (by SELECT-omission convention, not RLS) |
| **Abuse/crisis-disclosure handling** — when a learner discloses distress/self-harm/abuse, the response is **learner-facing resources only** (empathise + trusted-adult/helpline redirect, never the guardian) plus **operator-alarmed telemetry** (`emitCrisisRedirectEvent`, `services/exchanges.ts`): a reliable server-side log + a structured Sentry operator alarm carrying **metadata-only** (correlation event-id + profileId-scoped pointers — never the disclosure text or raw minor PII). The server takes **no guardian-notification action** (guardian-is-the-abuser failure mode); **mandatory-reporting integration is deferred pending legal counsel**. Ruling se-032 (§6(b)); see `docs/registers/safety-guards/master.md`. | No sensitive disclosure reaches a guardian or a third-party event store; the highest-stakes path is never silent. | ☒ Implemented (WI-1358; guardian-notify ruled out on merits, mandatory-reporting deferred) |

### 2.3.e Security of processing (Art 32)

| Measure | Appropriateness | Status |
| --- | --- | --- |
| **Clerk JWT auth** — Zod-validated, alg allowlist (HS* excluded), JWKS rotation, exp/nbf/iat + skew, audience+issuer checks; 503 (not 401) on JWKS failure (`middleware/auth.ts`, `middleware/jwt.ts`). | Robust authentication. | ☒ Implemented |
| **App-layer data isolation** (scoped repo + parent-chain pin, e.g. `session/session-topic.ts:17-47`). | Primary confidentiality control. | ☒ Implemented |
| **Postgres RLS** — policies written & applied to 40+ tables (`0027_enable_rls.sql`, coverage `database-rls-coverage.ts`) **but inert at runtime**: app connects as `neondb_owner` (bypasses RLS) and the GUC setter is wired into ~1 real service. | **No active DB-layer defence-in-depth.** A `scopedWhere` bug is not backstopped. | ☒ Planned / Partial (PARKED) |
| **Secrets via Doppler + typed config** — Zod-validated env, prod keys hard-fail at boot, eslint bans raw `process.env` (`config.ts`, `eslint.config.mjs:385-489`). | Strong secret hygiene. | ☒ Implemented |
| **Sentry PII handling** — opaque IDs only, no name/email; minor-gated off on device (`sentry.ts`); CI guard bans raw-content forwarding. **No `beforeSend` field scrubber.** | Defensible but not field-level redaction. | ☒ Partially implemented |
| **Encryption** — TLS in transit (platform), Neon at-rest (platform), device SecureStore → Keychain/Keystore (`secure-storage.ts:24`; web falls back to plaintext localStorage, dev-only). | Standard transport/at-rest + native key storage. | ☒ Implemented (native) |
| **Breach escalation** — webhook signature/auth failures escalate via rate-limited Sentry + Inngest, not silent `console.warn` (`webhooks/signature-failure-escalator.ts`). | Meets "no silent recovery in auth/billing/webhook". | ☒ Implemented |

---

# 3. CONSIDERATIONS ON NECESSITY AND PROPORTIONALITY

## 3.1 Impacts on rights and freedoms

| # | Threat (as designed/mitigated) | How it materialises | Risk source | Impact on rights & freedoms |
| --- | --- | --- | --- | --- |
| 1 | **Incidental special-category exposure** in free-text/LLM-inferred fields | Learner volunteers, or a model infers, health/disability/belief content into transcript / `memory_facts` / `learning_profiles.struggles` | Open free-text design + LLM inference; no-clinical guard covers UI copy, not all LLM-written fields | Loss of confidentiality of sensitive traits about a child |
| 2 | **Persistent child profile** held long-term | Longitudinal learning record retained for teaching continuity | Product design (the "remembers" promise) | Profiling permanence; surveillance feel if over-broad |
| 3 | **Transfer of a child's data to US AI vendors** | Each turn's transcript leaves the EEA | Cross-border processing; vendor terms | Reduced control / redress over the child's data abroad |
| 4 | **Verbatim child quotes persist past the purge** | `concept_mastery.learner_quote` / summaries survive 30-day transcript purge | No purge path on those tables | Storage-limitation breach; misleading retention notice |
| 5 | **Weak age assurance** | Self-declared birth year; under-floor child slips in | No VPC/verified age | Wrong-regime processing of an actual child |

## 3.2 Necessity

The processing is **necessary and the least-intrusive effective option** for the stated purposes: a personalised AI tutor cannot teach adaptively without (a) the learner's message and (b) some persistent record of what was covered. The design already applies the **least-intrusive viable form** at the highest-volume egress — the LLM receives a derived age *band* not the birth year, **no name for minors**, and memory facts only with consent; numeric mastery is not transmitted; raw audio never leaves the device (voice is on-device transcription only). Alternatives considered and rejected as failing the purpose: shorter transcript retention than needed for summary generation (would defeat continuity — mitigated instead by the 30-day purge once the summary exists); no persistent memory (defeats the core product). The remaining un-minimised egress (raw message + in-session transcript) is **intrinsic** to the tutoring function.

## 3.3 Proportionality

The benefit — accessible, adaptive education for learners including children — is weighed against the impacts in §3.1. The processing is **proportionate provided the child-specific safeguards hold**: an indefinitely-held profile of a *child's* learning is justified **only** to the extent it serves teaching continuity (the same basis a school has for a pupil record), and only with minimised content, no third-party disclosure of the raw transcript, learner/guardian visibility & correction, and deletion on erasure/dormancy. **This proportionality finding is conditional on closing the launch-blocking gaps in §6** — especially verified retention, the lawful-basis record, transfer papering, and the Art 50 disclosure. Without them the balance does not clearly favour proceeding for the child cohort.

---

# 4. RISK ASSESSMENT AND MANAGEMENT

## 4.1.a Threats from accidental/unlawful/abnormal events

| # | Threat | How it materialises | Risk source | Impact |
| --- | --- | --- | --- | --- |
| 1 | **Illegitimate cross-profile access** | A raw `db.select()` forgets the `profileId` pin; RLS does not backstop (parked) | App-layer-only isolation | One family's child data disclosed to another |
| 2 | **Incomplete erasure** | A delete path misses an external store (Clerk / byok / financial) | Multi-store deletion | Data survives an erasure request |
| 3 | **Vendor / breach disclosure** | Processor breach (Neon, Clerk, an LLM vendor) | Sub-processor security | Mass exposure incl. children |
| 4 | **Transcript leak to guardian** | A dashboard query bug selects `session_events.content` | Guard-by-convention, not RLS | Verbatim child messages exposed to parent |
| 5 | **Consent-receipt destruction (I-C1)** | Legacy v1 cascade deletes `consent_states` audit on withdrawal | Legacy delete path | Loss of Art 7(3) proof |

## 4.1.b Method

A standard **likelihood × severity** matrix (each 1–4: Low / Medium / High / Very-High). Risk level = the higher-weighted combination, with **severity dominating** for children (a Very-High-severity impact is unacceptable even at Low likelihood). Acceptance: **Low** = acceptable; **Medium** = acceptable only with the stated mitigation tracked; **High/Very-High** = not acceptable, blocks launch until mitigated (and may trigger Art 36 prior consultation). The DPO sets final values.

## 4.1.c Inherent risk assessment

| # | Risk | Likelihood | Severity | Modulating factors | Inherent level | Acceptable? |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Incidental Art 9 in free-text/LLM fields | Med | High | No-clinical guard (UI only); no third-party transcript disclosure | High | No — mitigate |
| R2 | Cross-profile access (RLS parked) | Low–Med | High | Strong app-layer scoping; no DB backstop | Med–High | No — mitigate |
| R3 | Incomplete erasure | Low | High | v2 re-home-then-delete; Clerk+byok erased; onFailure escalates | Med | Conditional |
| R4 | Transfer to US AI vendors on wrong terms | Med | High | Minor-Gemini exclusion live; DPAs pending | High | No — mitigate (DPAs) |
| R5 | Verbatim child quotes survive purge | Med | Med | 30-day transcript purge done; quote tables not purged | Med | No — mitigate |
| R6 | Weak age assurance (under-floor child) | Med | Med | Server under-13 reject; self-declared only | Med | Conditional |
| R7 | Misleading retention notice | Low–Med | Med | Policy discloses retained summaries; quote age-out pending | Med | Conditional |
| R8 | I-C1 consent-receipt loss | Low | High | **Closed** — v2 re-home-then-delete is live (`IDENTITY_V2_ENABLED='true'`, confirmed 2026-06-30); defect existed on legacy v1 only | Low | Yes |
| R9 | Art 50 non-disclosure | High | Low–Med | ToS/PP disclosure only; no in-chat indicator | Med | No — remediate |

## 4.2 Action plan

### 4.2.a Additional mitigating measures

| # | Measure | Mitigates | Appropriateness | Status |
| --- | --- | --- | --- | --- |
| 1 | Sign **Art 28 DPAs** (business tier, no-training) + per-vendor **TIA**; confirm minor-Gemini exclusion at go-live | R4 | Closes the transfer/training exposure | ☒ Planned |
| 2 | Extend **no-clinical-copy guard to LLM-written fields** (`memory_facts.text`, `topic_notes.content`, `misconception`) | R1 | Server-side reject/scrub of clinical inference | ☒ Planned |
| 3 | Build **age-out / abstraction** for verbatim quotes on the 30-day clock | R5, R7 | Aligns quote retention with the transcript notice | ☒ Planned |
| 4 | Record an **accountable lawful-basis + terms-accepted** fact (incl. adults); split consent purposes | §2.1.a gap | Art 5(2)/7(1) accountability | ☒ Planned |
| 5 | Add an **in-chat "AI mentor" disclosure** indicator (Art 50, due 2 Aug 2026) | R9 | Point-of-interaction transparency | ☒ Planned |
| 6 | Confirm **`RETENTION_PURGE_ENABLED=true`** in prod Doppler; add a launch-readiness check | R7 | Verifies transcripts actually purge | ☒ Planned |
| 7 | Activate **DB-layer RLS** (app_user role + GUC setter) for defence-in-depth, or formally accept app-layer-only with a tracked remediation | R2, R4(transcript leak) | Backstops a scoping bug | ☒ Planned |
| 8 | Set **`retention_period`** values (counsel) + add an **account dormancy sweep** | §2.2.a gaps | Storage limitation | ☒ Planned |
| 9 | Appoint **DPO**; sign DPIA; publish privacy-policy pre-publish TODOs | governance | Launch gate | ☒ Planned |

### 4.2.b Residual risk assessment

| # | Reassessed risk | Measures applied | Residual L | Residual S | Residual level | Acceptable? |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Incidental Art 9 | #2 + no-disclosure-of-transcript | Low | High | Low–Med | Yes (DPO to confirm) |
| R2 | Cross-profile access | #7 | Low | High | Low | Yes |
| R4 | US-vendor transfer | #1 | Low | High | Low | Yes once DPAs signed |
| R5/R7 | Quote survival / notice | #3 + #6 | Low | Med | Low | Yes |
| R6 | Age assurance | (self-declared accepted at 13+ launch) | Med | Med | Med | DPO call |
| R8 | I-C1 | v2 live (confirmed) | Low | High | Low | Yes |
| R9 | Art 50 | #5 | Low | Low–Med | Low | Yes before 2 Aug 2026 |

### 4.2.c Plan

Measures #1–#9 are owned across **DPO/counsel** (DPAs, TIAs, lawful-basis values, retention periods, DPIA sign-off) and **engineering** (guard extension, quote age-out, Art 50 indicator, RLS activation, dormancy sweep, purge-flag verification). Sequence: governance + DPAs + lawful-basis record + transfer papering are **pre-launch hard blockers**; the Art 50 indicator has a **2 Aug 2026** legal deadline; quote age-out and RLS activation are tracked fast-follows if not done by launch. Post-launch monitoring: re-review on any change to data categories, purposes, or AI providers; annual DPIA review.

---

# 5. INVOLVEMENT OF INTERESTED PARTIES

## 5.1 DPO advice

`[To be recorded — the DPO owns and signs this DPIA.]` DPO appointment is itself a launch-blocking condition; this engineering draft exists to be reviewed, adjusted, and signed by the DPO/counsel, not to substitute for their judgement.

## 5.2 Views of data subjects or their representatives

Because the data subjects include **children**, direct consultation is qualified ("where appropriate", Art 35(9)). Pre-launch the controller relies on a **children's-product proxy**: applying the UK Children's Code and a child-readable privacy summary as the representation of children's interests, plus (recommended) a parent/youth-expert review panel. `[Document the panel/representative consultation — DPO.]`

---

# 6. CONCLUSION AND DECISION

Based on the assessment:

☒ **CONDITIONALLY APPROVED** *(engineering recommendation — final decision is the DPO's).* The processing may proceed only after these conditions are met:

- **Condition 1 — Governance:** DPO appointed; this DPIA signed; privacy-policy pre-publish TODOs (DPO name, registered address, Art 27 rep) resolved.
- **Condition 2 — Processors & transfers:** Art 28 DPAs signed on business tier with no-training terms; per-vendor TIA; minor-Gemini exclusion confirmed at go-live.
- **Condition 3 — Lawful-basis accountability:** a recorded lawful-basis + terms-accepted fact (incl. adults). *(The live v2 cutover that closes I-C1 is confirmed enabled, 2026-06-30 — no longer an open item.)*
- **Condition 4 — Retention truth:** `RETENTION_PURGE_ENABLED=true` confirmed in prod; verbatim-quote age-out built or tracked; `retention_period` values set; dormancy sweep planned.
- **Condition 5 — Minimisation & transparency:** no-clinical-copy guard extended to LLM-written fields; in-chat Art 50 AI disclosure (by 2 Aug 2026).
- **Condition 6 — Security:** DB-layer RLS activated **or** app-layer-only formally accepted with a tracked remediation.

**Art 36 prior consultation with Datatilsynet:** expected **not required** if the residual risks are reduced to acceptable by the measures above; required only if a High residual risk survives mitigation. **DPO call.**

| | |
| --- | --- |
| **Residual risk after mitigations** | `[DPO to set]` — on current evidence **Low–Medium**, conditional on §6. |
| **Approved to launch?** | ☐ Yes ☐ No — DPO: ____________ Date: ________ |

---

**Sign-off:** DPO + counsel. This draft is engineering- and policy-complete to the limits of code evidence; `[bracketed]` items need the company's registration details and the DPO/lawyer's professional judgement. Every status and `file:line` above reflects the tree at/near `origin/main` on 2026-06-30 and should be re-verified against the built schema before final sign-off.
