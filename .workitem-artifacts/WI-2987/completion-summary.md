**What was done:** Moved dictation-review LLM consent enforcement behind the
existing deterministic atomic rate-limit and aggregate prompt-budget exits, while
keeping the consent check immediately before the first LLM-capable work.

**What changed:** Withdrawn-consent requests now retain the established 429 when
rate-exhausted and 413 when over the aggregate prompt budget, without provider
dispatch. A rate-eligible, in-budget request still returns the established 403 on
withdrawn consent before dispatch. The structural boundary manifest and guard now
encode rate/budget -> consent -> dispatch ordering for this route-owned flow.

**Verification:** Focused tests are green on current `origin/main` with 84/84 cases.
Preserved evidence contains baseline RED, candidate GREEN, production-only REVERT
RED with the same four expected failures, and exact RESTORE GREEN. Routed validation
completed TypeScript, all 506 API unit suites (10,152 passing cases), the no-Gemini
runtime ratchet, and the test-only-export guard successfully. ESLint, Prettier, and
`git diff --check` are also green.

**Caveats / Follow-ups:** Fast routed validation intentionally skipped only the
existing slow API integration lane. No schema, migration, prompt, model, provider
routing, payload/rate-limit policy, metering, unrelated consent policy, secret,
environment, or deployment changed.
