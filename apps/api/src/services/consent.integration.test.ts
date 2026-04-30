/**
 * Integration: createGrantedConsentState atomicity [BUG-863]
 *
 * Proves rollback against a real database. The consent + family_link writes
 * happen inside `db.transaction(...)`; if the family_link insert fails the
 * FK constraint, BOTH writes must roll back so the child profile is never
 * left in CONSENTED state without a parent link (GDPR/COPPA exposure).
 *
 * Unit tests in consent.test.ts already verify the call shape (single
 * transaction call, error propagates). This test verifies the runtime
 * behaviour against Postgres — the silent neon-http non-atomic fallback
 * was the actual root cause, and only an end-to-end check confirms the
 * driver migration restored ACID semantics.
 */

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  consentStates,
  familyLinks,
  createDatabase,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { createGrantedConsentState } from './consent';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.'
    );
  }
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

const PREFIX = 'integration-consent-863';
const TEST_EMAIL = `${PREFIX}@integration.test`;
const TEST_CLERK = `${PREFIX}-clerk`;
// A UUID that is NEVER seeded — used to trigger the FK violation on
// familyLinks.parent_profile_id and force the transaction to roll back.
const NON_EXISTENT_PARENT_ID = '00000000-0000-0000-0000-000000000000';

async function cleanup() {
  const db = createIntegrationDb();
  const accs = await db.query.accounts.findMany({
    where: inArray(accounts.email, [TEST_EMAIL]),
  });
  if (accs.length > 0) {
    await db.delete(accounts).where(
      inArray(
        accounts.id,
        accs.map((a) => a.id)
      )
    );
  }
}

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createGrantedConsentState atomicity (integration) [BUG-863]', () => {
  it('rolls back the consent_states row when the family_link FK insert fails', async () => {
    const db = createIntegrationDb();
    const [account] = await db
      .insert(accounts)
      .values({ clerkUserId: TEST_CLERK, email: TEST_EMAIL })
      .returning();
    const [child] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Test Child',
        birthYear: 2014,
        isOwner: false,
      })
      .returning();

    // Trigger an FK violation on familyLinks.parent_profile_id mid-transaction.
    // The consent insert succeeds first, then the family_link insert fails —
    // a non-atomic execution would leave the consent row behind.
    await expect(
      createGrantedConsentState(db, child!.id, 'GDPR', NON_EXISTENT_PARENT_ID)
    ).rejects.toThrow();

    // Verify rollback: NO consent_states row exists for this profile. If the
    // transaction was non-atomic, the insert would have already committed
    // before the family_link error and this query would return a row.
    const lingering = await db.query.consentStates.findMany({
      where: eq(consentStates.profileId, child!.id),
    });
    expect(lingering).toHaveLength(0);

    // And no orphan family_link row either.
    const links = await db.query.familyLinks.findMany({
      where: eq(familyLinks.childProfileId, child!.id),
    });
    expect(links).toHaveLength(0);
  });

  it('persists both rows when both inserts succeed', async () => {
    const db = createIntegrationDb();
    const [account] = await db
      .insert(accounts)
      .values({ clerkUserId: TEST_CLERK, email: TEST_EMAIL })
      .returning();
    const [parent] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Parent',
        birthYear: 1985,
        isOwner: true,
      })
      .returning();
    const [child] = await db
      .insert(profiles)
      .values({
        accountId: account!.id,
        displayName: 'Child',
        birthYear: 2014,
        isOwner: false,
      })
      .returning();

    const result = await createGrantedConsentState(
      db,
      child!.id,
      'GDPR',
      parent!.id
    );
    expect(result.status).toBe('CONSENTED');

    const consents = await db.query.consentStates.findMany({
      where: eq(consentStates.profileId, child!.id),
    });
    expect(consents).toHaveLength(1);
    expect(consents[0]!.status).toBe('CONSENTED');

    const links = await db.query.familyLinks.findMany({
      where: eq(familyLinks.childProfileId, child!.id),
    });
    expect(links).toHaveLength(1);
    expect(links[0]!.parentProfileId).toBe(parent!.id);
  });
});
