/**
 * Integration: Webhook idempotency claim — BUG-676 / [OBS-WI-01]
 *
 * Pins the 3-way return contract of `claimWebhookId` against the real
 * `webhook_idempotency_keys` table (composite PK `(source, webhook_id)`):
 *   - 'claimed'     — first delivery
 *   - 'replay'      — a concurrent / earlier delivery already claimed
 *   - 'unavailable' — the DB call failed; caller decides the fallback
 *
 * No mocks of internal services or the database. The 'unavailable' path is
 * exercised with a *genuine* Postgres error (a poisoned transaction), not an
 * internal stub — DB unavailability is the only way this branch is reached and
 * we reproduce it with the real driver. Sentry's `captureException` is the one
 * external boundary and is a no-op in the test environment.
 */

import { and, eq, sql } from 'drizzle-orm';
import {
  webhookIdempotencyKeys,
  createDatabase,
  type Database,
} from '@eduagent/database';
import { loadDatabaseEnv } from '@eduagent/test-utils';
import { resolve } from 'path';

import { claimWebhookId } from './webhook-idempotency';

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

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

function createIntegrationDb() {
  return createDatabase(requireDatabaseUrl());
}

// ---------------------------------------------------------------------------
// Seed helpers — unique prefix so parallel test files don't collide
// ---------------------------------------------------------------------------

const PREFIX = 'integration-webhook-idempotency';
const SOURCE_A = `${PREFIX}-stripe`;
const SOURCE_B = `${PREFIX}-revenuecat`;

async function cleanupTestKeys() {
  const db = createIntegrationDb();
  await db
    .delete(webhookIdempotencyKeys)
    .where(sql`${webhookIdempotencyKeys.source} LIKE ${`${PREFIX}-%`}`);
}

async function countKey(source: string, webhookId: string): Promise<number> {
  const db = createIntegrationDb();
  const rows = await db
    .select({ webhookId: webhookIdempotencyKeys.webhookId })
    .from(webhookIdempotencyKeys)
    .where(
      and(
        eq(webhookIdempotencyKeys.source, source),
        eq(webhookIdempotencyKeys.webhookId, webhookId),
      ),
    );
  return rows.length;
}

beforeEach(async () => {
  await cleanupTestKeys();
});

afterAll(async () => {
  await cleanupTestKeys();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('claimWebhookId (integration) [OBS-WI-01]', () => {
  it("returns 'claimed' for a first delivery and persists the row", async () => {
    const db = createIntegrationDb();
    const webhookId = `${PREFIX}-evt-claimed`;

    const outcome = await claimWebhookId(db, SOURCE_A, webhookId);

    expect(outcome).toBe('claimed');
    expect(await countKey(SOURCE_A, webhookId)).toBe(1);
  });

  it("returns 'replay' for a duplicate delivery without inserting a second row", async () => {
    const db = createIntegrationDb();
    const webhookId = `${PREFIX}-evt-replay`;

    const first = await claimWebhookId(db, SOURCE_A, webhookId);
    const second = await claimWebhookId(db, SOURCE_A, webhookId);

    expect(first).toBe('claimed');
    expect(second).toBe('replay');
    expect(await countKey(SOURCE_A, webhookId)).toBe(1);
  });

  it('serializes concurrent claims of the same key to exactly one winner', async () => {
    const db = createIntegrationDb();
    const webhookId = `${PREFIX}-evt-race`;

    const [a, b] = await Promise.all([
      claimWebhookId(db, SOURCE_A, webhookId),
      claimWebhookId(db, SOURCE_A, webhookId),
    ]);

    const outcomes = [a, b].sort();
    expect(outcomes).toEqual(['claimed', 'replay']);
    expect(await countKey(SOURCE_A, webhookId)).toBe(1);
  });

  it('dedups on the (source, webhookId) pair — same id, different source both claim', async () => {
    const db = createIntegrationDb();
    const webhookId = `${PREFIX}-evt-shared-id`;

    const fromStripe = await claimWebhookId(db, SOURCE_A, webhookId);
    const fromRevenuecat = await claimWebhookId(db, SOURCE_B, webhookId);

    expect(fromStripe).toBe('claimed');
    expect(fromRevenuecat).toBe('claimed');
    expect(await countKey(SOURCE_A, webhookId)).toBe(1);
    expect(await countKey(SOURCE_B, webhookId)).toBe(1);
  });

  it("returns 'unavailable' when the DB call fails (real aborted transaction, no mock)", async () => {
    const db = createIntegrationDb();
    const webhookId = `${PREFIX}-evt-unavailable`;
    let outcome: 'claimed' | 'replay' | 'unavailable' | undefined;

    await db
      .transaction(async (tx) => {
        // Poison the transaction with a genuine Postgres error
        // (division_by_zero). Postgres then aborts the transaction, so the
        // next statement — claimWebhookId's INSERT — fails for real and the
        // service's catch path returns 'unavailable'. No internal mock.
        try {
          await tx.execute(sql`SELECT 1 / 0`);
        } catch {
          // expected — the transaction is now in the aborted state
        }

        outcome = await claimWebhookId(
          tx as unknown as Database,
          SOURCE_A,
          webhookId,
        );

        // Force a clean ROLLBACK of the already-aborted transaction.
        throw new Error('__rollback__');
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error) || err.message !== '__rollback__') {
          throw err;
        }
      });

    expect(outcome).toBe('unavailable');
    // The failed claim must not have leaked a row.
    expect(await countKey(SOURCE_A, webhookId)).toBe(0);
  });
});
