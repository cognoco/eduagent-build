# Record of Processing Activities (ROPA)

**Checklist item:** A3 · **Law:** GDPR Article 30 · **Status:** DRAFT for DPO sign-off.
**Controller:** `[legal entity name — TODO]`, established in Norway. **DPO:** `[dpo@… — TODO]`.

> **Launch substrate = the identity-foundation architecture — BUILT AND LIVE (status updated 2026-07-10).** This register describes processing on the identity-foundation schema, which is **no longer a ratified design — it is the production system**: `resolveIdentityV2` runs unconditionally for every authenticated request (`apps/api/src/middleware/account.ts:146-147`); the legacy `accounts`/`profiles`/`family_links` tables are **dropped** on the staging and production databases (live-query verified 2026-06-28). Design rationale: [`_wip/identity-foundation/data-model.md`](../../_wip/identity-foundation/data-model.md) (`MMT-ADR-0011`/`0012`; amendments `0013`–`0015`). Built-state verification: [`2026-07-04-launch-compliance-closure-check-early-pass.md`](2026-07-04-launch-compliance-closure-check-early-pass.md).

> A ROPA is the internal register of *what personal data we hold, why, who else touches it, and how long we keep it.* It is not published; you show it to Datatilsynet on request. Keep it current.

## Data subjects (target identity model)

The legacy "account owner" concept dissolves into a **`person`** (the human, the learning-data scope key) wearing one or more capability hats (`data-model.md` §2A.4):

| Category | In the model | Notes |
|---|---|---|
| **Person — Subscription-administrator** (`admin` role) | `membership.roles = {admin}` + Payer field | Billing + profile-management authority; an adult. Replaces "owner". |
| **Person — learner** (`learner` role) | `membership.roles = {learner}` | The studying human, any supported age. |
| **Guardian** (consent authority only) | `guardianship` edge | Consent authority over a charge; **not** billing or data-access. |
| **Mentor** (data access only) | `mentorship` edge | Opt-in; data-access only, never auto-conferred. |
| **Payer** (billing only) | `subscription.payer_person_id` + `subscription_payers` | Primary + ≤1 secondary; access-inert. |

Age posture (per `data-model.md` §2A.5 + ROADMAP age-floor thread): **13+ consent-capacity floor at launch; sub-13 built but front-end-gated; US sub-13 excluded** (keeps COPPA dormant). One human may wear all hats (the "full parent").

## Special categories

**None.** No Art 9 health/disability data is processed — see [`art9-special-category-decision.md`](art9-special-category-decision.md). `person.birth_date` and the `knowledge_assertions` age/residence history are ordinary personal data (processed for lawful age/regime gating).

## Legal bases

- **Consent (Art 6(1)(a))** — a minor's learning data / profiling. Recorded as `consent_grant.lawful_basis` (append-only event log; `data-model.md` §4.8). Teen consents where self-consent applies; Guardian where it does not (`guardianship` edge).
- **Contract (Art 6(1)(b))** — account provision + billing to the adult administrator/payer.
- **Legal obligation (Art 6(1)(c))** — retained billing/tax + the surviving `consent_receipt` (`person_retain`).
- **Legitimate interests (Art 6(1)(f))** — security, abuse prevention, error monitoring (balanced against minors; highest-privacy defaults per A15).

## Processing activities (target schema)

