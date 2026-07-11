import { resolve } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import {
  blockedSafetyDailyBuckets,
  blockedSafetyDigestReceipts,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import {
  listUndeliveredClosedBlockedSafetyBuckets,
  recordBlockedSafetyDigestEvent,
} from './blocked-safety-digest';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

const BUCKET_DATE = '2099-12-31';
const NOW = new Date(`${BUCKET_DATE}T23:59:59.000Z`);
const eventIds = [
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
];

describe('[WI-1691] blocked-safety digest atomic dedupe (integration)', () => {
  let db: Database;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for integration tests');
    }
    db = createDatabase(process.env.DATABASE_URL);
  });

  async function cleanup() {
    await db
      .delete(blockedSafetyDigestReceipts)
      .where(inArray(blockedSafetyDigestReceipts.eventId, eventIds));
    await db
      .delete(blockedSafetyDailyBuckets)
      .where(eq(blockedSafetyDailyBuckets.bucketDate, BUCKET_DATE));
  }

  beforeEach(cleanup);
  afterAll(cleanup);

  it('counts one concurrent replay once and two distinct IDs twice in the same UTC bucket', async () => {
    const duplicateEvent = {
      name: 'app/safety.dangerous_procedure_blocked' as const,
      eventId: eventIds[0]!,
      timestamp: NOW.toISOString(),
    };

    const duplicateResults = await Promise.all([
      recordBlockedSafetyDigestEvent(db, duplicateEvent, NOW),
      recordBlockedSafetyDigestEvent(db, duplicateEvent, NOW),
    ]);
    expect(duplicateResults.filter((result) => result.recorded)).toHaveLength(
      1,
    );

    await Promise.all(
      eventIds.slice(1).map((eventId) =>
        recordBlockedSafetyDigestEvent(
          db,
          {
            name: 'app/safety.minor_pii_echo_redacted',
            eventId,
            timestamp: NOW.toISOString(),
          },
          NOW,
        ),
      ),
    );

    const receipts = await db
      .select()
      .from(blockedSafetyDigestReceipts)
      .where(inArray(blockedSafetyDigestReceipts.eventId, eventIds));
    expect(receipts).toHaveLength(3);

    const [bucket] = await db
      .select()
      .from(blockedSafetyDailyBuckets)
      .where(eq(blockedSafetyDailyBuckets.bucketDate, BUCKET_DATE));
    expect(bucket).toMatchObject({
      dangerousProcedureBlockedCount: 1,
      minorPiiEchoRedactedCount: 2,
      suitabilityBlockedCount: 0,
    });
  });

  it('loads only undelivered buckets after their UTC date closes', async () => {
    await recordBlockedSafetyDigestEvent(
      db,
      {
        name: 'app/safety.suitability_blocked',
        eventId: eventIds[0]!,
        timestamp: NOW.toISOString(),
      },
      NOW,
    );

    await expect(
      listUndeliveredClosedBlockedSafetyBuckets(db, BUCKET_DATE),
    ).resolves.toEqual([]);
    await expect(
      listUndeliveredClosedBlockedSafetyBuckets(db, '2100-01-01'),
    ).resolves.toHaveLength(1);

    await db
      .update(blockedSafetyDailyBuckets)
      .set({ deliveredAt: new Date('2100-01-01T00:15:00.000Z') })
      .where(eq(blockedSafetyDailyBuckets.bucketDate, BUCKET_DATE));
    await expect(
      listUndeliveredClosedBlockedSafetyBuckets(db, '2100-01-01'),
    ).resolves.toEqual([]);
  });
});
