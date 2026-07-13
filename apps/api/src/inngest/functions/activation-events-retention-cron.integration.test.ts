/**
 * Integration: activation_events 90-day retention purge + 121-day SLA signal
 * [WI-1859 / OPQ-68].
 *
 * Exercises the real delete path against a real database. No mocks of the
 * database, repository, or schema. activation_events.profileId is nullable
 * (pre-signup funnel rows), so rows are seeded directly with an eventType and
 * a unique dedupeKey — no person/subject chain needed.
 *
 * ISOLATION — every test runs inside a transaction that is always rolled back
 * (the `test-rollback` sentinel; same harness as
 * tests/integration/profile-isolation.integration.test.ts). This is not
 * cosmetic: purgeAgedActivationEvents is a GLOBAL purge — it deletes every
 * activation_events row past the cutoff, not just this run's seed. Committed,
 * it would destroy ambient funnel telemetry in whatever database DATABASE_URL
 * resolves to. Inside the rollback the purge still runs for real (the delete,
 * the counts, the SLA branch all execute against real Postgres), but nothing it
 * removes is ever committed. A test must not be able to delete data it did not
 * create.
 *
 * Red-green-revert (AC-5): both tests drive purgeAgedActivationEvents, which
 * contains the delete. Neutralizing that delete makes the aged rows survive, so
 * the survivor assertions (`not.toContain(oldId)`) go red; restoring it makes
 * them pass. The seeds live inside the transaction, so the proof does not
 * depend on any ambient row existing.
 *
 * These files SKIP locally without DATABASE_URL and are gated in CI.
 */

import { resolve } from 'path';
import { eq } from 'drizzle-orm';
import {
  createDatabase,
  activationEvents,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { purgeAgedActivationEvents } from './activation-events-retention-cron';

loadDatabaseEnv(resolve(__dirname, '../../../..'));

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create .env.test.local or .env.development.local.',
    );
  }
  return url;
}

const RUN_ID = generateUUIDv7();
const DEDUPE_PREFIX = `integ-activation-retention-${RUN_ID}`;
const ANON_ID = `anon-${DEDUPE_PREFIX}`;
const DAY_MS = 24 * 60 * 60 * 1000;

let db: Database;

beforeAll(() => {
  db = createDatabase(requireDatabaseUrl());
});

/**
 * Run `body` inside a transaction that is always rolled back, so neither the
 * seeded rows nor the global purge's deletes are ever committed.
 *
 * The transaction handle is cast to Database: the two are structurally distinct
 * to TypeScript (packages/database/src/client.ts unifies the driver types with
 * a cast for the same reason) but identical at runtime for the query surface
 * used here. The cast stays in the test — the production signature is not
 * widened for it.
 */
async function withRollback(
  body: (tx: Database) => Promise<void>,
): Promise<void> {
  let assertionsRan = false;
  try {
    await db.transaction(async (tx) => {
      await body(tx as unknown as Database);
      assertionsRan = true;
      throw new Error('test-rollback'); // discards seeds + purge atomically
    });
  } catch (e: unknown) {
    if (!(e instanceof Error && e.message === 'test-rollback')) throw e;
  }
  expect(assertionsRan).toBe(true);
}

async function insertRowAged(
  database: Database,
  createdAt: Date,
  tag: string,
): Promise<string> {
  const [row] = await database
    .insert(activationEvents)
    .values({
      eventType: 'app_opened',
      anonymousId: ANON_ID,
      dedupeKey: `${DEDUPE_PREFIX}-${tag}-${generateUUIDv7()}`,
      // Retention keys on createdAt; keep occurredAt aligned for realism.
      occurredAt: createdAt,
      createdAt,
    })
    .returning({ id: activationEvents.id });
  return row!.id;
}

async function survivorIds(database: Database): Promise<string[]> {
  const rows = await database
    .select({ id: activationEvents.id })
    .from(activationEvents)
    .where(eq(activationEvents.anonymousId, ANON_ID));
  return rows.map((r) => r.id);
}

describe('activation_events retention purge (integration) [WI-1859]', () => {
  it('deletes rows older than 90 days and leaves newer rows untouched', async () => {
    await withRollback(async (tx) => {
      const now = new Date();

      // 100 days old → past the 90-day window → deleted.
      const oldId = await insertRowAged(
        tx,
        new Date(now.getTime() - 100 * DAY_MS),
        'old',
      );
      // 5 days old → inside the window → kept.
      const recentId = await insertRowAged(
        tx,
        new Date(now.getTime() - 5 * DAY_MS),
        'recent',
      );

      const result = await purgeAgedActivationEvents(tx, now);
      expect(result.deletedCount).toBeGreaterThanOrEqual(1);
      // AC-2: counted-eligible and actually-deleted must agree, so the cron
      // takes its info branch rather than the mismatch warn branch. Asserting
      // the equality (not just a floor) is what catches a deletedCount that
      // comes back as a string from the raw-SQL count.
      expect(result.deletedCount).toBe(result.eligibleCount);

      const ids = await survivorIds(tx);
      expect(ids).toContain(recentId);
      expect(ids).not.toContain(oldId);
    });
  });

  it('flags rows past the 121-day SLA (delayed signal) and deletes them', async () => {
    await withRollback(async (tx) => {
      const now = new Date();

      // 130 days old → past the 121-day SLA → counted delayed AND deleted.
      const slaBreachId = await insertRowAged(
        tx,
        new Date(now.getTime() - 130 * DAY_MS),
        'sla-breach',
      );
      // 100 days old → past 90-day retention, within 121-day SLA → deleted, not
      // an SLA breach.
      const midBandId = await insertRowAged(
        tx,
        new Date(now.getTime() - 100 * DAY_MS),
        'mid-band',
      );
      // 80 days old → inside the retention window → kept.
      const freshId = await insertRowAged(
        tx,
        new Date(now.getTime() - 80 * DAY_MS),
        'fresh',
      );

      const result = await purgeAgedActivationEvents(tx, now);

      // At least our seeded 130-day row breaches the 121-day SLA (the count is
      // global, so assert the floor, not an exact value).
      expect(result.delayedCount).toBeGreaterThanOrEqual(1);
      expect(result.deletedCount).toBeGreaterThanOrEqual(2);
      expect(result.deletedCount).toBe(result.eligibleCount);

      const ids = await survivorIds(tx);
      expect(ids).toContain(freshId);
      expect(ids).not.toContain(slaBreachId);
      expect(ids).not.toContain(midBandId);
    });
  });
});