| # | Activity | Personal data (target tables) | Purpose | Legal basis | Recipients / processors | Transfer | Retention |
|---|---|---|---|---|---|---|---|
| 1 | **Login identity** | `login`: `clerk_user_id`, `email`, `person_id` | Authentication | Contract; Consent | **Clerk** (auth only, `MMT-ADR-0001`) | US (A12) | Life of person; **external Clerk identity erased on deletion** — implemented (`apps/api/src/inngest/functions/account-deletion.ts:202`, code-verified 2026-07-04) |
| 2 | **Person record** | `person`: `display_name`, `birth_date`, `residence_jurisdiction`, pronouns, language, interests, `age_knowing`/`residence_knowing` cache | Provide tutoring; personalisation; the learning-data scope key | Consent; Contract | Neon (DB), Cloudflare (compute) | US/EEA per host | Life of person; drops on person-delete |
| 3 | **Knowledge assertions** (age/residence) | `knowledge_assertions`: axis, method, confidence, source, actor | Lawful age/regime gating; **COPPA actual-knowledge / Art 8 audit trail** | Legal obligation; Legitimate interests | Neon | — | Append-only audit history |
| 4 | **Consent (event log)** | `consent_grant`: charge×purpose×org, `lawful_basis`, assurance token, at-grant age/jurisdiction snapshot | Prove valid, purpose-specific consent (A9) | Consent; Legal obligation | Neon | — | Live grant drops on delete; **`consent_receipt` survives** in `person_retain` (the I-C1 structural fix) |
| 5 | **Consent authority / mentor edges** | `guardianship`, `mentorship`: qualification, granted/revoked timestamps | Consent authority; opt-in data access | Consent; Legitimate interests | Neon | — | History preserved (partial-unique on revoke) |
| 6 | **Learning sessions & transcripts** | `learning_sessions`, `session_events` (scoped `person_id`) | Deliver the tutoring conversation | Consent | LLM provider(s) via the router; Neon *(minors' names never in prompts; adult first name disclosed — DPIA §4 A13)* | US (LLM) | **Raw transcript purged at 30 days** (`RETENTION_PURGE_ENABLED=true`, verified 2026-06-08) |
| 7 | **Persistent learning memory** | mastery, misconceptions, `session_summaries`, `memory_facts`, `topic_notes`, challenge-round quotes (scoped `person_id`) | "The mentor remembers" — teaching continuity | Consent | Neon | — | Life of person / dormancy expiry (A24). ⚠ verbatim quotes survive the 30-day purge — age-out tracked A24-b |
| 8 | **Assessments / quizzes / vocabulary / progress** | answers, scores, mastery, vocab, reports, streaks, XP (scoped `person_id`) | Track + adapt learning | Consent | LLM provider(s); Neon | US (LLM) | Life of person; drops on person-delete |
| 9 | **Semantic embeddings** | vectors from session summaries | Memory recall | Consent | **Voyage AI**; Neon (pgvector) | US | Rebuilt on purge; life of person |
| 10 | **Billing & subscriptions** | `subscription` (org-anchored), `subscription_payers`, `payer_person_id`, store identifiers | Paid plan; quota | Contract | **RevenueCat** + Apple / Google | US | Survives person-delete via `person_retain.financial_record`; per tax window |
| 11 | **Transactional email** | email, message content | Account/security/consent emails | Contract; Legal obligation | **Resend** | US | Per provider DPA |
| 12 | **Error & performance monitoring** | error events, may include `person_id` | Reliability | Legitimate interests | **Sentry** | US | Per Sentry retention; scrub PII (`tech-sentry-scrubbing`) |
| 13 | **Background jobs / events** | payloads (`person_id`, org id) | Durable async (the unified daily sweep, deletion, purge, reports — `MMT-ADR-0009`) | Contract; Consent | **Inngest** | US | Per Inngest DPA |
| 14 | **Deletion audit** | `person_retain.deletion_audit`: who/when/why deleted | Prove lawful erasure | Legal obligation | Neon | — | Retain-tier; `retention_period` seam (counsel fills) |
| 15 | **BYOK waitlist** *(if live)* | `byok_waitlist`: email only | Waitlist | Consent | Neon | — | **Not in the identity carve-out** — explicit erasure implemented in the delete flow (`deletion-v2.ts:543`, code-verified 2026-07-04) |

## Policy-engine tables (mostly NOT personal data — recorded for completeness)

- `regimes`, `policy_cells`, `policy_rules` — **policy content, not personal data** (DB-mastered compliance matrix; `MMT-ADR-0013`).
- `allowed_models` — **vendor-vetting output, not personal data** (`MMT-ADR-0014`; the only contract between vetting and routing). The router reads it to enforce the Gemini-under-18 exclusion etc.

## Sub-processors (infrastructure)

- **Neon** (DB hosting), **Cloudflare Workers** (API compute).
- Each named recipient (Clerk, Voyage, RevenueCat, Resend, Sentry, Inngest, LLM provider(s)) is a **processor** requiring a signed DPA on a business/enterprise tier (A11) and a US-transfer check (A12).

## Known open items (also tracked in the DPIA)

- **Erasure design (structural, by construction):** target deletion is **re-home-then-delete** — `consent_grant` → `consent_receipt`, write `deletion_audit`, create `financial_record`, then drop `person` + learning data (`data-model.md` §6.1). `consent_grant.charge_person_id ON DELETE RESTRICT` forces the re-home first. This **closes the legacy I-C1 receipt-destruction defect by design** — but only once built.
- **BYOK erasure** must be wired into the new delete flow (`byok_waitlist` is outside the identity model — no cascade).
- **Retention *values*** — the `person_retain.*.retention_period` columns are seams; **counsel fills the values** (open).
- **A24-b:** verbatim learner quotes survive the 30-day purge — age-out is post-launch tightening.
- **LLM routing:** Gemini **blocked** for this app (under-18 terms); enforced via `allowed_models` (`MMT-ADR-0014` supersedes "Family standard = Gemini-only").

---

**Sign-off:** DPO. ☐ Adopted · Name: ____________ · Date: ________ · Review when data categories/processors change.
