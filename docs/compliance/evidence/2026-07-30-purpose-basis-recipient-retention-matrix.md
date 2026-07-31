# Purpose × Legal Basis × Recipient × Retention Matrix — MentoMate

**Draft v0.1 · agent-drafted · 2026-07-30 · legal-basis assignments are PROPOSALS for DPO review**

**Controller:** ZWIZZLY AS, org.nr 811696072, Fiskekroken 3B, 0139 Oslo, Norway.
**Proposed lead supervisory authority:** Norwegian Datatilsynet (memo accepted by DPO 2026-07-30).
**Feeds:** DPO action-register row 4 — *"Purpose×basis×recipient×retention matrix; LIAs; consent log spec; screen inventory"*
([`DPO exchanges/2026-07-26-action-register-tracker.md:24`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)).

**Companion documents in this package:**
[`2026-07-30-legitimate-interest-assessments.md`](2026-07-30-legitimate-interest-assessments.md) ·
[`2026-07-30-consent-log-spec.md`](2026-07-30-consent-log-spec.md) ·
[`2026-07-30-consent-screen-inventory.md`](2026-07-30-consent-screen-inventory.md)

**Sources this matrix reconciles (and does not restate):**
[`dpia.md`](../dpia.md) · [`edpb_dpia_filled_2026_v1.md`](../edpb_dpia_filled_2026_v1.md) ·
[`ropa.md`](../ropa.md) · [`art9-special-category-position.md`](../art9-special-category-position.md) ·
[`2026-07-30-retention-schedule.md`](2026-07-30-retention-schedule.md) and its predecessor
[`2026-07-26-retention-schedule-draft.md`](2026-07-26-retention-schedule-draft.md) (retention categories 1–15; **owned separately — referenced, not rewritten**. The two use the **same category numbering**, so a "category N" reference below resolves in either; the 07-30 version is the current authority for *values*, the 07-26 draft for the *gap register* G-1…G-11) ·
[`2026-07-26-recipient-matrix-draft.md`](2026-07-26-recipient-matrix-draft.md) (recipient roles and DPA status).

**Sibling drafts produced in the same 2026-07-30 package** that resolve open items raised here:
[`2026-07-30-residence-determination-design.md`](2026-07-30-residence-determination-design.md) ·
[`2026-07-30-age-assurance-design.md`](2026-07-30-age-assurance-design.md) ·
[`2026-07-30-memory-disclosure-copy-inventory.md`](2026-07-30-memory-disclosure-copy-inventory.md) ·
[`2026-07-30-child-notice-memory-section-draft.md`](2026-07-30-child-notice-memory-section-draft.md).

---

## 1. Why this document exists, and what is new in it

The ROPA and the two DPIA drafts each state legal bases, but they state them **per data-flow** (ROPA
activities 1–16) or **per broad category** (EDPB template §2.1.a, four rows). Neither is organised by
**purpose**, which is the unit Art 5(1)(b) and Art 30(1)(b) actually operate on, and neither separates the
purposes that **run at launch** from the ones the DPO's interim condition has **parked**.

This matrix introduces that separation. The substantive changes it proposes against the existing documents
are listed in §6 so the DPO can see exactly what moved and why, rather than diffing four files.

### 1.1 The purpose-lane model

Agreed with management, 2026-07-30. Five product lanes plus fourteen operational purposes.

| Lane | Name | One-line description | Basis proposed | Launch status |
|---|---|---|---|---|
| **P1** | Deliver mentoring | The live tutoring conversation — the thing the subscriber buys | Art 6(1)(b) contract | **Active** |
| **P2** | Learning record | Curricula, progress, mastery, assessments, spaced-repetition reviews | Art 6(1)(b) contract | **Active** |
| **P2b** | Declared preferences | Conversation language, pronouns, interests, analogy domain, native language — **settings the user states**, never inference | Art 6(1)(b) contract (service configuration) | **Active** |
| **P3** | Personalization memory | The "knows-me" persistent memory: durable facts, session summaries used for continuity, semantic recall | Art 6(1)(a) consent | **PARKED** |
| **P4** | Inferred profiling and adaptation | LLM-derived learning style, strengths, struggles, communication notes, inferred interests | Art 6(1)(a) consent | **PARKED** |

