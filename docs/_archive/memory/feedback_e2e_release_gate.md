---
name: E2E release gate loop
description: Use when running release-blocking E2E or Playwright validation before publishing.
type: feedback
---

For release-blocking E2E work, the goal is a full pass, not a sample. Run the full suite, record every failure, investigate each one, decide whether it is a real product bug or stale/fragile test behavior, fix the correct layer, and repeat until the suite passes.

**Why:** On 2026-05-13, the user clarified that publishing is blocked on real E2E confidence. Real app bugs must be fixed in product code. Tests should only be changed when investigation proves the app behavior is correct and the test is outdated or brittle.

**How to apply:** Keep a failure ledger while iterating. Use subagents freely for independent failure triage, but the coordinator owns commits and pushes. Do not call release E2E work done while any related failures remain unexplained or unverified.
