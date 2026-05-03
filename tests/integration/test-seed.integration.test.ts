/**
 * Integration: Test Seed Endpoints
 *
 * Exercises the real /__test/seed, /__test/reset, and /__test/scenarios routes
 * against the real database.
 *
 * No auth is supplied in this suite on purpose: `/__test/*` is a public path.
 */

import { eq } from 'drizzle-orm';
import { accounts, learningSessions, profiles } from '@eduagent/database';

import {
  buildIntegrationEnv,
  cleanupAccounts,
  createIntegrationDb,
} from './helpers';
import { app } from '../../apps/api/src/index';
import { VALID_SCENARIOS } from '../../apps/api/src/services/test-seed';

const DEV_ENV = buildIntegrationEnv({ ENVIRONMENT: 'development' });
const PROD_ENV = buildIntegrationEnv({ ENVIRONMENT: 'production' });

const LEARNING_EMAIL = 'integration-seed-learning@integration.test';
const RESET_A_EMAIL = 'integration-seed-reset-a@integration.test';
const RESET_B_EMAIL = 'integration-seed-reset-b@integration.test';
const RESET_PREFIX = 'integ-playwright-reset-scope-';
const RESET_PREFIX_EMAIL = `${RESET_PREFIX}target@test.invalid`;
const RESET_OTHER_EMAIL = 'integration-seed-reset-other@integration.test';
const MANUAL_EMAIL = 'integration-seed-manual@integration.test';

async function findAccountByEmail(email: string) {
  const db = createIntegrationDb();
  return db.query.accounts.findFirst({
    where: eq(accounts.email, email),
  });
}

async function findProfile(id: string) {
  const db = createIntegrationDb();
  return db.query.profiles.findFirst({
    where: eq(profiles.id, id),
  });
}

async function findSession(id: string) {
  const db = createIntegrationDb();
  return db.query.learningSessions.findFirst({
    where: eq(learningSessions.id, id),
  });
}

async function seedManualNonSeedAccount() {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: 'manual_non_seed_account',
      email: MANUAL_EMAIL,
    })
    .returning();

  return account!;
}

beforeEach(async () => {
  await cleanupAccounts({
    emails: [
      LEARNING_EMAIL,
      RESET_A_EMAIL,
      RESET_B_EMAIL,
      RESET_PREFIX_EMAIL,
      RESET_OTHER_EMAIL,
      MANUAL_EMAIL,
    ],
  });
});

afterAll(async () => {
  await cleanupAccounts({
    emails: [
      LEARNING_EMAIL,
      RESET_A_EMAIL,
      RESET_B_EMAIL,
      RESET_PREFIX_EMAIL,
      RESET_OTHER_EMAIL,
      MANUAL_EMAIL,
    ],
  });
});

describe('Integration: test-seed routes', () => {
  it('seeds a real scenario and persists the returned account/profile/session chain', async () => {
    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'learning-active',
          email: LEARNING_EMAIL,
        }),
      },
      DEV_ENV
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.scenario).toBe('learning-active');
    expect(body.email).toBe(LEARNING_EMAIL);
    expect(typeof body.accountId).toBe('string');
    expect(typeof body.profileId).toBe('string');
    expect(typeof body.password).toBe('string');
    expect(typeof body.ids.subjectId).toBe('string');
    expect(typeof body.ids.sessionId).toBe('string');

    const account = await findAccountByEmail(LEARNING_EMAIL);
    expect(account).not.toBeUndefined();
    expect(account!.id).toBe(body.accountId);
    expect(account!.clerkUserId.startsWith('clerk_seed_')).toBe(true);

    const profile = await findProfile(body.profileId as string);
    expect(profile).not.toBeUndefined();
    expect(profile!.accountId).toBe(body.accountId);

    const session = await findSession(body.ids.sessionId as string);
    expect(session).not.toBeUndefined();
    expect(session!.status).toBe('active');
  });

  it('rejects invalid scenarios with 400', async () => {
    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'not-a-real-scenario' }),
      },
      DEV_ENV
    );

    expect(res.status).toBe(400);
  });

  it('returns 403 for seed routes in production', async () => {
    const res = await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'onboarding-complete',
          email: LEARNING_EMAIL,
        }),
      },
      PROD_ENV
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('lists the real valid scenario names', async () => {
    const res = await app.request(
      '/v1/__test/scenarios',
      {
        method: 'GET',
      },
      DEV_ENV
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scenarios).toEqual(VALID_SCENARIOS);
  });

  it('resets seeded accounts while leaving non-seed accounts alone', async () => {
    await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'onboarding-complete',
          email: RESET_A_EMAIL,
        }),
      },
      DEV_ENV
    );
    await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'trial-active',
          email: RESET_B_EMAIL,
        }),
      },
      DEV_ENV
    );
    await seedManualNonSeedAccount();

    const resetRes = await app.request(
      '/v1/__test/reset',
      {
        method: 'POST',
      },
      DEV_ENV
    );

    expect(resetRes.status).toBe(200);
    const body = await resetRes.json();
    expect(body.message).toBe('Database reset complete');
    expect(body.deletedCount).toBeGreaterThanOrEqual(2);

    expect(await findAccountByEmail(RESET_A_EMAIL)).toBeUndefined();
    expect(await findAccountByEmail(RESET_B_EMAIL)).toBeUndefined();
    expect(await findAccountByEmail(MANUAL_EMAIL)).not.toBeUndefined();
  });

  it('resets only the requested seeded email prefix when prefix is provided', async () => {
    await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'onboarding-complete',
          email: RESET_PREFIX_EMAIL,
        }),
      },
      DEV_ENV
    );
    await app.request(
      '/v1/__test/seed',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: 'trial-active',
          email: RESET_OTHER_EMAIL,
        }),
      },
      DEV_ENV
    );

    const resetRes = await app.request(
      `/v1/__test/reset?prefix=${encodeURIComponent(RESET_PREFIX)}`,
      {
        method: 'POST',
      },
      DEV_ENV
    );

    expect(resetRes.status).toBe(200);
    const body = await resetRes.json();
    expect(body.message).toBe('Database reset complete');
    expect(body.deletedCount).toBe(1);

    expect(await findAccountByEmail(RESET_PREFIX_EMAIL)).toBeUndefined();
    expect(await findAccountByEmail(RESET_OTHER_EMAIL)).not.toBeUndefined();
  });
});