**The P2 / P3 boundary is the hardest line in this document and the DPO should test it.** Both involve
remembering something about the learner across sessions. The distinction proposed is:

- **P2 (contract)** is the *record of what was taught and how it went* — the same thing any school or
  tutoring service necessarily keeps to deliver structured teaching. Without it there is no curriculum
  sequence, no review schedule, no progress view. A learner who says "I don't want a learning record" is
  asking for a product that cannot be delivered, which is the textbook shape of Art 6(1)(b) necessity.
- **P3 (consent)** is the *record of the learner as a person* — durable facts about them, used to make the
  mentor feel like it knows them. It is a genuine product enhancement and a genuine choice. The service
  works without it; it is simply less warm. That is why it can carry consent, and why consent here is real
  rather than a formality.

If the DPO disagrees and considers P2 to require consent as well, the consequence is significant and should
be stated now: the core product would become consent-dependent for minors, and a withdrawal would have to
tear down the curriculum state, not just the memory. This draft's position is that P2 is contract-necessary.

### 1.2 The parked lanes and the interim condition

Stephan Hartmann's interim advice record (26 Jul 2026) imposes: *"Persistent memory + profiling stay
disabled until legal basis/controls/transparency/retention approved"*
([`action-register-tracker.md:42`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)). P3 and P4 are
that condition's subject. **Closing this document, the LIA set, the consent-log spec, and the retention
schedule is the unlock.**

> **Honest statement of how the condition is currently held — read this before assuming it is safe.**
> There is **no global kill switch** for persistent memory. A config sweep of `apps/api/src/config.ts` found
> only architecture-phase flags (`MEMORY_FACTS_READ_ENABLED`, `MEMORY_FACTS_RELEVANCE_RETRIEVAL`,
> `MEMORY_FACTS_DEDUP_ENABLED` — lines 125-128), which govern which storage generation is read, **not**
> whether memory is processed at all. The condition is held today by two facts and no mechanism:
> **(a)** there are zero users (pre-launch), and **(b)** `learning_profiles.memory_consent_status` defaults
> to `'pending'` (`packages/database/src/schema/learning-profiles.ts:36-40`) and every write and injection
> path refuses unless it is `'granted'` (§4). That is a sound per-learner default, but it means the
> condition would be honoured at launch **only because no one has said yes yet** — not because anything
> would stop them saying yes. If the DPO requires the condition to be *enforced* rather than *defaulted*, a
> server-side flag that refuses to accept a memory-consent grant is a small piece of work and should be
> raised as such. See open item **M-O1**.

---

## 2. Matrix — product lanes

Retention entries cite the **category number** in
[`2026-07-26-retention-schedule-draft.md`](2026-07-26-retention-schedule-draft.md) §2; that document owns
the values and this one does not restate or amend them.

### P1 — Deliver mentoring

