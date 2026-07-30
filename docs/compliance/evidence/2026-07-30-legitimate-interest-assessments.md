# Legitimate Interest Assessments (LIAs) — MentoMate

**Draft v0.1 · agent-drafted · 2026-07-30 · NOT legal advice — proposals for DPO review**

**Controller:** ZWIZZLY AS, org.nr 811696072, Fiskekroken 3B, 0139 Oslo, Norway.
**Feeds:** DPO action-register row 4 ("Purpose-level legal-basis + consent design"), gap item *"LIAs"* —
[`DPO exchanges/2026-07-26-action-register-tracker.md:24`](../DPO%20exchanges/2026-07-26-action-register-tracker.md).
**Companion:** [`2026-07-30-purpose-basis-recipient-retention-matrix.md`](2026-07-30-purpose-basis-recipient-retention-matrix.md) (the keystone table this document supports),
[`2026-07-30-consent-log-spec.md`](2026-07-30-consent-log-spec.md), [`2026-07-30-consent-screen-inventory.md`](2026-07-30-consent-screen-inventory.md).

> **What this document is.** GDPR Art 6(1)(f) permits processing necessary for a controller's legitimate
> interests "except where such interests are overridden by the interests or fundamental rights and
> freedoms of the data subject, **in particular where the data subject is a child**." That final clause is
> the whole difficulty for MentoMate: our data subjects include 13–17-year-olds, so every balancing test
> below starts from a position adverse to the controller and has to be argued up, not assumed.
>
> Each assessment follows the ICO/EDPB three-part structure: **purpose test** (is there a real interest?),
> **necessity test** (is the processing genuinely necessary to it, or would a less intrusive route work?),
> **balancing test** (do the subject's rights override it?). A conclusion of "cannot rely on 6(1)(f)" is a
> valid and useful outcome, not a failure.

---

## 0. Scope — which purposes actually ride on Art 6(1)(f)

Five processing purposes are proposed to rest on legitimate interests, wholly or in the alternative. They
are the ones marked `6(1)(f)` in the companion matrix.

| LIA | Purpose | Proposed status | Section |
|---|---|---|---|
| **LIA-1** | Error and performance monitoring (Sentry) | Sole basis | §1 |
| **LIA-2** | Service security and abuse prevention (auth abuse, webhook replay, rate limiting) | Sole basis | §2 |
| **LIA-3** | Child-safety tripwire and crisis escalation (safeguarding) | Primary basis, with Art 6(1)(d) vital interests available for genuine crisis | §3 |
| **LIA-4** | Age- and jurisdiction-assurance audit trail (`knowledge_assertions`) | **Alternative** basis; Art 6(1)(c) legal obligation is the primary proposal | §4 |
| **LIA-5** | Service and progress notifications (push) | Proposed basis for *service* notifications only; re-engagement nudges are carved out to consent | §5 |

Two purposes that the ROPA currently marks "Legitimate interests" are **removed** from 6(1)(f) reliance by
this draft, and the reasoning is recorded so the change is visible rather than silent:

- **Guardianship / mentorship consent-authority edges** — ROPA row 5 lists "Consent; Legitimate interests"
  ([`ropa.md:52`](../ropa.md)). This draft proposes **Art 6(1)(b) contract** for the edge itself (it is the
  mechanism by which the subscribed family service is delivered) with **consent** governing what the edge
  permits. Relying on legitimate interests to justify one person's visibility of a child's data is the
  weakest available argument and is unnecessary when contract and consent both fit.
- **Product analytics** — no legitimate-interest analytics case is made because **no product-analytics
  processing exists**. The only observability SDKs in the dependency tree are `@sentry/react-native`
  (`apps/mobile/package.json:42`) and `@sentry/cloudflare` (`apps/api/package.json:23`); a package-manifest
  sweep for PostHog, Amplitude, Mixpanel, Segment, and Firebase Analytics returned nothing. This
  corroborates closure-check finding **C1** (soften the analytics claim in the privacy policy — only error
  monitoring exists), recorded at [`dpia.md:113`](../dpia.md).

---

## LIA-1 — Error and performance monitoring

**Processing:** application error events, stack traces, request metadata, and performance spans captured by
Sentry from both the Cloudflare Workers API and the React Native mobile client. May carry a `person_id`.
ROPA activity 12 ([`ropa.md:59`](../ropa.md)); retention-schedule category 8
([`2026-07-26-retention-schedule-draft.md:91`](2026-07-26-retention-schedule-draft.md)).

### 1.1 Purpose test — is there a legitimate interest?

Yes. Keeping a service that children rely on for schoolwork available, correct, and debuggable is a
recognised legitimate interest (Recital 49 addresses network and information security expressly; general
service-reliability interests are accepted in ICO and EDPB practice). The interest is the controller's own,
it is real and present rather than speculative, and it is lawful.

There is also a **third-party and data-subject-side** dimension that strengthens the case: a learner whose
session crashes mid-lesson loses their work. Diagnosing that crash serves the learner directly, not only
ZWIZZLY AS.

### 1.2 Necessity test

Necessary, with a caveat that must be stated honestly.

- Aggregate, subject-free crash counts would tell us *that* something broke but not *which* code path or
  *which* user state produced it. Reproducing a defect in an AI tutoring flow — where behaviour depends on
  the learner's profile, curriculum position, and locale — requires correlating an error to a specific
  session. An opaque `person_id` is the minimum identifier that permits that correlation.
- **The caveat:** the identifier is necessary; the *conversation content* is not, and is actively excluded.
  A denylist of key names known to carry learner free-text is stripped recursively from every captured
  event before transmission (`apps/api/src/services/sentry.ts:101,126-147`), quoted substrings inside error
  messages are redacted (`:169-175`), the `authorization` header is scrubbed independently of
  `sendDefaultPii` (`:184-194`), and URL parameters are handled allowlist-shaped rather than denylist-shaped
  (`:209-221`).
- Less intrusive alternative considered and rejected: **no error monitoring at all.** For a children's
  product this is not a privacy-protective choice — undetected defects in a safety-relevant AI system are
  themselves a risk to the child.

### 1.3 Balancing test

| Factor | Assessment |
|---|---|
| **Nature of the data** | Technical diagnostics plus an opaque person identifier. No conversation content by design. No special-category data intended. |
| **Reasonable expectations** | High. Users of any modern app expect crash reporting. The expectation is weaker for a 13-year-old, which is why the transparency notice must state it in child-readable terms rather than relying on assumed familiarity. |
| **Child-specific weight** | Elevated. Art 6(1)(f) names children explicitly. Mitigation is that the payload is deliberately content-free — the child's *words* are the sensitive asset, and they are excluded. |
| **Intrusiveness / impact** | Low. No decision is taken about the learner on the basis of an error event; it never feeds tutoring, profiling, or assessment. |
| **Residual risk** | The scrubbing is **denylist-based call-site discipline, not a structural guarantee**. The recipient matrix states this plainly ([`2026-07-26-recipient-matrix-draft.md:92-96`](2026-07-26-recipient-matrix-draft.md)): it is evidence of intent to exclude, not proof of zero historical leakage. |
| **Safeguards** | Scrubbing as above; US transfer assessed under Action 10; retention **[OPEN — needs input: Sentry project retention window, a dashboard setting not readable from the repo; retention-schedule row 8 proposes 90 days by convention]**. |

**Conclusion — LIA-1: PASS, conditional.** Legitimate interests is available, conditional on (a) the
transparency notice describing error monitoring in child-readable language, (b) the Sentry retention window
being confirmed and recorded, and (c) accepting that the content-exclusion guarantee is procedural. An
opt-out is not offered and is not proposed: an opt-out from crash reporting would degrade the safety and
correctness of a children's service, and the processing is content-free.

---

## LIA-2 — Service security and abuse prevention

**Processing:** webhook idempotency keys (`webhook_idempotency_keys`, purged at 30 days —
`apps/api/src/inngest/functions/webhook-idempotency-purge.ts:32,44-61`), in-memory per-IP rate limiting on
the unauthenticated consent-response endpoint (`apps/api/src/routes/consent.ts:97,118`), authentication
integrity via Clerk, and the safety-digest aggregate counters
(`packages/database/src/schema/safety-digest.ts:22,45`).

### 2.1 Purpose test

Yes, and this is the strongest of the five. **Recital 49 is explicit**: processing to the extent strictly
necessary and proportionate for ensuring network and information security constitutes a legitimate interest
of the controller. Preventing replayed billing webhooks, brute-forcing of an unauthenticated consent link,
and account takeover are squarely within it.

### 2.2 Necessity test

Necessary and tightly bounded.

- **Webhook idempotency** — storing a key hash is the standard and minimal way to make a payment webhook
  exactly-once. The alternative (processing duplicates) would produce wrong billing outcomes for the payer.
  Keys expire at 30 days, code-verified.
- **Rate limiting** — the consent-response endpoint is reachable by an unauthenticated bearer link
  (`MMT-ADR-0029`; threat posture at
  [`2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`](../2026-07-17-consent-withdrawal-bearer-token-threat-posture.md)).
  Without a rate limit the token space is guessable-in-principle. The implementation is **in-memory,
  per-IP, not persisted across Worker isolate restarts** — the least durable form that still works, which
  is the necessity argument at its strongest and the security argument at its weakest.
- **Safety-digest counters** — aggregate daily buckets, designed not to carry PII
  (retention-schedule row 8). This is a deliberately minimised design.

### 2.3 Balancing test

| Factor | Assessment |
|---|---|
| **Nature of the data** | Idempotency key hashes, IP addresses (transient, in memory), aggregate counts. No conversation content, no learning data. |
| **Reasonable expectations** | Very high. Every data subject expects a paid service to defend itself against fraud and replay. Recital 49 encodes that expectation. |
| **Child-specific weight** | Elevated in principle, but the processing is not *about* the child — it is about the request. A minor's substantive interests are barely engaged. |
| **Intrusiveness** | Very low. Short-lived, non-content, non-profiling. |
| **Safeguards** | 30-day purge on idempotency keys; in-memory-only IP handling; aggregate-by-design safety counters. |

**Conclusion — LIA-2: PASS.** Art 6(1)(f) is the correct basis and no material residual concern arises. No
opt-out is offered or appropriate — a security control a user can disable is not a security control.

---

## LIA-3 — Child-safety tripwire and crisis escalation

**Processing:** a deterministic, intent-shaped input classifier run **before** the LLM call, scoped to three
catastrophic categories — first/second-person self-harm method-seeking or active intent, requests for
sexual content involving a child, and first-person disclosure of physical or sexual abuse by a caregiver
(`apps/api/src/services/safety-tripwire.ts`, header comment lines 3-45). On a hit the system does not refuse
and wall; it escalates to the crisis-redirect path (empathy, trusted adult, helpline) and the caller logs a
structured safety event.

> **This is the LIA with genuine special-category exposure.** A tripwire hit is, almost by definition, an
> inference about a learner's mental health or their status as a victim of abuse — Art 9 territory. The
> Art 9 position document ([`art9-special-category-position.md`](../art9-special-category-position.md))
> asks the DPO to determine which Art 9(2) condition, if any, applies; **Art 6 lawfulness and Art 9
> lifting of the prohibition are cumulative, not alternative**, so a favourable LIA here is necessary but
> not sufficient. See §3.4.

### 3.1 Purpose test

Yes, and it is compelling. The interest is the protection of a child using the service from a foreseeable,
severe harm, in a context where the alternative — an AI system responding to "how do I kill myself" as an
ordinary information request — is indefensible. This is simultaneously a legitimate interest of the
controller (product safety, regulatory exposure, AI Act Art 5 prohibited-practice hygiene) and, more
importantly, an interest **of the data subject and of third parties** (Recital 47 contemplates third-party
interests in the balance).

### 3.2 Necessity test

Necessary, and the design shows the necessity argument was taken seriously.

- The classifier runs on the **input, before the LLM is called**, precisely so that the floor holds even if
  the model is fully jailbroken (`safety-tripwire.ts:38-41`). A model-layer-only safeguard is not equivalent
  protection, because the model layer is the thing that can fail.
- The design explicitly **rejects** the more intrusive and less accurate alternative: "This is NOT a banned-words
  list… every word worth banning is also a word a curious learner asks legitimately" (`:4-14`). A word gate
  would process more, catch less, and break the product's `must_answer` commitment.
- Scope is minimised to three categories, deliberately excluding neglect and grooming as
  "deterministically undetectable" and leaving them to the model layer (`:30-33`) — i.e. the deterministic
  processing stops where its accuracy stops.
- Precision is tuned to near-zero false positives on real curriculum questions, and every pattern carries a
  **negative** assertion in `safety-tripwire.test.ts` proving it does not fire on legitimate learning
  (`:43-45`). This is meaningful: false positives here are themselves a privacy harm (a spurious
  "this child may be self-harming" inference).

### 3.3 Balancing test

| Factor | Assessment |
|---|---|
| **Nature of the data** | An inference about possible self-harm intent, abuse victimhood, or sexual content involving a minor. **Highest sensitivity in the entire system.** |
| **Reasonable expectations** | A child would not expect their words to be scanned — but would, on reflection and if told clearly, expect a mentoring service *not to walk past* a disclosure of abuse. Expectation is therefore carried by transparency, which makes the child-readable notice load-bearing rather than decorative. |
| **Child-specific weight** | Maximum — but pointing *toward* the processing. Art 6(1)(f)'s child clause protects children's interests; here the processing serves them. The clause is not a general prohibition on processing children's data. |
| **Intrusiveness** | Bounded: the detection is deterministic and rule-based, not a profile; it does not persist a "this learner is at risk" characterisation. The Art 9 position document draws exactly this line — discussing a sensitive topic is not the same as creating a sensitive characterisation of the learner ([`art9-special-category-position.md:33-37`](../art9-special-category-position.md)). |
| **Consequence of the hit** | Crisis redirect to the learner. **[OPEN — needs input: whether a tripwire hit produces any guardian-facing notification. Only the aggregate `blocked_safety_digest` counters were traced this pass; if a guardian is notified of an individual hit, that is a disclosure of Art 9-grade inference to a third party and needs its own balancing and its own Art 9 condition.]** |
| **Residual risk** | A false positive produces an unwarranted crisis redirect. Mitigated by precision-first tuning and negative test assertions, not eliminated. |

### 3.4 Conclusion and the Art 9 dependency

**Conclusion — LIA-3: PASS on Art 6(1)(f) for the detection and redirect, with two conditions.**

1. **Art 9 is not answered by this LIA.** If the DPO determines that tripwire inference is Art 9 processing,
   an Art 9(2) condition is required in addition. The candidates worth the DPO's consideration are
   **Art 9(2)(c) vital interests** (available only where the subject is physically or legally incapable of
   giving consent — a poor fit for routine operation, a plausible fit for an acute crisis) and
   **Art 9(2)(g) substantial public interest**, which in Norway requires a national-law basis and is
   therefore a question for Norwegian counsel, not for this draft. This document does **not** propose a
   condition; it records that one is needed. **[OPEN — needs input: Art 9(2) condition determination, DPO/counsel]**
2. **Art 6(1)(d) vital interests** is proposed as an available alternative basis for the *escalation* step in
   a genuine acute crisis, not as the basis for routine screening. Routine screening of every input cannot
   be "necessary to protect vital interests" because at the moment of screening no vital interest is yet
   identified.

A safeguarding procedure — who is told, on what threshold, with what record — is DPO action-register row 5
and remains **[OPEN — needs input: crisis/escalation procedure document]**
([`action-register-tracker.md:25`](../DPO%20exchanges/2026-07-26-action-register-tracker.md)).

---

## LIA-4 — Age- and jurisdiction-assurance audit trail

**Processing:** `knowledge_assertions` — an append-only history of age and residence determinations, each
recording axis, method, confidence, source, and actor (`packages/database/src/schema/identity.ts:809`;
ROPA activity 3, [`ropa.md:50`](../ropa.md)). It is the COPPA actual-knowledge and GDPR Art 8 audit trail,
and the input to the policy engine that bands consent by regime.

> **This LIA is written in the alternative.** The primary basis proposed in the companion matrix is
> **Art 6(1)(c) legal obligation**: Art 8(2) GDPR requires the controller to make "reasonable efforts to
> verify" that consent is given or authorised by the holder of parental responsibility, and a controller
> cannot demonstrate compliance with Art 5(2), Art 7(1), and Art 8(2) without a record of how it decided a
> user's age. The LIA below is the fallback if the DPO considers Art 8(2) too indirect to constitute a
> 6(1)(c) obligation — a defensible view, since 6(1)(c) is usually read as requiring an obligation *external*
> to the GDPR itself.

### 4.1 Purpose test

Yes. Determining whether a user is a child, and under which jurisdiction's self-consent age they fall, is
the precondition for every other lawfulness decision in the system. Without it the controller cannot know
whether it needs parental authorisation, which retention rules apply, or which model-routing exclusions bind
(Gemini is blocked under-18 — `MMT-ADR-0014`). An interest in *being able to comply* is a legitimate
interest.

### 4.2 Necessity test

Necessary, and minimised in a specific and checkable way.

- **Exact date of birth is collected, not a yes/no age gate** — DPIA risk 6.8 records this as the mitigation
  for weak age assurance ([`dpia.md:85`](../dpia.md)). A coarser signal would be less intrusive per-record
  but would defeat the purpose: banded self-consent ages across EEA states (13 in Norway, 15 in others,
  France requiring joint consent at 13–14) cannot be applied from an age band.
- **The raw date does not travel.** It is persisted as `person.birth_date` and the LLM receives only a
  derived age-voice band ([`edpb_dpia_filled_2026_v1.md:208`](../edpb_dpia_filled_2026_v1.md)). The
  minimisation happens at the egress boundary, which is the boundary that matters.
- **Append-only is necessary to the purpose.** A mutable age field would let a later edit destroy the
  evidence of what the controller knew and when — precisely the record Art 8(2) compliance turns on.
  Protection-lowering edits are gated (`data-model.md` §6.2).

### 4.3 Balancing test

| Factor | Assessment |
|---|---|
| **Nature of the data** | Date of birth, residence jurisdiction, determination method and confidence. Ordinary personal data (ROPA states this expressly, [`ropa.md:33-35`](../ropa.md)). |
| **Reasonable expectations** | High. A user who is asked their date of birth at signup expects it to be kept and used for age-appropriate treatment. |
| **Child-specific weight** | Elevated, but again pointing toward the processing: this is the record that *protects* the minor by routing them into the more protective regime. Unknown axes default to most-restrictive ([`dpia.md:44`](../dpia.md)). |
| **Intrusiveness** | Low-moderate. The append-only history means an erroneous entry is never erased, only superseded — a rectification-rights friction worth naming. A data subject exercising Art 16 rectification against an age assertion gets a correcting entry, not a deletion. |
| **Retention** | Life of person; never deleted while the person exists, even when superseded (retention-schedule row 7a, [`2026-07-26-retention-schedule-draft.md:89`](2026-07-26-retention-schedule-draft.md)). Erased by the whole-person cascade. |

**Conclusion — LIA-4: PASS as an alternative basis.** Art 6(1)(c) remains the better primary proposal. If
6(1)(f) is used instead, the Art 16 rectification friction (correction-by-supersession, not erasure) must be
disclosed in the transparency notice, because a data subject who asks for a wrong birth date to be corrected
will find the old value still on file.

---

## LIA-5 — Service and progress notifications

**Processing:** Expo push tokens (device-bound, person-scoped) and notification payloads — nudges, session
reminders, weekly progress summaries — delivered via the Expo push relay to APNs/FCM
(`apps/api/src/services/notifications.ts:59`; ROPA activity 16, [`ropa.md:63`](../ropa.md), which records the
basis as *"to confirm at DPO sign-off"* — this LIA is that confirmation proposal). Preferences are stored in
`notification_preferences` (`packages/database/src/schema/progress.ts:96`) with a delivery log in
`notification_log` (`:156`).

### 5.1 Purpose test — and the split this LIA insists on

The category as currently built mixes two things that should not share a legal basis:

- **(a) Service notifications** — "your session summary is ready", weekly progress for a guardian, account
  and security messages. These are the delivery of the subscribed service.
- **(b) Re-engagement nudges** — messages whose purpose is to bring a lapsed user back.

For **(a)** there is a legitimate interest, and arguably no need for 6(1)(f) at all: informing a subscriber
about their own service is Art 6(1)(b) contract performance.

For **(b)** the legitimate-interest case is materially weaker, and for a **child** it is weak enough that
this draft does not make it. Re-engagement messaging to a 13-year-old is the pattern the UK Children's Code
and the DPIA's own risk 6.5 ("manipulative/pressuring design aimed at a child",
[`dpia.md:82`](../dpia.md)) are designed to constrain. The product position already recorded there — "no
guilt/streak pressure; easy guilt-free exit" — is consistent with treating re-engagement as consent-based.

