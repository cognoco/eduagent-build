/**
 * Integration test setup.
 *
 * Direction of travel for this suite:
 * - keep the app, middleware, routes, and database package real
 * - fake only true external boundaries like JWT verification or third-party HTTP
 *
 * DATABASE_URL is loaded from `.env.test.local` when present, otherwise
 * `.env.development.local` for local development convenience.
 */

import { resolve } from 'path';
import { loadDatabaseEnv } from '../../packages/test-utils/src';

import {
  registerProvider,
  createMockProvider,
} from '../../apps/api/src/services/llm';

loadDatabaseEnv(resolve(__dirname, '../..'));

// Register mock LLM provider for all integration tests
// Real Gemini/OpenAI calls would be flaky and expensive in CI/local runs
registerProvider(createMockProvider('gemini'));

// Set a generous timeout for integration tests
jest.setTimeout(30_000);