| | |
|---|---|
| **Purpose** | Conduct the live tutoring exchange: accept the learner's turn, construct a prompt, call a vetted LLM, return the reply. |
| **Data categories** | Raw conversation turns (`session_events`, `learning_sessions`, `onboarding_drafts`, `parking_lot_items`); homework images on vision calls; derived age-voice band; adult learner's first name (**suppressed for all minors**). |
| **Legal basis** | **Art 6(1)(b) contract.** This is the service itself. For a minor who is not a party to the paid contract, performance runs to the learner as the beneficiary of the subscription taken out by the adult; the minor's own processing additionally carries the Art 8 parental-authorisation layer where the jurisdiction's self-consent age is not met. |
| **Art 9 position** | **Incidental only.** Open-text input means health, belief, ethnicity, or orientation may be disclosed by the learner or inferred by the model. Not solicited, not used for personalisation or training. Position and pending advice: [`art9-special-category-position.md`](../art9-special-category-position.md). |
| **Recipients** | **LLM providers** — Cerebras (`gpt-oss-120b`, the live universal default since `LLM_ROUTING_V2_ENABLED=true` in stg+prd, 2026-07-11), OpenAI, Anthropic, Mistral. Gemini/Vertex **policy-excluded and blocked under-18**, enforced fail-closed (`apps/api/src/services/llm/router.ts:559,648,1085`). Neon (DB), Cloudflare (compute). |
| **Retention** | Category **1** — raw conversation content, **30 days**, code-verified; hard `DELETE FROM session_events` once a complete summary exists. |
| **Launch status** | **ACTIVE.** |
| **Blocking issue** | **Cerebras has no binding DPA** and its own assessment says "do not launch EEA personal-data processing through Cerebras until section 8 is closed" ([`2026-07-26-recipient-matrix-draft.md:37-53`](2026-07-26-recipient-matrix-draft.md)). This is a launch blocker on P1, the most important lane. |

### P2 — Learning record

| | |
|---|---|
| **Purpose** | Maintain the structured record of what has been taught, assessed, and mastered, so teaching can be sequenced, reviewed, and reported. |
| **Data categories** | Assessments, concept mastery, quiz rounds and missed items, dictation results, vocabulary and retention cards, subjects/curricula/books/topics, streaks, XP, bookmarks, progress and weekly/monthly reports, milestones, session summaries, topic notes, Challenge-Round verbatim `learnerQuote` evidence. |
| **Legal basis** | **Art 6(1)(b) contract** — see the §1.1 argument. The learning record is not an enhancement; it is the mechanism by which structured teaching is delivered. |
| **Art 9 position** | Incidental only, as P1. One specific exposure: **verbatim learner quotes** captured as Challenge-Round evidence may contain sensitive disclosures and **survive the 30-day raw-transcript purge** (gap G-1 / A24-b). |
| **Recipients** | LLM providers (assessment and grading calls); Neon; Cloudflare. |
| **Retention** | Categories **3** (quotations — life of person, **no age-out**), **4** (summaries/derived notes — life of person), **5** (learning state — life of person; `subjects` soft-archived after 30 days inactivity). |
| **Launch status** | **ACTIVE.** |
| **Note for the DPO** | Retention "life of person" for a *child's* performance record is defended in [`dpia.md:66`](../dpia.md) on the school-pupil-record analogy. That paragraph is the Art 5(1)(e) proportionality argument and must survive into the signed DPIA. The verbatim-quote age-out (A24-b) is the one piece that is currently scoped post-launch and that the DPO may wish to pull forward. |

### P2b — Declared preferences

| | |
|---|---|
| **Purpose** | Configure the service to the user's stated choices — the language the mentor speaks, how to address them, what to use for analogies. |
| **Data categories** | `person.conversation_language` (`packages/database/src/schema/identity.ts:112`, CHECK-constrained to 10 values at `:148`), `person.pronouns` (`:113`, ≤32 chars at `:150-153`), `learning_profiles.interests` (`packages/database/src/schema/learning-profiles.ts:26`), `teaching_preferences.analogy_domain` and `.native_language` (`packages/database/src/schema/assessments.ts:239-240`). |
| **Legal basis** | **Art 6(1)(b) contract — service configuration.** A user who states a preference is asking for the service to be delivered a particular way; honouring it is performance of that request, not a separate optional benefit. No consent is required to act on a setting the user just typed. |
| **Art 9 position** | **Watch item, not incidental.** Pronouns can reveal gender identity; freely-typed interests can reveal religion, political opinion, or health. Neither field is *designed* to elicit special-category data, but both are free-text-adjacent. Pronouns are length-capped, not value-constrained. **This lane deserves an explicit line in the DPO's Art 9 determination rather than being folded into the general open-text answer.** |
| **Recipients** | LLM providers (these preferences are, by design, injected into the prompt so the mentor honours them); Neon; Cloudflare. |
| **Retention** | Category **5** (learning state) and **7a** (identity) — life of person; erased by the whole-person cascade. |
| **Launch status** | **ACTIVE.** |
| **Structural finding — provenance is not recorded** | `learning_profiles.interests` is written by **both** the declared path (onboarding) **and** the inferred path: `applyAnalysis` merges LLM-extracted interests into the same column (`apps/api/src/services/learner-profile.ts:600-609`, prompt instruction at `:84,95`). There is **no per-entry provenance flag**. The lanes stay separable *in operation*, because the inference write is refused unless memory consent is granted (`:1435-1440`), so with P3/P4 parked nothing inferred is written. But once P3 unlocks, an export or a rectification request cannot distinguish "I said I like dinosaurs" from "the model concluded I like dinosaurs". See open item **M-O2**. |

