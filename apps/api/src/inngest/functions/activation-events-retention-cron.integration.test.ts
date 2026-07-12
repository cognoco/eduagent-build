/**
 * Integration: activation_events 90-day retention purge + 121-day SLA signal
 * [WI-1859 / OPQ-68].
 *
 * Exercises the real delete path against a real database. No mocks of the
 * database, repository, or schema. activation_events.profileId is nullable
 * (pre-signup funnel rows), so rows are seeded directly with an eventType and
 * a unique dedupeKey — no person/subject chain needed. Rows are scoped by a
 * per-run anonymousId + dedupeKey prefix so the survivor read and cleanup see
 * only this run's seed, not ambient data.
 *
 * Red-green-revert (AC-5): both tests drive purgeAgedActivationEvents, which
 * contains the `.delete(...)`. Removing that delete makes the aged row survive
 * (deletedCount === 0) and both tests go red; restoring it makes them pass.
 * These files SKIP locally without DATABASE_URL and are gated in CI.
 */

import { resolve } from 'path';
import { eq, like } from 'drizzle-orm';
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

async function cleanupByPrefix(database: Database): Promise<void> {
  await database
    .delete(activationEvents)
    .where(like(activationEvents.dedupeKey, `${DEDUPE_PREFIX}%`));
}

let db: Database;

beforeAll(async () => {
  db = createDatabase(requireDatabaseUrl());
  await cleanupByPrefix(db);
});

afterAll(async () => {
  await cleanupByPrefix(db);
});

describe('activation_events retention purge (integration) [WI-1859]', () => {
  it('deletes rows older than 90 days and leaves newer rows untouched', async () => {
    const now = new Date();

    // 100 days old → past the 90-day window → deleted.
    const oldId = await insertRowAged(
      db,
      new Date(now.getTime() - 100 * DAY_MS),
      'old',
    );
    // 5 days old → inside the window → kept.
    const recentId = await insertRowAged(
      db,
      new Date(now.getTime() - 5 * DAY_MS),
      'recent',
    );

    const result = await purgeAgedActivationEvents(db, now);
    expect(result.deletedCount).toBeGreaterThanOrEqual(1);

    const ids = await survivorIds(db);
    expect(ids).toContain(recentId);
    expect(ids).not.toContain(oldId);
  });

  it('flags rows past the 121-day SLA (delayed signal) and deletes them', async () => {
    const now = new Date();

    // 130 days old → past the 121-day SLA → counted delayed AND deleted.
    const slaBreachId = await insertRowAged(
      db,
      new Date(now.getTime() - 130 * DAY_MS),
      'sla-breach',
    );
    // 100 days old → past 90-day retention, within 121-day SLA → deleted, not
    // an SLA breach.
    const midBandId = await insertRowAged(
      db,
      new Date(now.getTime() - 100 * DAY_MS),
      'mid-band',
    );
    // 80 days old → inside the retention window → kept.
    const freshId = await insertRowAged(
      db,
      new Date(now.getTime() - 80 * DAY_MS),
      'fresh',
    );

    const result = await purgeAgedActivationEvents(db, now);

    // At least our seeded 130-day row breaches the 121-day SLA (global count,
    // so assert the floor, not an exact value against ambient data).
    expect(result.delayedCount).toBeGreaterThanOrEqual(1);
    expect(result.deletedCount).toBeGreaterThanOrEqual(2);

    const ids = await survivorIds(db);
    expect(ids).toContain(freshId);
    expect(ids).not.toContain(slaBreachId);
    expect(ids).not.toContain(midBandId);
  });
});
