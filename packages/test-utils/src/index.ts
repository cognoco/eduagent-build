/**
 * Test Utilities Package
 *
 * Provides shared testing utilities for workspace projects.
 *
 * @packageDocumentation
 */

export { loadDatabaseEnv } from './lib/load-database-env.js';

// Database mock for unit testing
export { createMockDb } from './lib/neon-mock.js';

// Canonical RFC 9562 v4 UUIDs for tests
export {
  TEST_PROFILE_ID,
  TEST_PROFILE_ID_2,
  TEST_PROFILE_ID_3,
  TEST_ACCOUNT_ID,
  TEST_SESSION_ID,
  TEST_SESSION_ID_2,
  TEST_SUBJECT_ID,
  TEST_SUBJECT_ID_2,
  TEST_TOPIC_ID,
  TEST_TOPIC_ID_2,
  TEST_TOPIC_ID_3,
  TEST_BOOK_ID,
  TEST_SHELF_ID,
  TEST_VOCABULARY_ID,
  TEST_NONEXISTENT_ID,
} from './lib/fixture-ids.js';
