# WI-2714 completion summary

## What was done

Fixed the speaking-practice submission race. Root cause: SpeakingPracticeActivity gated attempt submission purely on the stop-listening transition (isListening flipping false), ignoring the speech-recognition hook's isFinalTranscript flag — and the mic stop flips isListening false the instant the native stop is called, well before the engine's real final result lands, so a stale interim transcript could be submitted and graded.

## What changed

- apps/mobile/src/components/session/SpeakingPracticeActivity.tsx — the submission effect now requires final-transcript readiness in addition to the stop-listening transition (distinct signals, both required). The transcript value is read at the moment isFinalTranscript flips true, so a late-arriving final replaces the interim text used for grading. A per-cycle guard ref (reset only when a new listening cycle starts) bounds empty, cancelled, and error paths: cycles that end via a terminal error status or an end event with no final ever produced never enter the submit branch, and no cycle can submit more than once.
- apps/mobile/src/components/session/SpeakingPracticeActivity.test.tsx — three regression tests written red-first against the pre-fix behavior: the late-final case (zero submissions while processing, then exactly one submission carrying the corrected final text), the cancelled case (recognition ends with no final, nothing submitted), and the error case (terminal error before a final, nothing submitted). Together they distinguish the stop-listening transition from final-transcript readiness.

## Verification

The pre-push hook re-ran typecheck and the related jest suites on the push delta with zero failures (all twelve tests in the component's suite included), and lint reported no errors on both changed files. On the pull request every check concluded successfully and the automated review verdict was a clean approval with zero blocking findings; its single consider-level note (whether transcript and final-flag updates are batched atomically) was verified benign — the hook sets both states in the same event handler, so React batches them into one render — and the triage is recorded as a pull-request comment. The change landed on main via the squash commit recorded in Fixed In. No overlap with the open V2 Subjects pull request's surfaces.

## Caveats / Follow-ups

A clarifying comment about the hook's same-render update contract was suggested by the automated review and deferred as logged polish; it does not affect behavior.
