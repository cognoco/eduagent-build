import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';
import {
  createDatabase,
  accounts,
  profiles,
  supportMessages,
} from '@eduagent/database';
import { eq, and } from 'drizzle-orm';
import { recordOutboxSpillover, type OutboxSpilloverEntry } from './spillover';

loadDatabaseEnv(resolve(__dirname, '../../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

async function seedProfile(suffix = '') {
  const db = createIntegrationDb();
  const [account] = await db
    .insert(accounts)
    .values({
      clerkUserId: `integ-spill-${suffix}-${Date.now()}`,
      email: `spill-${suffix}-${Date.now()}@test.local`,
    })
    .returning();
  const [profile] = await db
    .insert(profiles)
    .values({
      accountId: account!.id,
      displayName: `Spillover Test ${suffix}`,
      birthYear: 2010,
      isOwner: true,
    })
    .returning();
  return { db, profile: profile! };
}

function makeEntry(
  id: string,
  overrides: Partial<OutboxSpilloverEntry> = {}
): OutboxSpilloverEntry {
  return {
    id,
    flow: 'session',
    surfaceKey: 'chat-input',
    content: `Test message ${id}`,
    attempts: 3,
    firstAttemptedAt: new Date().toISOString(),
    ...overrides,
  };
}

const hasDb = !!process.env.DATABASE_URL;
const describeIf = hasDb ? describe : describe.skip;

describeIf('recordOutboxSpillover (integration)', () => {
  it('inserts entries and returns correct written count', async () => {
    const { db, profile } = await seedProfile('write');
    const entries = [makeEntry('entry-a1'), makeEntry('entry-a2')];

    const result = await recordOutboxSpillover(db, profile.id, entries);

    expect(result).toEqual({ written: 2 });

    const rows = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.profileId, profile.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.clientId).sort()).toEqual([
      'entry-a1',
      'entry-a2',
    ]);
  });

  it('duplicate entries are idempotent — second call returns { written: 0 }', async () => {
    const { db, profile } = await seedProfile('idem');
    const entries = [makeEntry('entry-b1')];

    const first = await recordOutboxSpillover(db, profile.id, entries);
    expect(first).toEqual({ written: 1 });

    const second = await recordOutboxSpillover(db, profile.id, entries);
    expect(second).toEqual({ written: 0 });

    const rows = await db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.profileId, profile.id));
    expect(rows).toHaveLength(1);
  });

  it('different profileIds can have entries with the same clientId without conflict', async () => {
    const { db, profile: profileA } = await seedProfile('cross-a');
    const { profile: profileB } = await seedProfile('cross-b');
    const sharedClientId = 'entry-shared-c1';

    const resultA = await recordOutboxSpillover(db, profileA.id, [
      makeEntry(sharedClientId),
    ]);
    const resultB = await recordOutboxSpillover(db, profileB.id, [
      makeEntry(sharedClientId),
    ]);

    expect(resultA).toEqual({ written: 1 });
    expect(resultB).toEqual({ written: 1 });

    const rowsA = await db
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.profileId, profileA.id),
          eq(supportMessages.clientId, sharedClientId)
        )
      );
    const rowsB = await db
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.profileId, profileB.id),
          eq(supportMessages.clientId, sharedClientId)
        )
      );

    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
  });
});
