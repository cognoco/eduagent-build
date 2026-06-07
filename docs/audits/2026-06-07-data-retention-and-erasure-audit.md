# Data Retention & Erasure — Code-Verified Audit

**Date:** 2026-06-07
**Trigger:** Compliance question — "the mentor remembers what the student has learned, and chat transcripts are kept for 30 days. Is the surviving learning memory a GDPR problem?"
**Method:** Source-of-truth code audit (DB schema FK behaviour + deletion flows + purge cron), not policy-doc reading. All claims carry `file:line`.
**Status:** Findings recorded. Three are documentation items (folded into `docs/meetings/minors-compliance-requirements.md` → A24). Three are open engineering/verification items (R1, R2, R3 below).
**Feeds:** the DPIA (`E5` launch gate — the GDPR Art 35 risk assessment that must exist before first child use) and the ROPA (A3).

---

## TL;DR for the non-coder

1. **The scary version is not true.** Deleting your account *does* wipe the learning memory — assessments, notes, mastery state, extracted facts, everything. It is a clean database-level cascade, not a half-job. (Section 1.)
2. **But three things survive account deletion** that shouldn't, or need a documented reason to: your **login identity at Clerk** (the auth provider — never deleted in-app), an orphaned **organisation row**, and any **BYOK waitlist email**. The Clerk one is a real erasure gap. (Section 2.)
3. **The subtle version IS true.** "We delete chat transcripts after 30 days" only deletes the *raw turn-by-turn log*. Word-for-word fragments of what the learner typed survive **indefinitely** in notes, session summaries, extracted facts, and challenge-round evidence. So "we delete your chats" is, as written, **misleading**. (Section 3.)
4. **The 30-day deletion may not even be running.** It is behind an environment flag (`RETENTION_PURGE_ENABLED`) that defaults OFF and is not in any committed config. If it isn't set in production, transcripts are kept **forever**, not 30 days — directly contradicting the notice. **This must be checked in production before launch.** (Section 4.)
5. **The published privacy policy is stale and internally inconsistent** with the code (says 30-day account-deletion grace; code does 7 days; says ages 11–15; never mentions the transcript purge). (Section 5.)

The architecture (throw away the bulky raw log, keep a lean derived summary) is the *correct* privacy-by-design move. The exposure is in the edges and the notice, not the design.

---

## 1. Account deletion — the erasure cascade (the good news)

**Entry:** `POST /account/delete` → `apps/api/src/routes/account.ts:81-144`. Owner-only (`assertOwnerProfile`, line 87). Sets `accounts.deletion_scheduled_at` and dispatches `app/account.deletion-scheduled`; the DB write is rolled back if the Inngest dispatch fails (`deletion.ts` `scheduleDeletion` / `cancelDeletion`).

**Durable job:** `scheduledDeletion` → `apps/api/src/inngest/functions/account-deletion.ts:9-74`. `step.sleep('grace-period', '7d')` → cancellation check → `executeDeletion(db, accountId)` (`apps/api/src/services/deletion.ts:214-277`).

**The actual erasure** is a single atomic `DELETE FROM accounts WHERE id = ?`. Everything else falls via foreign-key cascade. The load-bearing line:

> `profiles.account_id → accounts.id` **ON DELETE CASCADE** — `packages/database/src/schema/profiles.ts:77-79`

and every learner-data table carries `profile_id → profiles.id ON DELETE CASCADE`. So one row delete wipes the whole tree. **~55 tables** were confirmed CASCADE-deleted, including every layer of the "learning memory":

- `assessments` (incl. `mastery_challenge_verified_at`), `retention_cards`, `needs_deepening_topics`
- `learning_sessions` (incl. the `metadata` JSONB that holds `challengeRound.evaluations[].learnerQuote`), `session_events`, `session_summaries`, `session_embeddings`, `parking_lot_items`
- `topic_notes`, `learning_profiles` (interests/struggles/communication notes), `memory_facts`, `memory_dedup_decisions`
- curriculum tree (`subjects → curricula → curriculum_books → curriculum_topics`), `vocabulary`, `quiz_*`, `dictation_results`, progress/report/streak/xp tables

