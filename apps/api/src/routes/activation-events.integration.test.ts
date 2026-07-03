/**
 * Integration: POST /v1/activation-events + signup_completed touchpoint (WI-1504)
 *
 * Exercises the real app + real database + real (signed) Clerk JWTs, mirroring
 * the pattern in celebrations.integration.test.ts. Only the Clerk JWKS
 * endpoint is mocked (external boundary).
 *
 * Covers:
 *   - the client-driven ingest route, pre-account (profileId null) and
 *     post-account (profileId set)
 *   - rejection of server-owned event types via the ingest route (422)
 *   - occurrenceId-based dedupe
 *   - the signup_completed server touchpoint fired from POST /v1/profiles
 */

import { eq } from 'drizzle-orm';
import { activationEvents } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from '../../../../tests/integration/helpers';
import {
  buildAuthHeaders,
  createProfileViaRoute,
} from '../../../../tests/integration/route-fixtures';
import {
  installFetchInterceptor,
  restoreFetch,
  addFetchHandler,
} from '../../../../tests/integration/fetch-interceptor';
import { mockClerkJWKS } from '../../../../tests/integration/external-mocks';

import { app } from '../index';
import { clearJWKSCache } from '../middleware/jwt';

const nativeFetch = globalThis.fetch;
installFetchInterceptor();
mockClerkJWKS();
addFetchHandler(/\.neon\.tech/, (url, init) => nativeFetch(url, init));

const TEST_ENV = buildIntegrationEnv();
const AUTH_USER_ID = 'integration-activation-events-user';
const AUTH_EMAIL = 'integration-activation-events@integration.test';

const db = createIntegrationDb();

async function findByEventTypeAndProfile(
  eventType: string,
  profileId: string | null,
) {
  const rows = await db
    .select()
    .from(activationEvents)
    .where(eq(activationEvents.eventType, eventType));
  return rows.filter((r) => r.profileId === profileId);
}

async function cleanupAnonymousId(anonymousId: string): Promise<void> {
  await db
    .delete(activationEvents)
    .where(eq(activationEvents.anonymousId, anonymousId));
}

beforeEach(async () => {
  clearJWKSCache();
  await cleanupAccounts({ emails: [AUTH_EMAIL], clerkUserIds: [AUTH_USER_ID] });
});

afterAll(async () => {
  await cleanupAccounts({ emails: [AUTH_EMAIL], clerkUserIds: [AUTH_USER_ID] });
  restoreFetch();
});

describe('Integration: POST /v1/activation-events', () => {
  it('records a pre-account app_opened event with profileId null', async () => {
    const anonymousId = `anon-${AUTH_USER_ID}-pre-account`;
    await cleanupAnonymousId(anonymousId);

    const res = await app.request(
      '/v1/activation-events',
      {
        method: 'POST',
        headers: {
          ...buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'app_opened',
          anonymousId,
          platform: 'ios',
          route: 'app_launch',
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ recorded: true });

    const rows = await db
      .select()
      .from(activationEvents)
      .where(eq(activationEvents.anonymousId, anonymousId));
    expect(rows).toHaveLength(1);
    expect(rows[0].profileId).toBeNull();
    expect(rows[0].eventType).toBe('app_opened');

    await cleanupAnonymousId(anonymousId);
  });

  it('rejects a server-owned eventType (422)', async () => {
    const anonymousId = `anon-${AUTH_USER_ID}-rejected`;
    await cleanupAnonymousId(anonymousId);

    const res = await app.request(
      '/v1/activation-events',
      {
        method: 'POST',
        headers: {
          ...buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'first_session_completed',
          anonymousId,
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(422);

    const rows = await db
      .select()
      .from(activationEvents)
      .where(eq(activationEvents.anonymousId, anonymousId));
    expect(rows).toHaveLength(0);
  });

  it('dedupes repeated review_card_seen calls by occurrenceId, but records distinct cards', async () => {
    const anonymousId = `anon-${AUTH_USER_ID}-cards`;
    await cleanupAnonymousId(anonymousId);

    const postCard = (cardId: string) =>
      app.request(
        '/v1/activation-events',
        {
          method: 'POST',
          headers: {
            ...buildAuthHeaders({ sub: AUTH_USER_ID, email: AUTH_EMAIL }),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            eventType: 'review_card_seen',
            anonymousId,
            occurrenceId: cardId,
          }),
        },
        TEST_ENV,
      );

    // Same card twice → dedupes to one row.
    const res1 = await postCard('card-a');
    const res2 = await postCard('card-a');
    // Distinct card → separate row.
    const res3 = await postCard('card-b');

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res3.status).toBe(201);

    const rows = await db
      .select()
      .from(activationEvents)
      .where(eq(activationEvents.anonymousId, anonymousId));
    expect(rows).toHaveLength(2);

    await cleanupAnonymousId(anonymousId);
  });
});

describe('Integration: signup_completed touchpoint', () => {
  it('records signup_completed when the owner identity graph is created via POST /v1/profiles', async () => {
    const profile = await createProfileViaRoute({
      app,
      env: TEST_ENV,
      user: { userId: AUTH_USER_ID, email: AUTH_EMAIL },
      displayName: 'Activation Tester',
      birthYear: 2000,
    });

    const rows = await findByEventTypeAndProfile(
      'signup_completed',
      profile.id,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].profileShape).toBe('solo_owner');
    expect(rows[0].route).toBe('POST /profiles');
  });
});
