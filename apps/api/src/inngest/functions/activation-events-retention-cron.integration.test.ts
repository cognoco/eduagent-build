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
 * Red-green-revert (AC-5): the first two tests drive purgeAgedActivationEvents,
 * which contains the delete. Neutralizing that delete makes the aged rows
 * survive, so the survivor assertions (`not.toContain(oldId)`) go red; restoring
 * it makes them pass. The seeds live inside the transaction, so the proof does
 * not depend on any ambient row existing. The third test drives the CRON WRAPPER
 * and goes red when the emission calls are neutralized (see its own docblock).
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
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';
import * as helpers from '../helpers';
import * as sentry from '../../services/sentry';
import {
  ACTIVATION_RETENTION_DELAYED_EVENT,
  activationEventsRetentionCron,
  purgeAgedActivationEvents,
} from './activation-events-retention-cron';

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

/**
 * AC-5: the delayed-signal EMISSION path, driven through the CRON WRAPPER.
 *
 * The two tests above call purgeAgedActivationEvents directly, so they prove the
 * delayed COUNT is computed — not that anything is ever emitted. The emission
 * (captureException + the counts-only step.sendEvent) lives in the wrapper's
 * `if (result.delayedCount > 0)` branch, which a direct call never reaches: a
 * regression that silently stopped emitting the signal would pass those tests.
 * This test runs the wrapper's own handler so that branch actually executes.
 *
 * Seams — the wrapper is real, the database is real, the purge is real:
 *   - `step` is the shared Inngest step double. It runs each step callback for
 *     real (no `runResults` overrides), so the purge below is genuine SQL; it
 *     records sendEvent calls instead of dispatching to Inngest.
 *   - `sentry.captureException` — external boundary, spied.
 *   - `helpers.getStepDatabase` — redirected to the transaction handle. This is
 *     forced, not a convenience: getStepDatabase() opens a FRESH connection from
 *     DATABASE_URL, which by definition cannot see rows seeded inside this
 *     test's uncommitted transaction. It returns the same real Postgres — only
 *     the handle changes — so no SQL, count, or branch is faked. It is a spy on
 *     the real module, not a module-level mock, so it stays GC1-clean.
 *
 * DATA SAFETY: if that redirect ever failed to intercept, the handler would run
 * the GLOBAL purge on a committed connection and delete ambient activation_events
 * rows this test never seeded — the rollback would protect nothing, because the
 * deletes would happen outside this transaction. The tripwire below asserts the
 * redirect took effect BEFORE the handler is invoked, so a broken seam fails the
 * test instead of destroying data.
 *
 * Red-green-revert: deleting the captureException call and the step.sendEvent
 * call from the wrapper's delayed branch makes this test go red on both the spy
 * and the payload assertions; restoring them makes it pass. delayedCount is a
 * GLOBAL count, so the seeded 130-day row guarantees the branch is ENTERED
 * regardless of ambient data; what the assertions pin is that entering it
 * actually emits.
 */
describe('activation_events retention cron wrapper — delayed signal (integration) [WI-1859 AC-5]', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits the Sentry delayed signal and a counts-only event when a row breaches the 121-day SLA', async () => {
    await withRollback(async (tx) => {
      // 130 days old → past the 121-day SLA → guarantees the wrapper's
      // delayed branch is entered.
      const slaBreachId = await insertRowAged(
        tx,
        new Date(Date.now() - 130 * DAY_MS),
        'wrapper-sla-breach',
      );

      const captureExceptionSpy = jest
        .spyOn(sentry, 'captureException')
        .mockImplementation(() => undefined);
      jest
        .spyOn(helpers, 'getStepDatabase')
        .mockReturnValue(tx as unknown as Database);

      // Tripwire — see DATA SAFETY above. Must run before the handler.
      expect(helpers.getStepDatabase()).toBe(tx);

      const { step, sendEventCalls, runNames } = createInngestStepRunner();
      const handler = (
        activationEventsRetentionCron as unknown as {
          fn: (ctx: { step: unknown }) => Promise<{
            status: string;
            deleted: number;
            eligible: number;
            delayed: number;
          }>;
        }
      ).fn;

      const result = await handler({ step });

      // The handler's purge ran on the TRANSACTION handle, not a committed
      // connection. Only this transaction can see the row seeded above, so its
      // deletion is what proves the redirect reached the wrapper's own binding.
      // The tripwire before the call proves the module export is patched; this
      // proves the HANDLER consumed it. Without this assertion, a redirect that
      // silently missed could run the global purge against committed data, then
      // satisfy every assertion below from ambient delayed rows while the seeded
      // row sat untouched — green test, real rows deleted.
      expect(await survivorIds(tx)).not.toContain(slaBreachId);

      // The wrapper reached the delayed branch off a real, seeded, aged row.
      expect(result.delayed).toBeGreaterThanOrEqual(1);
      expect(runNames()).toEqual(
        expect.arrayContaining(['capture-delayed-activation-retention']),
      );

      // AC-3, half 1: captureException, tagged for the SLO surface.
      expect(captureExceptionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('past the 121-day retention SLA'),
        }),
        expect.objectContaining({
          tags: {
            surface: 'activation-events-retention',
            signal: 'delayed',
          },
        }),
      );

      // AC-3, half 2: the counts-only Inngest event.
      const delayedEvents = sendEventCalls.filter(
        (call) => call.name === 'notify-activation-retention-delayed',
      );
      expect(delayedEvents).toHaveLength(1);
      const payload = delayedEvents[0]!.payload as {
        name: string;
        data: Record<string, unknown>;
      };
      expect(payload.name).toBe(ACTIVATION_RETENTION_DELAYED_EVENT);
      expect(payload.data['delayedCount']).toBe(result.delayed);
      expect(payload.data['slaDays']).toBe(121);
      expect(typeof payload.data['timestamp']).toBe('string');

      // AC-3, half 2 (the "no PII" half): counts/threshold/timestamp and
      // NOTHING else. Key-set equality is what catches a future field leak —
      // an added profileId/anonymousId/eventType would fail here even if every
      // assertion above still passed.
      expect(Object.keys(payload.data).sort()).toEqual([
        'delayedCount',
        'slaDays',
        'timestamp',
      ]);
      // And no row metadata reached the wire: the seeded row's own identifiers
      // must appear nowhere in the serialized payload.
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain(slaBreachId);
      expect(serialized).not.toContain(ANON_ID);
      expect(serialized).not.toContain(DEDUPE_PREFIX);
    });
  });
});
