// ---------------------------------------------------------------------------
// webhook-idempotency-purge — retention-cutoff tests
//
// Pins the load-bearing retention math for both purge steps:
//   1. webhook_idempotency_keys — 30-day floor (BUG-672 retention policy).
//   2. feedback_retry_queue — 7-day floor (F-090: orphaned rows carry user
//      feedback free-text; a flipped comparison or wrong unit would either
//      leave PII in the table indefinitely or purge live retry rows early).
// Both assertions verify the DELETE targets the right table, compares with
// strict less-than, and binds a cutoff of exactly now - retention window.
// ---------------------------------------------------------------------------

const mockGetStepDatabase = jest.fn();

jest.mock('../helpers' /* gc1-allow: Inngest step DB boundary */, () => {
  const actual = jest.requireActual(
    '../helpers',
  ) as typeof import('../helpers');
  return {
    ...actual,
    getStepDatabase: () => mockGetStepDatabase(),
  };
});

import { feedbackRetryQueue, webhookIdempotencyKeys } from '@eduagent/database';
import { webhookIdempotencyPurge } from './webhook-idempotency-purge';
import { createInngestStepRunner } from '../../test-utils/inngest-step-runner';

const DAY_MS = 24 * 60 * 60 * 1000;

// Walks a drizzle WHERE expression (cycle-safe) collecting operator text and
// bound Date params, so the test can pin the comparison direction and the
// cutoff value without coupling to drizzle internals beyond queryChunks.
function extractOperatorsAndDates(node: unknown): {
  text: string;
  dates: Date[];
} {
  const visited = new Set<object>();
  const textParts: string[] = [];
  const dates: Date[] = [];
  const visit = (current: unknown): void => {
    if (current == null) return;
    if (typeof current === 'string') {
      textParts.push(current);
      return;
    }
    if (current instanceof Date) {
      dates.push(current);
      return;
    }
    if (typeof current !== 'object') return;
    if (visited.has(current as object)) return;
    visited.add(current as object);
    for (const value of Object.values(current as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else {
        visit(value);
      }
    }
  };
  visit(node);
  return { text: textParts.join(' '), dates };
}

type DeleteCall = { table: unknown; whereExpr: unknown };

function stubPurgeDb() {
  const deleteCalls: DeleteCall[] = [];
  const db = {
    delete: (table: unknown) => ({
      where: (whereExpr: unknown) => ({
        returning: async () => {
          deleteCalls.push({ table, whereExpr });
          return [];
        },
      }),
    }),
  };
  mockGetStepDatabase.mockReturnValue(db);
  return { deleteCalls };
}

describe('webhookIdempotencyPurge — retention cutoffs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-06-12T03:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function execute() {
    const { step } = createInngestStepRunner();
    const handler = (webhookIdempotencyPurge as any).fn;
    return handler({ step });
  }

  it('purges webhook_idempotency_keys strictly older than 30 days', async () => {
    const { deleteCalls } = stubPurgeDb();

    await execute();

    const call = deleteCalls.find((c) => c.table === webhookIdempotencyKeys);
    expect(call).toBeDefined();
    const { text, dates } = extractOperatorsAndDates(call!.whereExpr);
    expect(text).toContain('<');
    expect(dates).toHaveLength(1);
    expect(dates[0]!.getTime()).toBe(Date.now() - 30 * DAY_MS);
  });

  it('[F-090] purges feedback_retry_queue rows strictly older than 7 days', async () => {
    const { deleteCalls } = stubPurgeDb();

    await execute();

    const call = deleteCalls.find((c) => c.table === feedbackRetryQueue);
    expect(call).toBeDefined();
    const { text, dates } = extractOperatorsAndDates(call!.whereExpr);
    // Strict less-than on created_at: rows younger than the floor survive.
    expect(text).toContain('<');
    expect(dates).toHaveLength(1);
    expect(dates[0]!.getTime()).toBe(Date.now() - 7 * DAY_MS);
  });

  it('reports both purge outcomes in the function return', async () => {
    stubPurgeDb();

    const result = await execute();

    expect(result).toMatchObject({
      status: 'completed',
      deletedCount: 0,
      feedbackRetry: { deletedCount: 0 },
    });
  });
});
