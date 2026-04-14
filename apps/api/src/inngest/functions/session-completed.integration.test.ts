/**
 * session-completed Inngest pipeline integration tests (STAB-3.4)
 *
 * These tests require a real database and live in the integration test suite:
 *   tests/integration/session-completed-pipeline.integration.test.ts
 *
 * The integration runner (tests/integration/jest.config.cjs) handles DB driver
 * shimming for CI, LLM mock provider registration, and cleanup utilities.
 *
 * To run:
 *   pnpm exec jest --config tests/integration/jest.config.cjs \
 *     --testMatch="**\/*.integration.test.ts" \
 *     --testPathPatterns="session-completed-pipeline" \
 *     --no-coverage --testTimeout=30000
 */

// This file intentionally left stub-only.
// See tests/integration/session-completed-pipeline.integration.test.ts
