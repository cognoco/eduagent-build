**What was done:** Moved homework-OCR LLM consent enforcement behind the
existing deterministic Content-Length, multipart, MIME, and file-size exits,
while keeping it before accepted-file buffering, provider construction, and LLM
dispatch.

**What changed:** Withdrawn-consent invalid uploads now retain the established
413 or 400 response instead of being masked by a 403, without constructing or
calling the OCR provider. Accepted JPEG, PNG, and WebP uploads still return the
established consent-denied 403 before provider construction. Active-consent
accepted input still dispatches exactly once with the existing provider choice,
response shape, accepted MIME set, and byte limits. The structural manifest and
guard now encode validation -> consent -> provider ordering for this route-owned
boundary.

**Verification:** The focused Node 22 command passed after the change. Preserved
evidence contains baseline RED, candidate GREEN, production-route-only REVERT
RED with the same six expected failures, and exact RESTORE GREEN. Fast routed
validation completed the incremental TypeScript build, all API unit suites, the
no-Gemini runtime ratchet, and the test-only-export guard successfully. ESLint,
Prettier, and `git diff --check` are also green.

**Caveats / Follow-ups:** Fast routed validation intentionally skipped only the
existing slow API integration lane. The nine pre-existing internal module mocks
in `apps/api/src/routes/homework.test.ts` remain under the repository's permitted
GC6 focused-change deferral; replacing that route-test scaffold is unrelated to
this XS ordering repair. No schema, migration, upload policy, prompt, model,
provider routing, metering, secret, environment, staging, or deployment changed.
