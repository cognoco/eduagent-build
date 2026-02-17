/**
 * Integration test setup — uses real DB (PostgreSQL), real Drizzle, mock LLM provider.
 *
 * Environment: DATABASE_URL must point to a test PostgreSQL instance.
 * Schema is applied before tests via `pnpm --filter @eduagent/database db:push`.
 *
 * Each test should either:
 * - Use transaction rollback for isolation (preferred)
 * - Clean up after itself using DELETE queries
 */

import {
  registerProvider,
  createMockProvider,
} from '../../apps/api/src/services/llm';

// Register mock LLM provider for all integration tests
// Real Gemini calls would be flaky and expensive in CI
registerProvider(createMockProvider('gemini'));

// Set a generous timeout for integration tests
jest.setTimeout(30_000);
