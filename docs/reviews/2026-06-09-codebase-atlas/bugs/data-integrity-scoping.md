# Data integrity & profileId scoping — Bug Review

**Lens:** Data integrity & profileId scoping
**Owned area:** `apps/api/src/services/**`, `packages/database/**`
**Branch:** new-llm
**Date:** 2026-06-09
**Method:** Exhaustive grep/glob/read sweep of every `db.select/insert/update/delete`, every `createScopedRepository` usage, every parent-chain join, and every cross-profile read in the owned area.

## Summary of posture

The profileId-scoping discipline in this codebase is strong and consistent. The core primitives are sound:

- `createScopedRepository(db, profileId)` (`packages/database/src/repository.ts:71`) throws on empty profileId and applies `eq(table.profileId, profileId)` to every single-table read namespace.
- `withProfileScope` (`packages/database/src/rls.ts:46`) validates the profileId as a UUID before inlining it into `SET LOCAL` (SQL-injection safe).
- Parent-chain joins consistently enforce `subjects.profileId` (or the closest owning ancestor) in the WHERE clause — verified in `session-crud.ts`, `recall-bridge.ts`, `notes.ts`, `curriculum-topic-ownership.ts`, `concept-mastery.ts`.
- Writes bind `profileId` in `.values()` or gate UPDATE/DELETE with ownership-verified subqueries (`suggestions.ts:65-81`, `suggestions.ts:119-136`) or EXISTS guards (`settings.ts:135-163`).
- Cross-profile reads (parent → child) are gated by `assertParentAccess` / `assertOwnerAndParentAccess` (`family-access.ts`) — verified at every call site in `dashboard.ts`, `recaps.ts`, `family-bridge.ts`, `settings.ts`.
- The `__unscoped` billing helpers (`account-repository.ts:69-122`) are explicitly named and documented as webhook/cron-only.
- Many historical IDOR/leak bugs already carry regression-tested fixes: BUG-218, BUG-219, BUG-221, BUG-224, BUG-390, BUG-461, BUG-565, BUG-566, BUG-643, BUG-655, BUG-661, BUG-851.

No Critical or High cross-profile read/write leaks were found in the owned area. The findings below are low-severity defense-in-depth gaps and one medium consistency observation.

## Critical

None found.

## High

None found.

## Medium

### [MEDIUM] `loadNextTopicMap` resolves next-topic titles via an unscoped curriculum_topics join

- File: `apps/api/src/services/recaps.ts:84-97`
- What: The aliased `leftJoin(nextTopic, eq(sessionSummaries.nextTopicId, nextTopic.id))` resolves the "Coming up" topic title with no `subjects.profileId` predicate on the joined topic row. The query filters `sessionSummaries.profileId IN childProfileIds` and `sessionSummaries.sessionId IN sessionIds`, but the title itself is pulled from whatever `curriculum_topics` row `next_topic_id` points at, regardless of which profile owns that topic.
- Impact: If a `session_summaries.next_topic_id` value ever pointed at a foreign profile's topic (data-corruption, a future bug in summary generation, or a cross-clone path like `family-bridge`), the foreign topic title would render on a parent's recap card. Today `next_topic_id` is written from the same profile's own next-topic resolution, so this is latent rather than live — but it is the one read in the recap pipeline that does not re-anchor ownership through the `subjects.profileId` chain that every sibling query uses.
- Fix direction: Add `curriculum_books` + `subjects` joins to the aliased next-topic resolution and constrain `subjects.profileId = sessionSummaries.profileId` (or `IN childProfileIds`), mirroring the parent-chain pattern in `recall-bridge.ts:57-72`. Alternatively, resolve next-topic titles through `findOwnedCurriculumTopics(db, { profileId, topicIds })`.

## Low

### [LOW] `deleteTopicIfSafe` final DELETE filters by topic id only after the ownership SELECT

- File: `apps/api/src/services/curriculum.ts:2173-2176`
- What: Ownership is confirmed via the books→subjects→`profileId` join at lines 2095-2107, then the terminal `delete(curriculumTopics).where(eq(curriculumTopics.id, topicId))` filters by primary key alone. The two statements are not in a transaction, so a TOCTOU window exists between the ownership read and the delete.
- Impact: Negligible in practice — `topicId` is a server-resolved UUID, ownership was just confirmed, and the delete is additionally gated on `filedFrom` and absence of session/progress references. A concurrent re-parent of the topic between SELECT and DELETE is the only theoretical exposure, and the FK chain makes that path inert.
- Fix direction: Fold the ownership predicate into the DELETE WHERE via an `EXISTS`/`inArray` subquery on owned topic ids (same pattern as `suggestions.ts:119-136`), or wrap the check-and-delete in a single transaction.

