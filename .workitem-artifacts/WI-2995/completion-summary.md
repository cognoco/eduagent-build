**What was done:** Added UUID validation for the quick-check session path before
handler execution and switched the handler to consume the validated parameter.

**What changed:** A malformed session ID now receives the standard request-validation
400 without touching the scoped session repository, consent gate, topic-context
lookup, or LLM dispatch. Valid missing, scoped-hidden, withdrawn-consent, and both
active-consent variants retain their existing behavior.

**Verification:** The focused route suite passes all 34 cases. Preserved evidence
contains baseline RED, candidate GREEN, production-only REVERT RED with the same
single expected failure, and exact RESTORE GREEN. Routed validation completed
TypeScript, the complete API unit test suite, the no-Gemini runtime
ratchet, and the test-only-export guard successfully. ESLint, Prettier, and
`git diff --check` are also green.

**Caveats / Follow-ups:** Fast routed validation intentionally skipped only the
existing slow API integration lane. No schema, ownership policy, response schema,
LLM routing, prompt, metering, secret, environment, or deployment changed.
