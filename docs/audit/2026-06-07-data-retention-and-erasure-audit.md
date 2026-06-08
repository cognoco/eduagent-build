# Data Retention & Erasure — Code-Verified Audit

**Date:** 2026-06-07
**Trigger:** Compliance question — "the mentor remembers what the student has learned, and chat transcripts are kept for 30 days. Is the surviving learning memory a GDPR problem?"
**Method:** Source-of-truth code audit (DB schema FK behaviour + deletion flows + purge cron), not policy-doc reading. All claims carry `file:line`.
**Status:** Findings recorded. Documentation items folded into `docs/meetings/minors-compliance-requirements.md` → A24. Of the engineering/verification items: **R1 (Clerk erasure), R2 (purge flag), and A24-a (privacy-policy rewrite) are RESOLVED 2026-06-08** (commits `9137c7961` + docs). **R3 (orphaned org row / BYOK email) and A24-b (verbatim age-out) remain open.**
**Feeds:** the DPIA (`E5` launch gate — the GDPR Art 35 risk assessment that must exist before first child use) and the ROPA (A3).

---

## TL;DR for the non-coder

1. **The scary version is not true.** Deleting your account *does* wipe the learning memory — assessments, notes, mastery state, extracted facts, everything. It is a clean database-level cascade, not a half-job. (Section 1.)
2. **The Clerk login-identity erasure gap is now FIXED** (2026-06-08, commit `9137c7961`): account deletion now erases the external Clerk login (email/credentials) after the DB cascade. Two lesser survivors remain to handle: an orphaned **organisation row** and any **BYOK waitlist email** (R3). (Section 2.)
3. **The subtle version IS true.** "We delete chat transcripts after 30 days" only deletes the *raw turn-by-turn log*. Word-for-word fragments of what the learner typed survive **indefinitely** in notes, session summaries, extracted facts, and challenge-round evidence. So "we delete your chats" is, as written, **misleading**. (Section 3.)
4. **The 30-day deletion IS running in production** (verified 2026-06-08). It is behind an environment flag (`RETENTION_PURGE_ENABLED`) that defaults OFF and is in no committed config — so it *looked* at-risk — but the flag is confirmed set to `true` in prod Doppler, so transcripts do purge at 30 days. Still add the flag to committed config docs so its required-in-prod status is visible and can't silently regress. (Section 4.)
5. **The published privacy policy has been rewritten** (2026-06-08) to match the code: account-deletion grace corrected 30→7 days, "ages 11–15" removed (now age-neutral, min-age 13), and it now discloses the 30-day transcript purge, the persistent learning memory, the purpose-fence, and international transfers. A pre-publish TODO still flags the DPO name, registered address, and EU/UK representative. (Section 5.)

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
| **Clerk login identity** | auth provider (external) | ~~No `clerk.users.deleteUser()` call anywhere in the codebase.~~ **FIXED 2026-06-08 (commit `9137c7961`):** `deleteClerkUser()` (`services/clerk-user.ts`) now issues `DELETE /v1/users/{id}`; the scheduled-deletion Inngest job calls it after the DB cascade confirms `'deleted'`. | ~~**HIGH** — real Art 17 gap~~ → **resolved**. |
| **`organizations` row** + `organization_invitations` | `packages/database/src/schema/profiles.ts:145-163` | `organizations` reuses `accounts.id` as its PK *by convention* but has **no FK** to `accounts`, so no cascade. Identity `T1` artifact (stage-1 identity migration). | MEDIUM — only PII if org name / invitation email embeds personal data. Confirm whether populated in production. |
| **`byok_waitlist` email** | `packages/database/src/schema/billing.ts:255-263` | Email-only table, no profile/account FK. | MEDIUM — bare email survives erasure. Needs an explicit erase-on-request path. |
| **Inngest event history** | external processor | Event payloads (`accountId`, `profileIds`) live on Inngest per their retention. | LOW/MEDIUM — covered by the Inngest DPA + their retention; note in ROPA. |

→ **R1 (RESOLVED 2026-06-08, commit `9137c7961`):** Clerk user-delete wired into the scheduled-deletion Inngest job (capture `clerk_user_id` before the cascade → erase after a confirmed `'deleted'`). Break test verified red→green at the service layer (`clerk-user.test.ts`: DELETE issued, 404 idempotent, throws-not-skips on error/missing-secret) and the orchestration layer (`account-deletion.test.ts`: erases with captured id on `'deleted'`, never on `'cancelled'`/`'already_deleted'`/null-credential). The consent-withdrawal path needed no change — it deletes only child profiles (managed persons, `clerk_user_id = null`, no login to erase).
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

## 4. The 30-day purge — running in production (R2 RESOLVED 2026-06-08)

The cron short-circuits unless `RETENTION_PURGE_ENABLED === 'true'` (`apps/api/src/inngest/helpers.ts:258-262`, gate read in `transcript-purge-cron.ts:29`). The flag was **absent from `.env.example`** and so **defaults to disabled**, which made the "30 days" claim *look* unproven. The functions are correctly registered for production (`apps/api/src/inngest/index.ts:251-253`, not dead code).