**Verdict on the original worry (does erasure reach the memory?):** **REFUTED for in-database learner data.** The cascade is comprehensive and well-designed. The consent-withdrawal path (`consent-revocation.ts` → `deleteProfile` → same FK cascade) and the 30-day post-withdrawal `archive-cleanup.ts` work the same way.

---

## 2. What survives account deletion (the gaps)

| Survivor | Where | Why it survives | Severity |
|---|---|---|---|
| **Clerk login identity** | auth provider (external) | There is **no `clerk.users.deleteUser()` call anywhere in the codebase**. The DB row referencing `clerk_user_id` is deleted, but the Clerk-side user (email, auth credentials) is not. | **HIGH** — a real Art 17 (right to erasure) gap. Personal data (email) persists at a processor after the user asked to be deleted. |
| **`organizations` row** + `organization_invitations` | `packages/database/src/schema/profiles.ts:145-163` | `organizations` reuses `accounts.id` as its PK *by convention* but has **no FK** to `accounts`, so no cascade. Identity `T1` artifact (stage-1 identity migration). | MEDIUM — only PII if org name / invitation email embeds personal data. Confirm whether populated in production. |
| **`byok_waitlist` email** | `packages/database/src/schema/billing.ts:255-263` | Email-only table, no profile/account FK. | MEDIUM — bare email survives erasure. Needs an explicit erase-on-request path. |
| **Inngest event history** | external processor | Event payloads (`accountId`, `profileIds`) live on Inngest per their retention. | LOW/MEDIUM — covered by the Inngest DPA + their retention; note in ROPA. |

→ **R1 (open):** Wire a Clerk user-delete into `executeDeletion` (and the consent-withdrawal `deleteProfile` path where the deleted profile owns the Clerk identity). Add a **break test** (security-fix rule): attempt deletion, assert the Clerk user is gone.
→ **R3 (open):** Decide erase/anonymise behaviour for the orphaned `organizations` row and `byok_waitlist` email; fold both into the deletion job or a periodic sweep.

---

## 3. What survives the 30-day transcript purge — verbatim learner content (the misleading-notice exposure)

**What the purge actually does** — `purgeSessionTranscript()` (`apps/api/src/services/transcript-purge.ts:133-198`), fanned out by the daily cron `transcript-purge-cron.ts` (`cron: '0 5 * * *'`), eligibility = summary written ≥ 30 days ago:

- `DELETE FROM session_events` (the raw turn-by-turn chat) — **this is the only thing actually deleted.**
- Stamps `session_summaries.purged_at` (the summary **row is kept**).
- Re-embeds: deletes the old `session_embeddings` vector and writes a **new one built from `llmSummary` + `learnerRecap` text** (`transcript-purge.ts:26-37`).

Everything *derived* from the conversation is untouched by the 30-day clock and persists for the life of the account. Confirmed verbatim/near-verbatim survivors:

| Surviving content | Table.column | File:line | Note |
|---|---|---|---|
| **Verbatim learner answer**, per challenge concept | `learning_sessions.metadata` JSONB → `challengeRound.evaluations[].learnerQuote` | schema `packages/schemas/src/sessions.ts:173`; write `session-exchange.ts:586-597` | `learnerQuote` is **overwritten with the real `session_events.content`** at `evaluation.ts:112-124` — it is the exact text the learner typed. No purge of this JSONB. |
| Note body (LLM-drafted from `solidAnswerQuotes`, then learner-edited) | `topic_notes.content` | schema `notes.ts:23`; insert `notes.ts:207` | No aging-out. Draft is validated to ≥40% lexical overlap with the learner's quotes, so it carries their wording. |
| Learner's self-written summary | `session_summaries.content` | `sessions.ts:252` | Kept indefinitely. |
| LLM recap of the session | `session_summaries.learnerRecap`, `.narrative`, `.highlight`, `.aiFeedback`, `.closingLine` | `sessions.ts:255-259` | Required non-null *before* purge is allowed; survives the purge. `learnerRecap` is also baked into the replacement `session_embeddings.content`. |
| LLM-extracted facts about the learner | `memory_facts.text` | `memory-facts.ts:22` | Soft-delete only (superseded pointer); no hard delete, no age-out. |
| LLM-characterised misconception | `needs_deepening_topics.misconception` / `.correction` | `assessments.ts:184-185` | Status flips to `resolved` but the **row is deliberately never deleted** (audit-trail comment, `promotion.ts:84`). |
| Parked questions | `parking_lot_items.question` | `sessions.ts:321` | No age-out. |

