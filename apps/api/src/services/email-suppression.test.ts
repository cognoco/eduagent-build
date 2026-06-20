// ---------------------------------------------------------------------------
// Email suppression service — co-located unit tests.
//
// Route-level integration (webhook → suppression row → send-path skip) lives in
// routes/resend-webhook.test.ts. These tests pin the service contract directly:
//   - suppressEmail normalises + persists, is idempotent, and escalates (not
//     silently swallows) a DB failure while still returning 'unavailable'.
//   - isEmailSuppressed reports true/false from the store and fails OPEN (false)
//     with escalation on a DB failure.
// ---------------------------------------------------------------------------

import { emailSuppressions } from '@eduagent/database';
import type { Database } from '@eduagent/database';

const mockCaptureException = jest.fn();
jest.mock(
  './sentry' /* gc1-allow: unit test asserts captureException escalation on DB failure */,
  () => {
    const actual = jest.requireActual('./sentry') as typeof import('./sentry');
    return {
      ...actual,
      captureException: (...args: unknown[]) => mockCaptureException(...args),
    };
  },
);

import { suppressEmail, isEmailSuppressed } from './email-suppression';

interface SuppressionRow {
  email: string;
  reason: string;
  emailId: string | null;
}

/** Fake DB backed by an in-memory map, gated on table identity. */
function makeDb() {
  const store = new Map<string, SuppressionRow>();
  const db = {
    insert(table: unknown) {
      if (table !== emailSuppressions) {
        throw new Error('unexpected insert target in fake DB');
      }
      let pending: SuppressionRow | null = null;
      const builder = {
        values(vals: SuppressionRow) {
          pending = {
            email: vals.email,
            reason: vals.reason,
            emailId: vals.emailId ?? null,
          };
          return builder;
        },
        // Awaited directly (no .returning()); make it thenable so
        // `await db.insert(...).values(...).onConflictDoNothing(...)` resolves.
        // ON CONFLICT DO NOTHING → first write wins, repeat is a no-op.
        onConflictDoNothing(_o: unknown) {
          return {
            then(resolve: (v: undefined) => void) {
              if (pending && !store.has(pending.email)) {
                store.set(pending.email, pending);
              }
              resolve(undefined);
            },
          };
        },
      };
      return builder;
    },
    select(_cols: unknown) {
      return {
        from(table: unknown) {
          if (table !== emailSuppressions) {
            throw new Error('unexpected select target in fake DB');
          }
          const q = {
            where(_p: unknown) {
              // The fake can't introspect the drizzle eq() expression; the
              // caller only ever looks one address up at a time, so the test
              // seeds exactly the address(es) under test.
              return q;
            },
            async limit(_n: number) {
              return [...store.values()].map((r) => ({ email: r.email }));
            },
          };
          return q;
        },
      };
    },
    __store: store,
  };
  return db;
}

/** Fake DB whose every call throws, to drive the failure/escalation paths. */
function makeThrowingDb(): Database {
  return {
    insert() {
      throw new Error('db down');
    },
    select() {
      throw new Error('db down');
    },
  } as unknown as Database;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('suppressEmail', () => {
  it('normalises the address and persists a row, returning "suppressed"', async () => {
    const db = makeDb();
    const result = await suppressEmail(
      db as unknown as Database,
      'Dead.Address@Example.com',
      'hard_bounce',
      'eid_1',
    );

    expect(result).toBe('suppressed');
    expect(db.__store.get('dead.address@example.com')).toEqual({
      email: 'dead.address@example.com',
      reason: 'hard_bounce',
      emailId: 'eid_1',
    });
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('is idempotent — a repeat suppression for the same address is a no-op', async () => {
    const db = makeDb();
    await suppressEmail(
      db as unknown as Database,
      'repeat@example.com',
      'hard_bounce',
      'eid_first',
    );
    await suppressEmail(
      db as unknown as Database,
      'repeat@example.com',
      'complaint',
      'eid_second',
    );

    expect(db.__store.size).toBe(1);
    // First write wins (ON CONFLICT DO NOTHING).
    expect(db.__store.get('repeat@example.com')).toMatchObject({
      reason: 'hard_bounce',
      emailId: 'eid_first',
    });
  });

  it('returns "unavailable" and escalates (not swallows) a DB failure', async () => {
    const result = await suppressEmail(
      makeThrowingDb(),
      'x@example.com',
      'complaint',
      null,
    );

    expect(result).toBe('unavailable');
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'email_suppression.persist_failed',
          reason: 'complaint',
        }),
      }),
    );
  });

  it('does not put the raw recipient address in the Sentry extra (bystander PII)', async () => {
    await suppressEmail(
      makeThrowingDb(),
      'pii@example.com',
      'hard_bounce',
      null,
    );

    const [, ctx] = mockCaptureException.mock.calls[0] as [
      unknown,
      { extra?: Record<string, unknown> },
    ];
    expect(JSON.stringify(ctx.extra)).not.toContain('pii@example.com');
  });
});

describe('isEmailSuppressed', () => {
  it('returns true for an address present in the store', async () => {
    const db = makeDb();
    await suppressEmail(
      db as unknown as Database,
      'gone@example.com',
      'hard_bounce',
      null,
    );

    await expect(
      isEmailSuppressed(db as unknown as Database, 'gone@example.com'),
    ).resolves.toBe(true);
  });

  it('returns false for an address that was never suppressed', async () => {
    const db = makeDb(); // empty store
    await expect(
      isEmailSuppressed(db as unknown as Database, 'never-bounced@example.com'),
    ).resolves.toBe(false);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('fails OPEN (false) and escalates on a DB failure', async () => {
    await expect(
      isEmailSuppressed(makeThrowingDb(), 'x@example.com'),
    ).resolves.toBe(false);

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        extra: expect.objectContaining({
          context: 'email_suppression.lookup_failed',
        }),
      }),
    );
  });
});
