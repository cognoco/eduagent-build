# [BUG] review route catch-all masks transient DB errors as 422 and echoes raw error message

**File:** [`apps/api/src/routes/vocabulary.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/routes/vocabulary.ts#L102-L113) (lines 102, 107, 108, 109, 110, 111, 112, 113)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-error-misclassification`

## Owners

**Suggested assignee:** `vetinari@zaf.fleet` _(via last-committer)_

## Finding

In the POST /subjects/:subjectId/vocabulary/:vocabularyId/review handler (lines 102-113), the catch block handles VocabularyNotFoundError, then falls through to `apiError(c, 422, ERROR_CODES.VALIDATION_ERROR, err instanceof Error ? err.message : 'Vocabulary review failed')` for ALL other errors. reviewVocabulary() runs a multi-statement transaction (ensureVocabularyRetentionCard + two UPDATEs) plus an SM-2 computation. A transient Neon/Postgres error thrown inside that transaction is caught here and returned as HTTP 422 VALIDATION_ERROR, instead of propagating to the global onError handler in index.ts which would classify it via isTransientDatabaseError() into a 503 + Retry-After. The repo's own UX-resilience rule ('Classify errors at the API client boundary') means the mobile client treats 422 as a permanent validation failure and will not retry, so a transient blip during a review is surfaced as an unrecoverable error. Secondly, the raw `err.message` is returned to the client unconditionally (no production gate), unlike the global handler which suppresses internal messages in production — a minor information-disclosure divergence. Other write routes in this same file (create/delete) correctly let errors propagate to the global handler; only the review route has this local catch-all.

## Recommendation

Only catch the domain errors you can classify (VocabularyNotFoundError → 404; a dedicated validation error → 422) and re-throw everything else so the global onError handler can apply transient-DB (503) and production-safe message handling. Do not return raw err.message for the generic case.

## Revalidation

**Verdict:** true-positive

Confirmed real. The review handler (vocabulary.ts:102-113) catches VocabularyNotFoundError → 404, then routes ALL other errors to apiError(c, 422, VALIDATION_ERROR, err instanceof Error ? err.message : ...). reviewVocabulary (services/vocabulary.ts:246-380) performs a findFirst read (line 264) plus a multi-statement db.transaction (lines 274-358: ensureVocabularyRetentionCard insert+read, an UPDATE of vocabularyRetentionCards, an UPDATE of vocabulary, and an SM-2 computation). A transient Neon/Postgres failure thrown inside that work is a plain Error, not a VocabularyNotFoundError, so it falls through to the 422 branch. This bypasses the global onError handler (index.ts:460-475) which would classify it via isTransientDatabaseError() into 503 + Retry-After. Per the repo's own UX-resilience rule ('classify errors at the API client boundary'), the mobile client treats 422 as a permanent validation failure and will not retry — a transient blip becomes an unrecoverable error. Secondly, err.message is returned with no production gate, whereas the global generic-500 path suppresses internal messages in production (index.ts:489-495) — a minor information-disclosure divergence (e.g. leaking Postgres/internal error text, or the literal 'Update vocabulary retention card did not return a row'). The sibling create (lines 76-82, re-throws non-SubjectNotFoundError) and delete (no catch-all) handlers correctly defer to the global handler, isolating this defect to the review route. Severity BUG is appropriate: it is an error-misclassification + minor info-leak, not a direct auth/data-access exploit. Fix: catch only classifiable domain errors and re-throw the rest.

## Recent committers (`git log`)

- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
- crowka <zuzana.kopecna@zwizzly.com> (2026-05-05)