### P3 — Personalization memory · **PARKED**

| | |
|---|---|
| **Purpose** | The "knows-me" promise: remember durable facts about the learner across sessions so the mentor's teaching has continuity and warmth. |
| **Data categories** | `memory_facts` (+ its `embedding` vector), `memory_dedup_decisions`, session summaries used for recall, `session_embeddings`. |
| **Legal basis** | **Art 6(1)(a) consent — designated basis, effective on unlock.** Consent is the right basis: the service is deliverable without it, so the choice is genuine and refusal carries no detriment, which is what makes consent freely given for a child. For a minor below the jurisdiction's self-consent age, the Art 8 parental-authorisation layer applies on top. |
| **Art 9 position** | **The most exposed lane.** A durable memory is exactly where an incidental disclosure becomes a *sensitive characterisation* — the distinction the Art 9 position document draws at [`art9-special-category-position.md:33-37`](../art9-special-category-position.md). Controller safeguard already in code: a central runtime attribution guard rejects or scrubs clinical characterisations before LLM-written durable fields persist (`dpia.md:80,115` — the no-clinical-copy enforcement, WI-1195). |
| **Recipients** | **Voyage AI** (embeddings — receives raw learner text, not only summaries); LLM providers (memory is injected into prompts on recall); Neon (pgvector). |
| **Retention** | Categories **4** (summaries) and **6** (embeddings) — life of person; embeddings cascade on person and session delete and are *rewritten* from summary text at the 30-day purge. |
| **Launch status** | **PARKED under the DPO interim condition.** Held by consent defaulting to `'pending'`, not by a switch — see §1.2 and open item **M-O1**. |

### P4 — Inferred profiling and adaptation · **PARKED**

| | |
|---|---|
| **Purpose** | Adapt teaching to the learner by inferring, from the conversation, how they learn and where they struggle. |
| **Data categories** | `learning_profiles.learning_style`, `.strengths`, `.struggles`, `.communication_notes`, `.suppressed_inferences`, inferred `.interests` (`packages/database/src/schema/learning-profiles.ts:25-31`); `needs_deepening_topics`; concept-mastery inferences. |
| **Legal basis** | **Art 6(1)(a) consent — designated basis, effective on unlock.** Same reasoning as P3. |
| **Art 9 position** | **Highest inference risk in the system** — "this learner is likely dyslexic" is the exact example the Art 9 position names as outside the intended purpose (`art9-special-category-position.md:33-37`). Mitigated by the no-clinical-copy guard and by `suppressed_inferences`, which lets a learner or parent permanently hide a topic from inference (`learner-profile.ts:105` prompt instruction, suppression handling at `:720-728`). |
| **Art 22** | **Not engaged.** The profiling personalises teaching only and produces no legal or similarly significant effect. [`dpia.md:90`](../dpia.md) records this explicitly so the question is closed. |
| **Recipients** | LLM providers; Neon. |
| **Retention** | Category **5** (learning state) — life of person. |
| **Launch status** | **PARKED under the DPO interim condition.** |

---

## 3. Matrix — operational purposes