### 5.2 Necessity test

- For (a): a push token is the only way to deliver an asynchronous notification to a mobile device. There is
  no less intrusive technical route. The token is device-bound and carries no content.
- For (b): not necessary to any contractual purpose by definition — the user is not currently using the
  service.

### 5.3 Balancing test

| Factor | Assessment |
|---|---|
| **Nature of the data** | Push token (pseudonymous device identifier), notification content (templated; the recipient matrix places Expo in the "never conversation content" tier, [`2026-07-26-recipient-matrix-draft.md:90`](2026-07-26-recipient-matrix-draft.md)). |
| **Reasonable expectations** | (a) High. (b) Low for a child; a minor does not expect an app to campaign for their attention. |
| **Child-specific weight** | Decisive for (b). Elevated but manageable for (a). |
| **Existing control** | OS-level push permission is required before any delivery, and in-app preferences exist (`notification_preferences`). **[OPEN — needs input: whether the in-app preference surface separates service notifications from re-engagement nudges; if it does not, a single toggle cannot express the two different bases proposed here. See the consent-screen inventory.]** |
| **ePrivacy** | Push notifications to a terminal device sit near the ePrivacy Directive Art 13 boundary. Norwegian implementation via ekomloven should be checked for direct-marketing characterisation of (b). **[OPEN — needs input: ePrivacy/ekomloven characterisation of re-engagement push, DPO/counsel]** |

