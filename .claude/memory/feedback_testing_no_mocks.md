---
name: feedback_testing_no_mocks
description: User strongly prefers testing real solutions over mocking — do not add new mocks to test files
type: feedback
---

Wherever possible, test the real solution — do not use mocks.

**Why:** The user wants tests that verify actual app behavior, not mocked behavior. Mocking can mask real bugs and give false confidence. Tests are supposed to test the app.

**How to apply:**
- When writing new tests or fixing existing ones, prefer testing real functions/components with real inputs
- If a test file you touch already has mocks, rewrite the touched coverage to mirror the real implementation instead of adding new shape-only mocks or making the mock graph more elaborate
- Do NOT add new `jest.mock()` calls for internal modules (relative paths `./` or `../`). GC1 ratchet blocks these in CI.
- External boundary mocks (Stripe, Clerk JWKS, Inngest framework, LLM providers via `routeAndCall`) are allowed per CLAUDE.md — these are not "internal" mocks.
- Do NOT modify existing test assertions just to make code changes pass — if tests fail, that's a signal to investigate
- For UI behavior changes (like error states), prefer verifying via E2E flows over adding mock-based unit tests
- When test fixtures need updating (e.g., adding a new required config key to a test's input data), that's acceptable — updating input data to a real function is not "mocking"
- Never touch test files unrelated to the current fix
- Use the test infrastructure already in place ("use the solution in place")