| # | Purpose | Data categories | Legal basis (proposed) + justification | Art 9 | Recipients / processors | Retention (category) | Launch |
|---|---|---|---|---|---|---|---|
| **O1** | **Account and authentication** | `login` (`clerk_user_id`, email), `person` (display name), `organization`, `membership` | **6(1)(b)** — you cannot provide an account-based service without an account. | None intended | **Clerk** (processor, auth only, `MMT-ADR-0001`); Neon; Cloudflare | **7a** — life of person; external Clerk identity erased on deletion (`apps/api/src/inngest/functions/account-deletion.ts:202`) | Active |
| **O2** | **Billing and subscription** | `subscription`, `subscription_payers`, `payer_person_id`, store identifiers, quota/usage/top-up records | **6(1)(b)** for the paid plan to the adult payer; **6(1)(c)** for the tax/accounting record retained after deletion. A minor cannot be a party to the paid contract ([`edpb_dpia_filled_2026_v1.md:185`](../edpb_dpia_filled_2026_v1.md)) | None | **RevenueCat**, **Apple**, **Google** (IAP); **Stripe** — *dormancy ruling still open, webhook route is mounted and live* (`apps/api/src/routes/stripe-webhook.ts:90`) | **10**; `financial_record` survives person-delete, **`retention_period` NULL — counsel must set** (gap G-2) | Active |
| **O3** | **Age and jurisdiction assurance** | `person.birth_date`, `.residence_jurisdiction`, `knowledge_assertions` (axis, method, confidence, source, actor) | **6(1)(c) primary** — Art 8(2) "reasonable efforts to verify" plus Art 5(2) accountability. **6(1)(f) in the alternative — see LIA-4.** | Ordinary personal data (ROPA states this expressly) | Neon | **7a** — life of person; append-only, never deleted while the person exists | Active |
| **O4** | **Consent administration and evidence** | `consent_grant`, `consent_request`, `guardianship` edges, consent IP + user-agent | **6(1)(c)** — Art 7(1) requires the controller to be *able to demonstrate* consent; keeping the proof is a legal obligation independent of the consent it proves. | None | Neon; **Resend** (consent emails to a guardian) | **7a** live; **7b** for the surviving `consent_receipt` — **`retention_period` NULL** (gap G-2) | Active |
| **O5** | **Child safety and safeguarding** | Deterministic tripwire evaluation of learner input; aggregate `blocked_safety_digest` counters | **6(1)(f) — see LIA-3**, with **6(1)(d) vital interests** available for acute crisis escalation. | **Genuine Art 9 exposure** — a hit is an inference about mental health or abuse victimhood. **Art 9(2) condition required and not yet determined.** | Neon (aggregate only); the crisis redirect is generated in-product | **8** — aggregate counters, no PII by design, no age-out | Active |
| **O6** | **Security and abuse prevention** | Webhook idempotency keys, in-memory per-IP rate-limit state, auth integrity | **6(1)(f) — see LIA-2.** Recital 49 is express. | None | Neon; Cloudflare | **8** — idempotency keys **30 days**, code-verified (`apps/api/src/inngest/functions/webhook-idempotency-purge.ts:32,44-61`) | Active |
| **O7** | **Error and performance monitoring** | Error events, stack traces, request metadata, may include `person_id` | **6(1)(f) — see LIA-1.** | Excluded by design (denylist scrub, `apps/api/src/services/sentry.ts:101,126-147`) — procedural, not structural | **Sentry** | **8** — **[OPEN: Sentry project retention is a dashboard setting]**; schedule proposes 90 days by convention | Active |
| **O8** | **Transactional email** | Email address, message content (account, security, consent, guardian notices) | **6(1)(b)** for service messages; **6(1)(c)** for consent and security notices we are obliged to send | None | **Resend** | Per provider DPA; `email_suppressions` has **no delete path at all** (gap G-4) | Active |
| **O9** | **Notifications (push)** | Expo push tokens (device-bound, person-scoped), templated payloads, `notification_preferences` (`packages/database/src/schema/progress.ts:96`), `notification_log` (`:156`) | **Service notifications: 6(1)(b)**, with 6(1)(f) in the alternative. **Re-engagement nudges to minors: consent — see LIA-5.** ROPA currently records this row as *"legal basis to confirm at DPO sign-off"* ([`ropa.md:63`](../ropa.md)); this is that proposal. | None | **Expo push relay** (`apps/api/src/services/notifications.ts:59`) → **Apple APNs / Google FCM as Expo's sub-processors**, not direct integrations | Token: life of device registration. Payloads transient. `notification_log` — no independent age-out found | Active |
| **O10** | **Support and feedback** | `support_messages` (raw free text), `feedback_retry_queue` (opaque id only, deliberately no FK), visibility-contract audit tables | **6(1)(b)** — handling a subscriber's support request is performance of the service | Possible incidental disclosure in free-text support messages | Neon; **Resend** (replies) | **9** — support messages life of person (cascade only); `feedback_retry_queue` has its own TTL cron | Active |
| **O11** | **Guardian and supporter visibility** | Guardian-facing recaps and progress summaries; `guardianship` / `supportership` edges; supporter visibility contracts and notices | **6(1)(b)** for the edge as the mechanism of the family service, with **consent** governing what the edge is permitted to see. **This draft removes the ROPA's 6(1)(f) reliance on this row** ([`ropa.md:52`](../ropa.md)) — see LIA §0. | Suppression of sensitive characterisations from guardian-facing summaries is a stated controller safeguard (`art9-special-category-position.md:28`) | Neon; Expo push; Resend | **7a** / **9** — history preserved via partial-unique on revoke | Active |
| **O12** | **Erasure evidence** | `person_retain` set: `consent_receipt`, `deletion_audit`, `financial_record` | **6(1)(c)** — proving lawful erasure and retaining the tax record are obligations that necessarily outlive the person record | None | Neon | **7b** — **`retention_period` columns exist (`identity.ts:566,588,607`) but are NULL. Counsel-owned seam. Gap G-2, DPIA launch condition 7.** | Active |
| **O13** | **BYOK waitlist** | Email address only (`byok_waitlist`) | **6(1)(a) consent** — a pure sign-up-to-be-told list, outside the identity model | None | Neon | **10** — erased by email match on whole-org deletion (`deletion-v2.ts:542-548`); person-scoped paths unverified (gap G-6) | Active if the waitlist is live |
| **O14** | **Durable async execution** *(a processing **means**, recorded for completeness — not an independent purpose)* | Job payloads carrying `person_id` and org id | Inherits the basis of the purpose whose work it carries (deletion, purge, reports, notifications) | Scrubbed by call-site discipline | **Inngest** | **13** — **[OPEN: no in-repo statement of Inngest's event-payload retention]** | Active |

---

## 4. Where the parked lanes are actually enforced in code

The DPO should be able to check the parking claim rather than take it on trust. The gate is real, it is
double-checked, and it is layered.

| Layer | Site | What it refuses |
|---|---|---|
| Derived-memory / profiling **write** | `apps/api/src/services/learner-profile.ts:1435-1440` | Refuses the whole `applyAnalysis` update unless `memoryConsentStatus === 'granted'` **and** `memoryCollectionEnabled !== false` |
| GDPR consent state, **outer check** | `apps/api/src/services/learner-profile.ts:1412-1415` (`isLlmExchangeConsentAllowed`) | Refuses when the *regulatory* consent is withdrawn — parental **or** adult self-consent (`art6_1_a`), per WI-221 / WI-2396 |
| GDPR consent state, **in-transaction re-check** | `apps/api/src/services/learner-profile.ts:1424-1433` | Closes the TOCTOU window between the outer gate and the write |
| Session-completion memory write | `apps/api/src/inngest/functions/session-completed.ts:1705-1717` | Same two-condition gate, with an explicit comment that `revokeConsent` does not clear `memoryConsentStatus`, so the memory gate alone is insufficient |
| Memory **injection** into prompts | `apps/api/src/services/learner-profile.ts:841-844`; `apps/api/src/services/memory/memory-facts.ts:168`; `apps/api/src/services/curated-memory.ts:199` | Refuses to inject memory into an LLM prompt unless consent is granted |
| Injection toggle integrity | `apps/api/src/services/learner-profile.ts:1692-1695` | Refuses to enable injection at all when consent is not granted (`[F-PV-09]`) |
| Embedding backfill | `apps/api/src/inngest/functions/memory-facts-embed-backfill.ts:136` | Filters the backfill query to `memoryConsentStatus = 'granted'` |

**The LLM dispatch is separately gated, one layer up.** The comment at `learner-profile.ts:1406-1411` notes
that on the `learner-input.ts` path the LLM call runs before `applyAnalysis`'s own check — but both routes
reaching that code call `assertLlmConsent(db, profileId)` immediately beforehand
(`apps/api/src/routes/learner-profile.ts:353`, `:375`, WI-2396), which denies on a withdrawn `llm_disclosure`
purpose (`apps/api/src/services/identity-v2/consent-status-v2.ts:863-872`). Parking P3 therefore stops the
durable memory, and a withdrawal of `llm_disclosure` stops the transmission as well.

**But the gate is fail-open.** `isLlmExchangeConsentAllowed` uses "no rows → allowed" semantics — only an
explicit `WITHDRAWN` denies (`consent-status-v2.ts:847-849,861`). It enforces withdrawal, not the existence
of consent. Combined with the finding that the adult consent screen is **not mounted** (consent-screen
inventory §2), a user can hold no grant row and still pass. Recorded as **Finding C-4** in the consent-log
spec and **M-O11** below.

---

## 5. Article 9 — consolidated position across the lanes

The controller's position ([`art9-special-category-position.md`](../art9-special-category-position.md)) is
that special-category data is neither solicited nor intended, but incidental disclosure and inference are
foreseeable and must not be described as impossible. Applying that lane by lane:

| Lane | Art 9 exposure | Treatment |
|---|---|---|
| P1 mentoring | Incidental disclosure in open text; transient transmission to the provider | Discourage in child-readable copy; no solicitation in prompts; 30-day purge of raw content |
| P2 learning record | **Verbatim quotes survive the purge** (gap G-1 / A24-b) | Age-out currently scoped post-launch — DPO may pull forward |
| P2b declared preferences | Pronouns and free-text interests can carry Art 9 signal | **Needs its own line in the DPO determination** — currently unaddressed by the general open-text answer |
| P3 memory | Incidental disclosure becomes a **durable sensitive characterisation** | No-clinical-copy runtime guard (WI-1195); exclusion from memory is a stated safeguard |
| P4 profiling | **Highest** — inference is the purpose | No-clinical-copy guard; `suppressed_inferences` user control |
| O5 safeguarding | Inference about mental health / abuse victimhood **is the output** | LIA-3 covers Art 6 only. **An Art 9(2) condition is required and not determined.** |

**The four questions put to the DPO in `art9-special-category-position.md:41-48` remain open.** Nothing in
this matrix answers them; it only shows where the answer will bite hardest — which is O5 safeguarding first,
P4 profiling second.

---

## 6. What this draft changes against the existing documents

Listed so the DPO can see the deltas rather than diff four files.

1. **Splits the ROPA's "Consent" learning rows into P2 (contract) and P3/P4 (consent).** ROPA activities 6,
   7, 8 and 9 all currently read basis = "Consent" ([`ropa.md:53-56`](../ropa.md)). This draft proposes that
   the *learning record* is contract-necessary and only the *memory and inference* layers rest on consent.
   **If the DPO accepts, the ROPA needs updating to match** — this document does not edit it.
2. **Introduces P2b as its own lane.** No existing document treats declared preferences separately; they are
   folded into "personalisation", which wrongly implies consent. A stated setting is service configuration.
3. **Removes 6(1)(f) from the guardianship/mentorship row** (ROPA row 5) in favour of contract + consent.
4. **Proposes a basis for the push-notification row**, which the ROPA leaves as "to confirm at DPO sign-off"
   ([`ropa.md:63`](../ropa.md)) — and splits it, because service notifications and re-engagement nudges to
   minors cannot share a basis.
5. **Records that no product analytics exists**, corroborating closure-check finding C1
   ([`dpia.md:113`](../dpia.md)): a manifest sweep found only `@sentry/react-native`
   (`apps/mobile/package.json:42`) and `@sentry/cloudflare` (`apps/api/package.json:23`).
6. **States that the interim memory-parking condition has no enforcement mechanism**, only a default (§1.2).

### 6.1 Contradictions found between the documents and the code

| # | Contradiction | Resolution |
|---|---|---|
| **X-1** | [`edpb_dpia_filled_2026_v1.md:190`](../edpb_dpia_filled_2026_v1.md) states there is **no lawful-basis or terms-accepted record for adults** and that "only one purpose value is ever written (`'app_usage'`)". [`dpia.md:62`](../dpia.md) states the opposite — WI-1193 delivered `adult_self_consent`, versioned terms-acceptance, granular purposes, and `PUT /consent/self/withdraw`. | The EDPB template is **stale**; `dpia.md:126` itself flags it as carrying v0.1 framing and owing a sync. The consent-log spec verifies the current state against code. **The DPO must not read the EDPB fill as current on this point.** |
| **X-2** | ROPA row 16 (push) records the basis as unresolved while the row is live in production. | Proposed and split in O9 above. |
| **X-3** | ROPA rows 6–9 assign "Consent" to learning data that this draft argues is contract-necessary. | §6 item 1. Requires a DPO ruling before either document is amended. |
| **X-4** | The recipient matrix identifies **Cerebras as the live default LLM recipient with no binding DPA**, while the DPIA's launch-condition 2 discusses OpenAI at length and does not name Cerebras as the default. | The recipient matrix is more current (2026-07-26, post-routing-v2). **Cerebras is the live P1 recipient.** DPIA §9 condition 2 needs updating. |
| **X-5** | `interests` is documented as a declared preference but is also LLM-inferred into the same column with no provenance flag. | Recorded in P2b above; operationally separable today only because P3/P4 are parked. Open item M-O2. |

---

## 7. Open items

| ID | Open item | Owner |
|---|---|---|
| **M-O1** | No global enforcement of the interim memory-parking condition — held by a per-learner default, not a switch. Decide whether a server-side refusal is required before launch. | DPO ruling → engineering |
| **M-O2** | `learning_profiles.interests` mixes declared and inferred entries with no provenance flag; affects export, rectification, and the P2b/P4 boundary once P3 unlocks. | Engineering / product |
| **M-O3** | Art 9(2) condition determination — bites hardest on O5 safeguarding and P4 profiling | DPO / counsel |
| **M-O4** | Art 9 treatment of pronouns and free-text interests (P2b) — not covered by the general open-text answer | DPO |
| **M-O5** | `person_retain.retention_period` values (gap G-2, DPIA launch condition 7) | Counsel |
| **M-O6** | Sentry project retention window (dashboard setting) | Infra |
| **M-O7** | Inngest event-payload retention (no in-repo statement) | Infra |
| **M-O8** | Stripe dormant-vs-live ruling — the webhook route is mounted and live | Product / engineering |
| **M-O9** | Cerebras DPA — blocks P1, the primary lane | Zuzana / DPO (action-register row 9) |
| **M-O10** | Whether the DPO accepts P2 as contract rather than consent — if not, the consequences in §1.1 follow | **DPO — this is the single most consequential ruling in this document** |
| **M-O11** | Fail-open consent gate + unmounted adult consent screen (WI-2411) together permit processing with no recorded consent — Finding C-4 | **Engineering — launch-blocking** |

---

**Prepared:** 2026-07-30, agent-drafted from code and existing compliance artifacts. Every product claim
carries a `file:line` citation or is marked `[OPEN]`. Legal-basis assignments are **proposals for DPO
review**, not determinations. This document does not edit the ROPA, DPIA, retention schedule, or action
register; where it disagrees with them, §6 records the disagreement for the DPO to rule on.
