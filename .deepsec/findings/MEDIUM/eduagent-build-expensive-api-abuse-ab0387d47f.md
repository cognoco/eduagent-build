# [MEDIUM] Homework summary LLM call can run without quota

**File:** [`apps/api/src/services/homework-summary.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/homework-summary.ts#L176-L222) (lines 176, 197, 209, 210, 211, 217, 222)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `expensive-api-abuse`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

`extractHomeworkSummary` calls `routeAndCall` even when there is no transcript. Tracing the caller shows the session-completed job invokes this for homework sessions, while starting and closing homework sessions are not metered LLM routes. An authenticated user can create and close skipped homework sessions to trigger background LLM summary calls without consuming visible question quota.

## Recommendation

Skip homework-summary generation unless the session has at least one real metered exchange or completed homework item, and debit/refund quota explicitly for background LLM work that is not behind the metering middleware.

## Revalidation

**Verdict:** true-positive

Confirmed reachable and unmetered end-to-end. extractAndStoreHomeworkSummary is invoked only from the session-completed Inngest job (session-completed.ts:1694), correctly classified in LLM_CALL_SITE_EXEMPT — so the HTTP metering middleware never gates it. The trigger chain is fully unmetered and ungated: (1) POST /subjects/:subjectId/sessions (sessions.ts:236) is NOT in any metering pattern and startSession (session-crud.ts:236) sets sessionType directly from client input with exchangeCount:0 and no OCR prerequisite, so a client can create a homework session for free; (2) the close path dispatches app/session.completed via dispatchSessionCompletedEvent (sessions.ts:1547-1588) with NO exchange-count gate; (3) sessionCompleted has no zero-exchange early-exit, and the homework-summary step (session-completed.ts:1678-1701) runs for any sessionType==='homework'; (4) extractHomeworkSummary calls routeAndCall even with an empty transcript (no early-return). The exempt-list rationale ('idempotency + DB claim flags') only prevents re-processing the SAME session — it does not prevent amplification across many cheaply-created sessions, and the WI-216 comment itself concedes 'the cost is real provider spend.' So an authenticated user can loop create→close(skipped) homework sessions to burn unmetered LLM (plus filing/embedding) beyond their quota. This is a real cost/quota-bypass abuse vector; MEDIUM is appropriate. The recommended ≥1-real-exchange gate would close it.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-27)
- jojorgen <jorn.jorgensen@zwizzly.com> (2026-05-25)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-25)
