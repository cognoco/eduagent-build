# Record of Processing Activities (ROPA)

**Checklist item:** A3 · **Law:** GDPR Article 30 · **Status:** DRAFT for DPO sign-off.
**Controller:** `[legal entity name — TODO]`, established in Norway. **DPO:** `[dpo@… — TODO]`.
**Source of truth for data flows:** [`docs/audit/2026-06-07-data-retention-and-erasure-audit.md`](../audit/2026-06-07-data-retention-and-erasure-audit.md) (code-verified).

> A ROPA is the internal register of *what personal data we hold, why, who else touches it, and how long we keep it.* It is not published; you show it to Datatilsynet on request. Keep it current — update it whenever a new data category, processor, or purpose is added.

## Data subjects

| Category | Notes |
|---|---|
| **Adult account owners (18+)** | The paying/owning user. |
| **Self-consenting teens (13+ at/above local consent age)** | Norway/UK 13; Spain 14; France 15; DE/NL/IE 16. |
| **Non-self-consenting teens (13–15 below local consent age)** | Require parent/guardian authorization (A8). |
| *(Future, non-US only)* **Children 10–12** | Dormant until the 10+ phase; lighter GDPR parental authorization, **US under-13 blocked** to keep COPPA dormant. |

## Special categories

**None.** No Art 9 health/disability data is processed — see [`art9-special-category-decision.md`](art9-special-category-decision.md). Date of birth is processed (for age-gating), which is ordinary personal data.

## Legal bases

- **Consent (Art 6(1)(a))** — for processing a minor's learning data / profiling (A9: regulators reject "contract" as the basis for personalisation). The teen consents where self-consent applies; the parent/guardian where it does not.
- **Contract (Art 6(1)(b))** — account provision and billing to the adult owner.
- **Legal obligation (Art 6(1)(c))** — retention of minimal billing/tax and consent-receipt records.
- **Legitimate interests (Art 6(1)(f))** — security, fraud/abuse prevention, error monitoring (balanced against minors' rights; highest-privacy defaults per A15).

## Processing activities

| # | Activity | Personal data | Purpose | Legal basis | Recipients / processors | Transfer | Retention |
|---|---|---|---|---|---|---|---|
| 1 | **Account & login identity** | Email, auth credentials, `clerk_user_id` | Authentication, account ownership | Contract; Consent (minor) | **Clerk** (auth) | US (see A12 check) | Life of account; **Clerk identity erased on deletion** (fixed 2026-06-08, commit `9137c7961`) |
| 2 | **Profile & onboarding** | Display name, date of birth, country/residence, pronouns, conversation language, interests | Provide tutoring; age/consent gating; personalisation | Consent; Contract | Neon (DB host), Cloudflare (compute) | US/EEA per host | Life of account; FK-cascade delete |
| 3 | **Consent records** | Who consented, when, to what, policy version, age/country snapshot | Prove valid consent (A9) | Legal obligation; Consent | Neon | — | Kept as audit evidence; minimised |
| 4 | **Learning sessions & transcripts** | Turn-by-turn chat content (`session_events`), session metadata | Deliver the tutoring conversation | Consent | LLM provider(s); Neon | US (LLM) | **Raw transcript purged at 30 days** (`RETENTION_PURGE_ENABLED=true` in prod — verified 2026-06-08) |
| 5 | **Persistent learning memory** | Mastery state, misconceptions, session summaries, LLM-extracted facts, topic notes, challenge-round answer quotes | "The mentor remembers" — teaching continuity | Consent | Neon | — | **Life of account / dormancy expiry** (A24). ⚠ verbatim quotes currently survive the 30-day purge — age-out tracked as A24-b |
| 6 | **Assessments, quizzes, vocabulary, dictation** | Answers, scores, mastery, vocab lists | Track and adapt learning | Consent | LLM provider(s); Neon | US (LLM) | Life of account; FK-cascade delete |
| 7 | **Progress, reports, streaks, XP** | Aggregated performance metrics | Show progress to learner/guardian | Consent | Neon | — | Life of account |
| 8 | **Semantic embeddings** | Vectors derived from session summaries | Memory recall / search | Consent | **Voyage AI** (embeddings); Neon (pgvector) | US | Rebuilt on purge; life of account |
| 9 | **Billing & subscriptions** | Purchase/subscription state, store identifiers | Provide paid plan; quota | Contract | **RevenueCat** + Apple App Store / Google Play | US | Per billing/tax retention; minimal |
| 10 | **Transactional email** | Email address, message content | Account/security/consent emails | Contract; Legal obligation | **Resend** | US | Per provider retention (DPA) |
| 11 | **Error & performance monitoring** | Error events, may include `accountId`/`profileId` | Reliability, debugging | Legitimate interests | **Sentry** | US | Per Sentry retention; scrub PII (see `tech-sentry-scrubbing`) |
| 12 | **Background jobs / events** | Event payloads (`accountId`, `profileIds`) | Durable async work (deletion, purge, reports) | Contract; Consent | **Inngest** | US | Per Inngest retention (DPA) — note in breach plan |
| 13 | **BYOK waitlist** *(if live)* | Email only | Waitlist | Consent | Neon | — | **Erased on account deletion** (wired in `executeDeletion`, break-tested, 2026-06-08, R3a) |

## Sub-processors (infrastructure)

- **Neon** — Postgres database hosting.
- **Cloudflare Workers** — API compute.
- Each of the named recipients above (Clerk, Voyage, RevenueCat, Resend, Sentry, Inngest, LLM provider(s)) is a **processor** requiring a signed DPA on a business/enterprise tier (A11) and a US-transfer check (A12).

## Known open items (also tracked in the DPIA)

- **R3a (done):** `byok_waitlist` email now erased on account deletion (`executeDeletion`, break-tested 2026-06-08).
- **R3b (open):** the `organizations` row carries the owner's display-name (T1 backfill) and survives deletion — to be dropped by the ratified T1 revert, or erased explicitly if the revert slips past launch.
- **A24-b:** verbatim learner quotes survive the 30-day transcript purge — age-out/abstraction is post-launch tightening.
- **LLM provider routing:** Gemini is **blocked** for this app (under-18 terms restriction — see compliance A11 note); routing must use a provider/route whose terms permit a minor-facing app with no-training + retention controls.

---

**Sign-off:** DPO. ☐ Adopted · Name: ____________ · Date: ________ · Review when data categories/processors change.