### [LOW] `family-bridge` clone UPDATE refreshes an existing topic by id only

- File: `apps/api/src/services/family-bridge.ts:458-466`
- What: Inside `cloneTopicFromChild`, the description-refresh `update(curriculumTopics).set({...}).where(eq(curriculumTopics.id, existingTopic.id))` filters by topic id only. `existingTopic` was found via `findTopicByTitle(book.id, ...)` where `book` resolves from `resolveSubject` (anchored to `adultProfileId`), so the chain is owned — but the UPDATE itself carries no ownership predicate.
- Impact: Low — the whole flow runs in a transaction (`family-bridge.ts:405`) after `assertParentAccess` and an adult-owned subject/book resolution, so the id is owned by construction. The gap is purely defense-in-depth.
- Fix direction: Add `eq(curriculumTopics.bookId, resolvedBook.book.id)` (the owned book) to the UPDATE WHERE so the write predicate is self-contained.

### [LOW] `replaceActiveMemoryFactsForProfile` performs a profile-wide DELETE that relies entirely on caller-supplied tx serialization

- File: `apps/api/src/services/memory/memory-facts.ts:258-289`
- What: `db.delete(memoryFacts).where(eq(memoryFacts.profileId, profileId))` deletes ALL active memory facts for a profile, then re-inserts. profileId scoping is correct, but the function accepts a narrow `MemoryFactsWriter` handle and documents (in a comment, lines 246-257) that every caller must already hold a `SELECT ... FOR UPDATE` on the `learning_profiles` row. That invariant is enforced only by convention, not by the function signature.
- Impact: Low for cross-profile leakage (the WHERE is correctly scoped). The risk is data-integrity (lost-update / partial-replace) if a future caller invokes it outside the documented FOR-UPDATE transaction. No cross-profile exposure.
- Fix direction: Either require a branded transaction-handle type, or move the FOR-UPDATE lock acquisition inside this function so the invariant cannot be bypassed by a new caller.

### [LOW] `getNotesForBook` enumerates topic ids by bookId without a profileId predicate on the topic read

- File: `apps/api/src/services/notes.ts:370-373`
- What: After verifying subject→profile and book→subject ownership (lines 352-367), the function selects `curriculumTopics.id WHERE bookId = bookId` with no further scoping, then `selectNotesForTopicIds` filters notes by `topicNotes.profileId`. The intermediate topic-id read is unscoped.
- Impact: None in practice — the book was already confirmed owned, and the final notes read is profile-scoped, so no foreign data can surface. Listed only as a consistency note: the topic-id enumeration is the lone read in this file that doesn't carry the ownership chain inline.
- Fix direction: No action required for correctness; if hardening, join through `subjects.profileId` in the topic-id enumeration to keep the file's pattern uniform.

## Cross-lens findings

- **Authz / route-guard lens:** `assertCanManageOwnConsent`, `assertOwnerAndParentAccess`, and `assertOwnerProfile` (`family-access.ts:76-157`) read `c.get('profileMeta')` and enforce isOwner/age gating at the Hono context layer. Whether every consent/admin route actually calls these guards (vs. relying on service-layer checks) belongs to the route/middleware lens. `markChildReportViewed` (`dashboard.ts:1545`) notes a prior bug where access denial silently succeeded — worth confirming no sibling parent-admin route still returns silently instead of throwing.
- **Concurrency / atomicity lens:** Multiple services rely on `pg_advisory_xact_lock` (`notes.ts:162`, `settings.ts:601/645`) and `SELECT ... FOR UPDATE` (`session-crud.ts:977`, `home-surface-cache.ts:208`, `repository.ts:905-912`) for lost-update prevention. The comments repeatedly warn that neon-http does NOT honor `.for('update')` in interactive transactions and the durable barrier is a unique index (`filing.ts:553-557`, `family-bridge`). Verifying the production driver is neon-**serverless** (WebSocket, interactive) everywhere these locks matter is a concurrency-lens concern.
- **LLM-prompt-injection lens:** `recall-bridge.ts`, `filing.ts`, and `session-crud.ts` (topic-intent matcher) feed DB-sourced titles/descriptions into LLM prompts via `escapeXml`/`sanitizeXmlValue`. Scoping is correct (data is profile-owned), but the adequacy of XML escaping against prompt injection is an LLM-security concern.
- **Schema/migration lens:** `notes.ts:59-117` carries a `topic_notes.session_id` schema-drift fallback (catches Postgres 42703 and nulls sessionId). This expand/contract hedge belongs to the migration-safety lens — confirm the column is now universally present so the legacy path can be retired.
