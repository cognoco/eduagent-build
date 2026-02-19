/**
 * Test Utilities Package
 *
 * Provides shared testing utilities for workspace projects.
 *
 * @packageDocumentation
 */

export { loadDatabaseEnv } from './lib/load-database-env.js';

// Clerk mocks for API testing
export { createMockClerkUser, createMockClerkJWT } from './lib/clerk-mock.js';
export type { MockClerkUser } from './lib/clerk-mock.js';

// Database mock for unit testing
export { createMockDb } from './lib/neon-mock.js';

// Inngest step mock for background job testing
export { createInngestStepMock } from './lib/inngest-mock.js';
