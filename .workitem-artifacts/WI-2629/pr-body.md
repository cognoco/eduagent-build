## Summary

- align the public mentor-notice envelope with the ratified optional `learnerQuote` contract
- retain required `answerEventId` and the existing non-empty bound for a present quote
- add focused schema coverage for omitted quote, required provenance identity, and empty-quote rejection

## Evidence

- focused red-green-revert: `packages/schemas/src/llm-envelope.test.ts`
- downstream provenance and mismatch guard: `apps/api/src/services/mentor-notices/evidence.test.ts`
- seven-AC manifest: `.workitem-artifacts/WI-2629/evidence.json`

## Verification

- envelope suite: 118 passed
- mentor-notice evidence and creation suites: 11 passed
- routed fast shared-schema gate: typecheck plus 524 API suites, 537 mobile suites, and test-only-export ratchet passed
- routed database-backed API and cross-package integration suites run separately

References WI-2629 — Retain mentor-notice evidence identity after transcript purge.
