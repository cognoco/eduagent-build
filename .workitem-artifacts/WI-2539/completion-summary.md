## Completion Summary — 2026-07-26

**What was done:**
Converted the six legacy full-replacement internal mocks in the two ChatShell suites to targeted Pattern-A passthroughs while preserving the suites' existing override behavior and assertions.

**What changed:**
Both ChatShell test files now spread the matching real speech-recognition hook, text-to-speech hook, and common-component barrel exports before overriding only the exports the suites control. The performance suite's existing real-MessageBubble render-count passthrough is unchanged. Each suite also stubs the true external `expo-speech` boundary so evaluating the real TTS module does not introduce native-module warnings.

**Verification:**
Both focused suites pass all 106 assertions; the GC1 structural guard, scoped ESLint and Prettier checks, and mobile typecheck exit cleanly. The repository fast change-class gate passed five legs; its full mobile-unit leg exposed one unrelated Linux-host failure in the WI-2176 evidence-runner test because `pwsh` is absent. The exact commands and results are recorded in `.workitem-artifacts/WI-2539/verification.md`.

**Caveats / Follow-ups:**
The unrelated PowerShell availability defect was reported to the BID-19 shepherd with its exact reproduction for formal capture and disposition. Exact-head GitHub CI and Claude review remain pending until the branch is published; the shepherd owns landing, execute-complete, independent review, and closure.