→ **R2 (RESOLVED 2026-06-08):** `RETENTION_PURGE_ENABLED=true` is **confirmed set in the production Doppler config** (user-verified). The purge therefore runs daily in prod and the "transcripts kept 30 days" claim is backed by a live deletion job. **Residual hardening — also DONE 2026-06-08:** the flag is now documented in `.env.example` (new "DATA RETENTION" section) with an explicit "required `true` in prod / do not regress" note, so its required-in-prod status is visible in committed config. Nice-to-have remaining: glance at the Inngest run history for `transcript-purge-cron` to confirm purge events have fired (expected few/none pre-launch with no real session volume).

---

## 5. Privacy-notice mismatches (RESOLVED 2026-06-08 — A5 privacy-policy rewrite done)

> **Resolved 2026-06-08.** `docs/privacy-policy.html` rewritten (now dated June 2026). Every mismatch below is fixed; the remaining unknowns (DPO name, registered address, EU/UK Art 27 representative, final age-floor confirmation) are flagged in an HTML `PRE-PUBLISH TODO` comment in the file so the doc cannot ship to production with them unresolved. The list below is retained as the record of what was wrong.

The old `docs/privacy-policy.html` (dated March 2026) was stale against the code:

- **§7 said account-deletion grace is "30-day"; the code sleeps 7 days** (`account-deletion.ts`). Notice over-promised a longer cancellation window than exists. (§4's "7-day" consent-withdrawal grace *did* match the code.) → **fixed**: now states 7 days.
- Said "children aged **11–15**" — wrong on both ends. → **fixed**: removed; now age-neutral with a min-age-13 statement and jurisdictional consent bands.
- **Never mentioned the 30-day transcript purge tier**, the persistent learning memory, or the purpose-fence. → **fixed**: new §8 (Data Retention) covers all three; new §7 covers international transfers.
- Named no DPO (A2), no UK representative (A6). → **partially fixed**: a DPO contact email + named controller are present; the DPO *name* and the EU/UK representative remain in the pre-publish TODO (A2/A6 still owed before launch).

The authoritative retention design lives in `docs/_archive/specs/Done/2026-05-05-tiered-conversation-retention.md` (archived, marked Done) — but it deliberately does **not** cover the persistent `learning_profiles` / `memory_facts` / `topic_notes` layer, which is exactly the layer with no documented retention rule today. That gap is the substance of A24.

---

## Open items register

| ID | Item | Owner | Severity | Blocks launch? |
|---|---|---|---|---|
| ~~**R1**~~ | ~~Wire Clerk user-delete into `executeDeletion` + consent-withdrawal path; add break test~~ — **RESOLVED 2026-06-08** (commit `9137c7961`). `deleteClerkUser()` added to `services/clerk-user.ts`; the scheduled-deletion Inngest job captures `clerk_user_id` before the DB cascade and erases the Clerk identity after a confirmed `'deleted'`. Red→green break test verified at both the service and orchestration layers. Consent-withdrawal path needs no change — it only deletes child profiles (managed persons, `clerk_user_id = null`, no login). | eng | ~~HIGH~~ → done | No (resolved) |
| ~~**R2**~~ | ~~Verify `RETENTION_PURGE_ENABLED=true` in production~~ — **RESOLVED 2026-06-08** (confirmed set in prod Doppler; purge runs). Residual (commit the flag to config docs so it can't regress) **also DONE 2026-06-08** — added to `.env.example` with a "required true in prod" note. | eng/ops | ~~HIGH~~ → done | No (resolved) |
| ~~**R3**~~ → **R3a** | ~~Erase `byok_waitlist` email on account deletion~~ — **RESOLVED (legacy) 2026-06-08**: erasure wired into `executeDeletion` (captures the deleted account's email atomically via `DELETE ... RETURNING`, then erases the matching `byok_waitlist` row). Real-DB red→green break test added to `deletion.integration.test.ts`. **NOTE (2026-06-08):** launch runs on the new identity architecture, which rewrites the delete flow — this fix is **interim**; the *requirement* (erase the out-of-model `byok_waitlist` email on person-delete) must carry into the new delete flow. | eng | ~~MEDIUM~~ → done (interim) | No |
| ~~**R3b**~~ | ~~Erase/drop the orphaned `organizations` row.~~ **MOOT 2026-06-08** — launch is on the new identity architecture (user decision); the ratified target schema **drops `organizations`/`memberships`** in the baseline reset (`data-model.md` §4.3/§5.2), so the legacy display-name-in-`organizations.name` PID gap disappears with the table. No erasure code to write. | eng | — | No (moot) |
| ~~**A24-a**~~ | ~~Make the privacy notice accurate about retained quotes (and fix §7 7-vs-30-day, age range, transcript-purge mention)~~ — **RESOLVED 2026-06-08**: `docs/privacy-policy.html` rewritten (June 2026). Adds learning-memory retention + purpose-fence + transcript-purge disclosure, fixes §8 grace 30→7 days, removes "ages 11–15" (now age-neutral, min-age 13), adds international-transfers section, names controller + DPO contact. Pre-publish TODO comment flags the DPO name, registered address, EU/UK Art 27 rep, and final age-floor confirmation. | DPO + eng | — | Part of A5 |
| **A24-b** | Age-out / abstract verbatim fields on the 30-day clock (fast-follow) | eng | — | No (post-launch tightening) |
| — | Add learning-memory retention period + proportionality + purpose-fence to the DPIA | DPO | — | Yes (A1 content) |

See `docs/meetings/minors-compliance-requirements.md` → **A24** for the GDPR analysis (storage limitation, proportionality, purpose limitation) these items implement.
