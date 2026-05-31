# [BUG] Non-transactional regenerate: ownership-check → delete-all → insert can race a concurrent same-user request

**File:** [`apps/api/src/services/language-curriculum.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/language-curriculum.ts#L358-L372) (lines 358, 370, 372)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-non-atomic-write`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`regenerateLanguageCurriculum` (lines 348-410) verifies subject ownership (line 358), then deletes ALL curricula for the subject (line 370), then inserts a fresh curriculum with hardcoded `version: 1` (lines 372-378) and topics — all outside a transaction. Two near-simultaneous requests for the SAME subject (e.g. a double-tapped 'regenerate'/challenge action, or an Inngest retry of session-completed overlapping a user-initiated call — callers at curriculum.ts:2316, subject.ts:415, subject.ts:552) can interleave: both pass the ownership check, both delete, both insert, producing duplicate `version: 1` curricula (or a unique-constraint failure / lost topics depending on schema constraints). `getCurrentLanguageProgress` then picks one arbitrarily via `orderBy: desc(curricula.version)` + `findFirst`, so the learner may silently see a partially-populated or duplicated curriculum. This is NOT a cross-tenant/security issue — the ownership filter (`subjects.profileId = profileId`) is correct and `subjects.profileId` is immutable, so the read-then-delete window is not exploitable across accounts. It is a data-integrity bug under same-user concurrency only.

## Recommendation

Wrap the ownership re-check, delete, and inserts in a single `db.transaction(async (tx) => …)`, and/or take a row lock on the subject (`SELECT … FOR UPDATE`) or add a unique constraint on `curricula(subjectId)` so concurrent regenerations serialize or fail cleanly instead of duplicating rows.

## Revalidation

**Verdict:** true-positive

I read regenerateLanguageCurriculum (lines 348-410) in full: the ownership check (line 358), the delete-all (line 370), the curriculum insert with hardcoded version:1 (lines 372-378), and the topics insert (lines 395-409) are all separate auto-commit statements with NO db.transaction wrapper, no row lock, and no advisory lock. This is a genuine non-atomic write. I confirmed reachability: of the three callers, subject.ts:415 is a creation path (fresh subjectId, not concurrently reachable), but subject.ts:552 (configureLanguageSubject) and curriculum.ts:2316 (challengeCurriculum) both operate on an existing subjectId and are user-initiated, so two concurrent requests for the same subject (double-tap on 'regenerate'/'challenge', or a client retry) can interleave after both pass the ownership check. I verified the schema: curricula has uniqueIndex('curricula_subject_version_idx') on (subjectId, version). That index does preclude the finding's 'duplicate version:1 rows' sub-claim — instead the realistic manifestations are a spurious 23505 unique-violation or an FK violation surfaced as a 500 on one of the racing requests, and (if one request fails between its curriculum insert and its topics insert) a curriculum row with zero/partial topics that getCurrentLanguageProgress then renders as empty milestones. The finding explicitly hedged 'duplicate ... OR a unique-constraint failure / lost topics depending on schema constraints,' and the latter is what actually occurs, so the core claim is correct. This is correctly scoped as a same-user data-integrity/robustness bug, not a security issue: the ownership filter (subjects.profileId = profileId) is sound and subjects.profileId is immutable, so there is no cross-account exposure. Severity BUG is appropriate (it is the lowest tier and matches the limited, concurrency-only impact). The recommended fix (wrap in a transaction and/or take SELECT ... FOR UPDATE on the subject) is sound.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-24)
