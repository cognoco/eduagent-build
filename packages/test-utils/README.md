# @eduagent/test-utils

Shared test utilities for all workspace packages. Provides fixture IDs, JWT signing helpers, a database mock, and environment loading.

## Exports

### Fixture IDs (`lib/fixture-ids.ts`)

Canonical RFC 9562 v4 UUIDs for use in tests. Import instead of hardcoding UUIDs:

```typescript
import { TEST_PROFILE_ID, TEST_SUBJECT_ID, TEST_SESSION_ID } from '@eduagent/test-utils';
```

Available: `TEST_PROFILE_ID`, `TEST_PROFILE_ID_2`, `TEST_PROFILE_ID_3`, `TEST_ACCOUNT_ID`, `TEST_SESSION_ID`, `TEST_SESSION_ID_2`, `TEST_SUBJECT_ID`, `TEST_SUBJECT_ID_2`, `TEST_TOPIC_ID`, `TEST_TOPIC_ID_2`, `TEST_TOPIC_ID_3`, `TEST_BOOK_ID`, `TEST_SHELF_ID`, `TEST_VOCABULARY_ID`, `TEST_NONEXISTENT_ID`.

### JWT Signing (`auth/test-jwt.ts`)

Real-crypto JWT signing utilities for route and unit tests (Clerk JWKS simulation):

```typescript
import { signTestJwt, TEST_JWKS, TEST_KID } from '@eduagent/test-utils';

const token = await signTestJwt({ sub: 'user_123', profileId: TEST_PROFILE_ID });
```

### Database Mock (`lib/neon-mock.ts`)

Drizzle-compatible mock for unit tests:

```typescript
import { createMockDb } from '@eduagent/test-utils';

const db = createMockDb();
```

Use for unit tests only. Integration tests must use a real Neon database — never mock the database in integration tests.

### Environment Loading (`lib/load-database-env.ts`)

Loads `DATABASE_URL` and related vars from `.env.test` for integration tests:

```typescript
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

// Pass the monorepo root so .env.test.local / .env.development.local resolve correctly.
loadDatabaseEnv(resolve(__dirname, '../..'));
```

## Rules

- This package is a `devDependency` — never import it from production code.
- GC1 ratchet: do not add new `jest.mock('./...')` or `jest.mock('../...')` relative imports in test files. Use `jest.requireActual()` with targeted overrides instead.
