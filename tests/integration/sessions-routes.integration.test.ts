/**
 * Integration: Sessions routes — security break tests
 *
 * Exercises the real session routes through the full app + real database.
 * JWT verification and Inngest are the only mocked boundaries.
 *
 * C5 break test: PATCH /v1/sessions/:sessionId/clear-continuation-depth
 * must return 404 when the sessionId belongs to a different profile.
 * Verifies that clearContinuationDepth uses profileId scoping and does
 * not update rows owned by another profile.
 */

import { eq } from 'drizzle-orm';
import { learningSessions } from '@eduagent/database';

import { buildIntegrationEnv, cleanupAccounts } from './helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
  getIntegrationDb,
  seedLearningSession,
  seedSubject,
} from './route-fixtures';
import { app } from '../../apps/api/src/index';

const TEST_ENV = buildIntegrationEnv();

const USER_A = {
  userId: 'integration-sessions-user-a',
  email: 'integration-sessions-a@integration.test',
};
const USER_B = {
  userId: 'integration-sessions-user-b',
  email: 'integration-sessions-b@integration.test',
};

// jest.mock is hoisted; capture the send spy via module.__esModule access
// rather than a closure to avoid TDZ. Tests that need to assert on send
// can import the mocked module directly.
jest.mock('../../apps/api/src/inngest/client', () => ({
  inngest: {
    send: jest.fn(),
    createFunction: jest.fn().mockImplementation((config: { id?: string }) => {
      const id = config?.id ?? 'mock-inngest-function';
      const fn = jest.fn();
      (fn as unknown as { getConfig: () => unknown[] }).getConfig = () => [
        { id, name: id, triggers: [], steps: {} },
      ];
      return fn;
    }),
  },
}));

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanupAccounts({
    emails: [USER_A.email, USER_B.email],
    clerkUserIds: [USER_A.userId, USER_B.userId],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [USER_A.email, USER_B.email],
    clerkUserIds: [USER_A.userId, USER_B.userId],
  });
});

describe('PATCH /v1/sessions/:sessionId/clear-continuation-depth', () => {
  it('returns 404 when sessionId belongs to a different profile', async () => {
    // Seed profile A and profile B (separate accounts / clerk users)
    const profileA = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER_A,
      displayName: 'Profile A',
      birthYear: 2000,
    });
    const profileB = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: USER_B,
      displayName: 'Profile B',
      birthYear: 2001,
    });

    // Create a subject and session owned by profile B
    const subjectB = await seedSubject(profileB.id, 'Physics');
    const sessionId = await seedLearningSession({
      profileId: profileB.id,
      subjectId: subjectB.id,
      overrides: {
        metadata: {
          continuationDepth: 2,
          continuationOpenerActive: true,
          continuationOpenerStartedExchange: 1,
        },
      },
    });

    // Hit the endpoint as profile A — must get 404, not 200
    const res = await app.request(
      `/v1/sessions/${sessionId}/clear-continuation-depth`,
      {
        method: 'PATCH',
        headers: buildAuthHeaders(
          { sub: USER_A.userId, email: USER_A.email },
          profileA.id
        ),
      },
      TEST_ENV
    );

    expect(res.status).toBe(404);

    // Verify no rows were mutated — profile B's session metadata is unchanged
    const db = getIntegrationDb();
    const session = await db.query.learningSessions.findFirst({
      where: eq(learningSessions.id, sessionId),
    });

    expect(session).not.toBeUndefined();
    const metadata = session!.metadata as Record<string, unknown> | null;
    // continuationDepth must still be present — the update must not have run
    expect(metadata).not.toBeNull();
    expect((metadata as Record<string, unknown>)['continuationDepth']).toBe(2);
  });
});
