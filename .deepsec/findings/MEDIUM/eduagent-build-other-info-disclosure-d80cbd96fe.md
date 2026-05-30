# [MEDIUM] Schema-drift path logs the full raw event payload (including step error strings), contradicting the happy-path decision to omit error text

**File:** [`apps/api/src/inngest/functions/session-completed-observe.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/inngest/functions/session-completed-observe.ts#L44-L139) (lines 44, 50, 84, 90, 122, 128, 139)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-info-disclosure`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

On a schema-validation failure, all three handlers log and capture the entire unvalidated payload: `logger.error(..., { issues, rawData: event.data })` and `captureException(..., { extra: { issues, rawData: event.data } })` (L42-51, L83-91, L121-129). The happy path for sessionCompletedWithErrors deliberately logs only step NAMES and never the error strings: `failedSteps: data.failedSteps.map((s) => s.step)` (L139) — i.e. the author intentionally kept `failedSteps[].error` (a free-text string per sessionCompletedWithErrorsEventSchema in packages/schemas/src/inngest-events.ts, which can carry caught exception text such as DB/LLM error detail) out of the logs. The drift path discards that precaution and dumps the whole payload. The sibling observer ask-gate-observe.ts demonstrates the intended pattern: it routes raw data through `summarizeRawPayload()` / `sanitizeDecisionRawData()` so only field counts and a reason LENGTH (never the reason string) are logged (ask-gate-observe.ts L43-63, 74, 118). session-completed-observe.ts lacks that sanitizer. Exposure is bounded — events are internal/Inngest-signed (not attacker-controlled), the schema carries IDs/counts and only short error/reason strings (no transcript or memory-fact text), and the data lands in internal observability tooling — so this is a low-severity privacy/log-hygiene divergence rather than an attacker-exploitable leak.

## Recommendation

Mirror ask-gate-observe.ts: add a summarizeRawPayload-style helper that logs only payload shape (type, field count) and, where useful, presence/length of fields — never the raw error/reason strings — on the schema_drift branch for all three handlers. This restores parity with the happy-path decision to exclude `failedSteps[].error` from logs.

## Revalidation

**Verdict:** true-positive

Confirmed real and unmitigated in current HEAD by two independent passes. All three schema-drift handlers pass the unvalidated payload raw to both sinks: `logger.error(..., { issues, rawData: event.data })` and `captureException(..., { extra: { issues, rawData: event.data } })` at L44/50 (sessionSummaryGenerated), L84/90 (sessionSummaryFailed), and L122/128 (sessionCompletedWithErrors). The happy path at L139 deliberately maps only `s.step`, intentionally dropping `failedSteps[].error` — so the drift path is a clear internal inconsistency. `failedSteps[].error` is defined as `z.string().nullable()` in packages/schemas/src/inngest-events.ts and is populated from `err instanceof Error ? err.message : String(err)` at session-completed.ts:342, i.e. caught DB/LLM exception text (potentially table/column names, query fragments, API error detail). The verifier checked for a logger redaction layer, a Sentry `beforeSend` scrubber, an env guard, and branch unreachability, and found none — the logger does a plain JSON.stringify at minLevel 'info' and `withSentry` has no `beforeSend`. The sibling ask-gate-observe.ts proves the fix pattern (`summarizeRawPayload`/`sanitizeDecisionRawData`) is known and was simply never applied here; git history shows only two commits on this file, neither retrofitting a sanitizer. Severity MEDIUM is correct: exposure is internal observability tooling, events are Inngest-signed (not attacker-controlled), and content is bounded to short error strings rather than learner transcripts/memory facts — a real log-hygiene/PII-divergence bug, not an attacker-exploitable leak. The summary.generated and summary.failed drift payloads carry only UUIDs/counts, so the practical exposure concentrates on the sessionCompletedWithErrors handler's `failedSteps[].error`.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-22)