**Conclusion — LIA-5: PARTIAL.**
- **(a) Service notifications — PASS**, and the matrix proposes **Art 6(1)(b) contract** as the cleaner
  primary basis, with 6(1)(f) available in the alternative.
- **(b) Re-engagement nudges — FAIL on 6(1)(f) for minors.** This draft proposes **consent** for
  re-engagement messaging to under-18s, and does not take a position on adults beyond noting that 6(1)(f)
  is more defensible there. If product intends to send re-engagement nudges to minors under legitimate
  interests, that decision needs the DPO's explicit sign-off against this conclusion, not silence.

---

## 6. Cross-cutting conclusions

1. **Nothing in the core learning product rides on legitimate interests.** P1 (deliver mentoring), P2
   (learning record), and P2b (declared preferences) are proposed as Art 6(1)(b) contract; P3
   (personalization memory) is consent and is parked. Legitimate interests carries only operational
   purposes. This is deliberate and is the right shape for a children's product — it means a data subject
   never has to exercise an Art 21 objection to stop the processing that actually concerns them, because
   that processing is either contract-necessary or consent-based and withdrawable.
2. **Art 21 right to object applies to every purpose in this document** and must appear in the transparency
   notice, brought to the data subject's attention explicitly and separately (Art 21(4)). For LIA-1 through
   LIA-4 the controller's expected response to an objection is that compelling legitimate grounds override
   it (security, safeguarding, and age-assurance cannot be disabled per-user); for LIA-5(a) an objection is
   honoured through the notification preferences. **That asymmetry must be stated in the notice rather than
   discovered by a user whose objection is refused.**
