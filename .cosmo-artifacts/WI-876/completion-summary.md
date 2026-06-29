What was done:

Added direct integration coverage for the curriculum retry endpoint and its ownership guard.

What changed:

Updated tests/integration/subject-management.integration.test.ts to exercise POST /v1/subjects/:id/retry-curriculum through the real route. The coverage seeds a failed curriculum book, verifies retry dispatch and terminal failure clearing for the owning profile, and verifies a different profile cannot retry or clear another profile's failed curriculum state. The Inngest HTTP boundary is mocked once for the route integration suite and captured calls are cleared inside dispatch assertions.

Verification:

Ran pnpm exec jest tests/integration/subject-management.integration.test.ts --runInBand --no-coverage after the review rework; 1 suite and 22 tests passed. GitHub required checks passed after push: API Quality Gate, CI main, Claude review, E2E changes, Merge completeness, Playwright smoke, and CodeRabbit status. Claude initially requested the negative-path ownership test, then approved after the rework. The Flag-ON integration lane is explicitly non-blocking diagnostic per the workflow comments and was not treated as a merge gate.

Caveats / Follow-ups:

The focused Jest command still prints existing Jest configuration/open-handle warnings after passing. No follow-ups for WI-876.