**Verdict:** **CONFIRMED.** A user told "we delete your chat transcripts after 30 days" is not told that their word-for-word answers persist indefinitely in `learning_sessions.metadata`, `topic_notes.content`, and the `session_summaries` fields. The *raw log* is deleted; the *content* is not. For a children's product this is the highest-likelihood unfair/misleading-processing finding because it sounds clean but isn't.

→ **Remediation (chosen path — recommended in A24):**
- **Now (path a):** make the notice accurate — say plainly that a learning summary is retained and *may include short quotes from the learner's answers*. Cheapest, preserves product value, removes the "misleading" character immediately.
- **Fast-follow (path b):** age-out / abstract the verbatim fields on the same 30-day clock so only non-reconstructible state ("mastered photosynthesis") survives. Strongest minimisation story for minors; more engineering (a second purge pass over `learning_sessions.metadata.challengeRound`, plus a decision on `topic_notes`/`memory_facts`/`needs_deepening_topics`).

---

## 4. The 30-day purge may not be running — R2 (open, verify in production)

The cron short-circuits unless `RETENTION_PURGE_ENABLED === 'true'` (`apps/api/src/inngest/helpers.ts:258-262`, gate read in `transcript-purge-cron.ts:29`). This flag is **absent from `.env.example`, `wrangler.toml`, and the dev local env** — so it **defaults to disabled**. The functions are correctly registered for production (`apps/api/src/inngest/index.ts:251-253`, not dead code), but if the flag is not explicitly set in the production Worker environment (Doppler / Worker secret), **no transcript is ever deleted** and the "30 days" claim is false in the most consequential direction.

→ **R2 (open, BLOCKING for the notice's truth):** Confirm `RETENTION_PURGE_ENABLED=true` is set in the **production** Doppler config, and confirm the cron has actually run (check Inngest run history for `transcript-purge-cron`). Until verified, treat "transcripts kept 30 days" as **unproven**. Add the flag to committed config docs so its required-in-prod status is visible.

---

## 5. Privacy-notice mismatches (input to the A5 privacy-policy rewrite)

`docs/privacy-policy.html` (dated March 2026) is stale against the code:

- **§7 says account-deletion grace is "30-day"; the code sleeps 7 days** (`account-deletion.ts`). Notice over-promises a longer cancellation window than exists. (§4's "7-day" consent-withdrawal grace *does* match the code.)
- Says "children aged **11–15**" — the age floor is now 13+ (per the 2026-06-04 minutes); 11–15 is wrong on both ends.
- **Never mentions the 30-day transcript purge tier** at all.
- Names no DPO (A2), no UK representative (A6).

The authoritative retention design lives in `docs/_archive/specs/Done/2026-05-05-tiered-conversation-retention.md` (archived, marked Done) — but it deliberately does **not** cover the persistent `learning_profiles` / `memory_facts` / `topic_notes` layer, which is exactly the layer with no documented retention rule today. That gap is the substance of A24.

---

## Open items register

| ID | Item | Owner | Severity | Blocks launch? |
|---|---|---|---|---|
| **R1** | Wire Clerk user-delete into `executeDeletion` + consent-withdrawal path; add break test | eng | HIGH | Yes (Art 17 erasure completeness) |
| **R2** | Verify `RETENTION_PURGE_ENABLED=true` in production + cron has run; commit the flag to config docs | eng/ops | HIGH | Yes (makes the "30-day" notice true or false) |
| **R3** | Erase/anonymise orphaned `organizations` row + `byok_waitlist` email on account deletion | eng | MEDIUM | DPIA-tracked |
| **A24-a** | Make the privacy notice accurate about retained quotes (and fix §7 7-vs-30-day, age range, transcript-purge mention) | DPO + eng | — | Part of A5 |
| **A24-b** | Age-out / abstract verbatim fields on the 30-day clock (fast-follow) | eng | — | No (post-launch tightening) |
| — | Add learning-memory retention period + proportionality + purpose-fence to the DPIA | DPO | — | Yes (A1 content) |

See `docs/meetings/minors-compliance-requirements.md` → **A24** for the GDPR analysis (storage limitation, proportionality, purpose limitation) these items implement.