3. **The weakest link is not a balancing test — it is transparency.** Four of the five assessments lean on
   the data subject having been told, in child-readable language, what happens. DPO action-register row 13
   (transparency package + Art 35(9) comprehension testing) is therefore a dependency of this document, not
   a parallel workstream.

---

## 7. Open items

| ID | Open item | Owner |
|---|---|---|
| LIA-O1 | Sentry project retention window — a dashboard setting, not readable from the repo | Engineering / infra |
| LIA-O2 | Whether an individual safety-tripwire hit produces any guardian-facing notification | Engineering |
| LIA-O3 | Art 9(2) condition determination for tripwire inference (LIA-3 is necessary but not sufficient) | DPO / counsel |
| LIA-O4 | Crisis/escalation safeguarding procedure document (action-register row 5) | Zuzana + DPO |
| LIA-O5 | Whether notification preferences separate service notifications from re-engagement nudges | Engineering / product |
| LIA-O6 | ePrivacy / ekomloven characterisation of re-engagement push to minors | DPO / counsel |
| LIA-O7 | DPO ruling on LIA-4 primary basis: Art 6(1)(c) legal obligation vs Art 6(1)(f) | DPO |

---

**Prepared:** 2026-07-30, agent-drafted from code and existing compliance artifacts. Every product claim
carries a `file:line` citation. Legal-basis assignments are **proposals for DPO review**, not determinations.
