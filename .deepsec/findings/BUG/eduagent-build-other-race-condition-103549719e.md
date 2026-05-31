# [BUG] Lost-update race in reviewVocabulary SM-2 read-compute-write (transaction does not provide claimed isolation)

**File:** [`apps/api/src/services/vocabulary.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/vocabulary.ts#L271-L299) (lines 271, 276, 293, 299)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

reviewVocabulary wraps the retention-card read-compute-write in `db.transaction()` and comments that this 'prevent[s] SM-2 race conditions: concurrent reviews reading the same consecutiveSuccesses would silently overwrite each other's SM-2 parameters without serialization.' This is incorrect. A bare Drizzle/Postgres transaction runs at READ COMMITTED isolation; it makes the two UPDATEs (card + vocab) atomic together but does NOT serialize the read-compute-write. ensureVocabularyRetentionCard performs a plain `findFirst` (no SELECT ... FOR UPDATE), then sm2() and the consecutiveSuccesses/failureCount/mastered values are computed in JavaScript (L282-297) and written as literal bound values (L299-317) — not as SQL `col = col + 1` expressions. Under two concurrent reviews of the same vocabularyId (e.g. a double-tap or client retry), both transactions read the same baseline card (say consecutiveSuccesses=2), both compute 3, and the second UPDATE overwrites the first: the final state is 3 where it should be 4, and easeFactor/intervalDays/repetitions/nextReviewAt likewise reflect only one of the two reviews. Impact is limited to drift in spaced-repetition scheduling and the `mastered` flag (consecutiveSuccesses >= 3 may flip a review early/late) for a single learner's own data — no cross-tenant or attacker benefit — but the misleading comment will give future maintainers false confidence that the path is race-safe. Compare with createNudge in nudge.ts, which correctly serializes its rate-limit check with pg_advisory_xact_lock.

## Recommendation

Acquire a row lock on the retention card before computing the new SM-2 state — add `SELECT ... FOR UPDATE` on the vocabularyRetentionCards row inside the transaction (e.g. via `.for('update')` on the card read), or take a `pg_advisory_xact_lock(hashtextextended('vocab-review:' || vocabularyId, 0))` at the top of the transaction as createNudge does, or set the transaction to SERIALIZABLE and handle serialization-failure retries. Alternatively, express the increment as a SQL expression so Postgres' EvalPlanQual recheck applies it correctly. Update the comment to state the actual mechanism used.

## Revalidation

**Verdict:** true-positive

I traced the full path and the finding's analysis is technically correct. reviewVocabulary (lines 246-380) wraps its work in db.transaction (line 274) and the in-code comment (lines 271-273) claims this 'prevent[s] SM-2 race conditions,' but a bare Postgres/Neon transaction runs at READ COMMITTED, which makes the two UPDATEs atomic together but does NOT serialize the read-compute-write. The card is read by ensureVocabularyRetentionCard via db.query.vocabularyRetentionCards.findFirst (lines 230-235) with NO .for('update') — I confirmed there is no row lock anywhere in this file, and git -S for both "for('update')" and "pg_advisory" on vocabulary.ts returned nothing, so no lock has ever been applied. The new values (consecutiveSuccesses = card.consecutiveSuccesses + 1, failureCount, mastered) are computed in JS (lines 293-297) and written as literal bound values (lines 299-317), not as SQL col = col + 1, so EvalPlanQual recheck does not rescue them. Two concurrent reviews of the same vocabularyId (double-tap or client retry) both read the same baseline (e.g. consecutiveSuccesses=2), both compute 3, and the second UPDATE overwrites the first, yielding 3 instead of 4, with easeFactor/intervalDays/repetitions/nextReviewAt also reflecting only one review and the mastered flag (>=3) potentially flipping early/late. The codebase has the correct patterns elsewhere (streaks.ts uses .for('update'); nudge.ts uses pg_advisory_xact_lock), confirming this site is an inconsistent omission. Impact is correctly scoped to drift in a single learner's own SRS scheduling — no cross-tenant or attacker benefit — and the misleading comment is itself a hazard. Severity BUG is appropriate; the recommendation (SELECT ... FOR UPDATE on the card, an advisory lock, or SQL increment expressions) is sound. Verdict: true-positive.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-13)
