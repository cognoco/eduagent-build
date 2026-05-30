# [BUG] Recall-test submit and 'don't remember' use independent in-flight guards, allowing a double-submit

**File:** [`apps/mobile/src/app/(app)/topic/recall-test.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/app/(app)/topic/recall-test.tsx#L111-L207) (lines 111, 207)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** low  •  **Slug:** `other-race-condition`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

handleSend() guards on `submissionInFlightRef.current || isStreaming` (L111) while handleDontRemember() guards on `dontRememberPendingRef.current || isStreaming` (L207). These two refs are independent, and `isStreaming` is only set to true later, inside animateResponse() within the mutation's onSuccess callback. During the network round-trip after one handler calls submitRecallTest.mutate() but before its onSuccess runs, isStreaming is still false and the other handler's ref is still false, so a fast user (type an answer, hit send, then immediately tap 'I don't remember') can trigger a second concurrent POST /retention/recall-test for the same topic. The submissionTokenRef (++ on each call, checked in callbacks) prevents UI/state corruption — only the latest call's callbacks apply — but two attempts may be recorded server-side, potentially inflating failureCount or affecting cooldown/remediation logic. Not a security issue (the route enforces assertNotProxyMode + requireProfileId, and the server is the source of truth for attempt counting), but a correctness gap in otherwise careful in-flight handling.

## Recommendation

Share a single mutual-exclusion guard across both handlers: have handleSend() also check dontRememberPendingRef.current and handleDontRemember() also check submissionInFlightRef.current (or introduce one combined `anySubmissionInFlight` ref/state checked by both). Confirm the server treats rapid duplicate recall-test submissions idempotently.

## Revalidation

**Verdict:** true-positive

This is a genuine, still-present correctness gap and is NOT a duplicate of the repeated-dont_remember finding (that one is about one handler's self-guard, now fixed; this is about two handlers not sharing a guard). handleSend guards on `submissionInFlightRef.current || isStreaming` (line 111) and handleDontRemember guards on `dontRememberPendingRef.current || isStreaming` (line 207) — two independent refs that never cross-check each other. isStreaming only flips true later, inside animateResponse within the mutation's onSuccess. I confirmed the input surfaces stay live during the network window: ChatShell's send button and internal handleSend are gated only by `isStreaming` (+ non-empty input / web-dormant) — ChatShell.tsx:463 `if (!input.trim() || isStreaming) return;` and :1085 `disabled={!input.trim() || isStreaming || isWebDormant}` — never by submissionInFlightRef or dontRememberPending; and the dont_remember accessory is gated by `dontRememberPending || isStreaming`, which handleSend never sets. So a user who types an answer, taps Send, then immediately taps 'I don't remember' (or the reverse) fires two concurrent POST /retention/recall-test calls before isStreaming becomes true. react-query's useMutation does not cancel a prior in-flight mutate; both mutationFns run and both per-call callbacks fire. submissionTokenRef (++ then checked in callbacks) does prevent UI/state corruption — only the latest call's callbacks apply — so it is correctly not a security issue. But two attempts execute server-side: WI-234 serializes the standard path via an atomic cooldown claim (retention-data.ts:846-884), yet dont_remember explicitly skips that claim (line 846 `if (attemptMode !== 'dont_remember')`), so a standard+dont_remember pair is not fully serialized — each path independently records a practice-activity event (distinct occurrenceKey via per-request timestamp, line 961) and the standard write may lose its optimistic-lock race (updatedAt === claimNow) and return the cooldown branch. failureCount is written as an absolute SET (not an increment) so it is not literally doubled, but the double-submit and double practice-event recording the finding describes are real. The finding's own low self-confidence is warranted on the exact downstream effect, but the core mechanism (independent guards → concurrent double POST) is verified and correct. Recommended fix (a shared anySubmissionInFlight guard checked by both handlers) is appropriate.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-26)
- Lord Vetinari <vetinari@zaf.fleet> (2026-05-24)
