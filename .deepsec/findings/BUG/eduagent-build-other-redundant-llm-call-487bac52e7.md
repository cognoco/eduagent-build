# [BUG] LLM recall-quality grade is computed before the cooldown claim, allowing a wasted paid LLM call in a cross-session race

**File:** [`apps/api/src/inngest/functions/review-calibration-grade.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/inngest/functions/review-calibration-grade.ts#L95-L131) (lines 95, 96, 97, 101, 118, 131)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-redundant-llm-call`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

handleReviewCalibrationGrade calls the LLM grader `evaluateRecallQuality()` in the 'grade-recall-quality' step (L95-97) BEFORE the cooldown is atomically claimed by the persist UPDATE (L101-129, guarded by `lastReviewedAt IS NULL OR < cooldownThreshold`). This is the opposite order from the sibling user-facing path processRecallTest() in services/retention-data.ts, which the team deliberately structured ([WI-234], L835-884) to claim the cooldown window with an atomic UPDATE BEFORE the LLM call 'to make exactly one request reach the LLM'. The function's Inngest idempotency key is sessionId+topicId, so same-session retries are deduped; the unprotected race is two DIFFERENT sessions grading the SAME topic concurrently — both pass canRetestTopic() (reading the un-mutated card) and both reach the LLM, after which one wins the persist and the other returns 'cooldown_claim_lost' (its grade discarded). Result: one wasted paid LLM call. No data corruption — the persist guard preserves correctness — so impact is limited to redundant LLM spend in a rare race. The project threat model flags LLM metering as sensitive, so noting it.

## Recommendation

Mirror the processRecallTest ([WI-234]) ordering: perform the atomic cooldown-claim UPDATE first (claim lost -> return 'cooldown_claim_lost' without calling the LLM), then call evaluateRecallQuality(), then write the SM-2 result. This guarantees at most one LLM call per cooldown window across concurrent sessions.

## Revalidation

**Verdict:** true-positive

The ordering claim is confirmed: `canRetestTopic()` reads the un-mutated card in pure JS (L91-93, no DB write), the billable LLM grader `evaluateRecallQuality()` runs in the 'grade-recall-quality' step (L95-97), and only afterward does 'persist-retention-update' (L101-129) perform the atomic claim guarded by `isNull(lastReviewedAt) OR lt(lastReviewedAt, cooldownThreshold)` (L122-124), returning 'cooldown_claim_lost' on a lost race (L131-133). The sibling user-facing path `processRecallTest()` in services/retention-data.ts (L835-884) deliberately claims the cooldown with an atomic UPDATE *before* calling the LLM, with the inline comment 'To make exactly one request reach the LLM' — confirming the intended pattern this cron inverts. The Inngest config uses idempotency key `sessionId + '-' + topicId` (L152) with no `concurrency` key, so two *different* sessions grading the *same* topic are not serialized; both pass the stale-card check, both reach `routeAndCall` (the real paid LLM call), one wins the persist and the other discards its grade. The persist guard preserves correctness, so there is no data corruption — the only impact is one redundant paid LLM call in a rare cross-session race. That makes it a genuine but low-impact bug, correctly rated BUG; the project threat model flags LLM metering as sensitive, so it is worth fixing by mirroring the claim-first ordering. The race is real and describable, so true-positive.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-23)
