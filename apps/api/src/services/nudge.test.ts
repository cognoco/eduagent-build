// ---------------------------------------------------------------------------
// nudge.test.ts
//
// Unit tests for createNudge, listUnreadNudges, markNudgeRead,
// markAllNudgesRead. Security-critical paths:
//   - Rate limiting (max 4 nudges / 24h per child, shared across all senders)
//   - Consent gating (must be CONSENTED)
//   - Parent access guard (family link required)
//   - Quiet hours (21:00–07:00 in recipient tz → suppress push, still insert)
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import {
  ConsentRequiredError,
  RateLimitedError,
  ForbiddenError,
} from '@eduagent/schemas';
import type { NudgeTemplate } from '@eduagent/schemas';
import {
  createNudge,
  listUnreadNudges,
  markNudgeRead,
  markAllNudgesRead,
} from './nudge';

// ---------------------------------------------------------------------------
// Internal module stubs (gc1-allow: sibling services with their own suites)
//
// GC6-defer: 3 pre-existing internal mocks below (./family-access, ./consent,
// ./notifications) are NOT burned down in this WI-803 edit. They are
// requireActual partial overrides of sibling service BOUNDARIES (each with its
// own dedicated suite) woven through the pre-existing createNudge fixtures;
// converting them to real DB-backed wiring would balloon this focused
// family_links→guardianship flip-blocker far beyond its scope. Tracked for the
// GC6 burn-down lane, not this WI. (The WI-803-introduced guardianship mock WAS
// removed — the v2 path drives the real helpers via the DB stub; see below.)
// ---------------------------------------------------------------------------

const mockAssertParentAccess = jest.fn();
const mockGetConsentStatus = jest.fn();

jest.mock(
  './family-access' /* gc1-allow: nudge.test stubs parent-access guard; family-access has its own dedicated test suite */,
  () => ({
    ...jest.requireActual('./family-access'),
    assertParentAccess: (...args: unknown[]) => mockAssertParentAccess(...args),
  }),
);

jest.mock(
  './consent' /* gc1-allow: nudge.test stubs consent lookup; consent service has its own test suite */,
  () => ({
    ...jest.requireActual('./consent'),
    getConsentStatus: (...args: unknown[]) => mockGetConsentStatus(...args),
  }),
);

// [WI-803] No module mock for identity-v2/guardianship: the v2 path's real
// getGuardianPersonIds is driven through the DB stub — it calls
// db.query.guardianship.findMany, which makeV2Db stubs so the real function
// runs (no gc1-allow escape needed).

// ---------------------------------------------------------------------------
// Internal module stub — notifications has its own suite; we stub it here to
// isolate nudge logic from the push-delivery path.
// ---------------------------------------------------------------------------

const mockSendPushNotification = jest.fn();

jest.mock(
  './notifications' /* gc1-allow: nudge.test stubs push delivery; notifications service has its own dedicated test suite */,
  () => ({
    ...jest.requireActual('./notifications'),
    sendPushNotification: (...args: unknown[]) =>
      mockSendPushNotification(...args),
  }),
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FROM_PROFILE_ID = 'aaaaaaaa-0000-4000-a000-000000000001';
const TO_PROFILE_ID = 'bbbbbbbb-0000-4000-b000-000000000002';
const NUDGE_ID = 'cccccccc-0000-4000-c000-000000000003';
const ACCOUNT_ID = 'dddddddd-0000-4000-d000-000000000004';

const BASE_NOW = new Date('2026-05-11T12:00:00.000Z'); // 12:00 UTC — well outside quiet hours

function makeInsertedRow(
  overrides?: Partial<{
    id: string;
    fromProfileId: string;
    toProfileId: string;
    template: string;
    createdAt: Date;
    readAt: Date | null;
  }>,
) {
  return {
    id: overrides?.id ?? NUDGE_ID,
    fromProfileId: overrides?.fromProfileId ?? FROM_PROFILE_ID,
    toProfileId: overrides?.toProfileId ?? TO_PROFILE_ID,
    template: (overrides?.template ?? 'you_got_this') as NudgeTemplate,
    createdAt: overrides?.createdAt ?? BASE_NOW,
    readAt: overrides?.readAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// DB stub builder
//
// Supports the following Drizzle call chains used by nudge.ts:
//   1. db.select({ count }).from(nudges).where(...)           → rate-limit count
//   2. db.insert(nudges).values(...).returning()              → nudge insert
//   3. db.query.profiles.findFirst(...)                       → profile lookup (×2)
//   4. db.query.accounts.findFirst(...)                       → timezone lookup
//   5. db.select({...}).from(nudges).innerJoin(...).where(..).orderBy(...) → list
//   6. db.update(nudges).set(...).where(...).returning(...)   → mark read
// ---------------------------------------------------------------------------

/** Sentinel value — when passed as fromProfile/toProfile, the DB mock
 *  returns `undefined` from that findFirst call (simulating a missing row).
 *  Using `null` avoids the JS destructuring-default trap where passing
 *  `undefined` triggers the parameter default. */
const NO_PROFILE = null as unknown as {
  displayName: string;
  accountId: string;
};

interface MakeDbOptions {
  /** Row count returned by the rate-limit SELECT count(*) query. */
  nudgeCount?: number;
  /** Row returned by db.insert().returning() */
  insertedRow?: ReturnType<typeof makeInsertedRow>;
  /** fromProfile returned by db.query.profiles.findFirst.
   *  Pass NO_PROFILE to simulate a missing row (findFirst returns undefined). */
  fromProfile?: { displayName: string; accountId: string } | null;
  /** toProfile returned by db.query.profiles.findFirst.
   *  Pass NO_PROFILE to simulate a missing row (findFirst returns undefined). */
  toProfile?: { displayName: string; accountId: string } | null;
  /** Account timezone returned by db.query.accounts.findFirst (child/recipient) */
  accountTimezone?: string | null;
  /** Account timezone for the parent (sender). When set, child and parent get
   *  separate timezone values; otherwise both share accountTimezone. */
  parentAccountTimezone?: string;
  /** Rows returned by the list query (innerJoin chain) */
  listRows?: ReturnType<typeof makeInsertedRow>[];
  /** Rows returned by update().returning() */
  updateRows?: { id: string }[];
  /**
   * Controls whether isGdprProcessingAllowedV2 returns true (allowed) or false
   * (blocked). When true (default), consentGrant is seeded as CONSENTED.
   * When false, consentGrant is seeded as WITHDRAWN so the GDPR gate blocks.
   */
  consentAllowed?: boolean;
}

function makeDb({
  nudgeCount = 0,
  insertedRow = makeInsertedRow(),
  fromProfile = { displayName: 'Parent Name', accountId: ACCOUNT_ID },
  toProfile = { displayName: 'Child Name', accountId: ACCOUNT_ID },
  accountTimezone = 'UTC',
  parentAccountTimezone,
  listRows = [],
  updateRows = [],
  consentAllowed = true,
}: MakeDbOptions = {}): Database {
  // ── update chain ──────────────────────────────────────────────────────────
  const updateReturning = jest.fn().mockResolvedValue(updateRows);
  const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
  const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
  const updateFn = jest.fn().mockReturnValue({ set: updateSet });

  // ── insert chain ──────────────────────────────────────────────────────────
  const insertReturning = jest.fn().mockResolvedValue([insertedRow]);
  const insertValues = jest
    .fn()
    .mockReturnValue({ returning: insertReturning });
  const insertFn = jest.fn().mockReturnValue({ values: insertValues });

  // ── select chain (rate-limit count AND list query share the same head) ─────
  // The rate-limit count call terminates at .where(...)
  // The list query continues: .from().innerJoin().innerJoin().where().orderBy()
  // The v2 person/org queries: .from().where().limit(1) and
  //   .from().innerJoin().where().limit(1)
  // We build a single fluent chain that handles all shapes.

  const selectOrderBy = jest.fn().mockResolvedValue(listRows);
  // .limit(1) on a post-innerJoin where — used by the org-timezone query
  // (db.select({timezone}).from(membership).innerJoin(org).where(...).limit(1)).
  // Return the recipient's timezone so quiet-hours logic sees the right value.
  const selectLimitAfterList = jest
    .fn()
    .mockResolvedValue(
      accountTimezone !== null ? [{ timezone: accountTimezone }] : [],
    );
  const selectWhereList = jest
    .fn()
    .mockReturnValue({ orderBy: selectOrderBy, limit: selectLimitAfterList });
  const selectInnerJoin2 = jest
    .fn()
    .mockReturnValue({ where: selectWhereList });
  const selectInnerJoin1 = jest
    .fn()
    .mockReturnValue({ innerJoin: selectInnerJoin2, where: selectWhereList });

  // rate-limit .where() returns the count row directly (no further chaining).
  // [WI-586] v2 also calls .where().limit(1) for person displayName lookup
  // (db.select({displayName}).from(person).where(...).limit(1)).
  // We make .where() return a thenable that also has .limit().
  const fromDisplayName = fromProfile?.displayName ?? null;
  const selectLimitAfterCount = jest
    .fn()
    .mockResolvedValue(
      fromDisplayName !== null ? [{ displayName: fromDisplayName }] : [],
    );
  const selectWhereCount = jest.fn().mockReturnValue(
    Object.assign(Promise.resolve([{ count: nudgeCount }]), {
      limit: selectLimitAfterCount,
    }),
  );

  // .from() returns an object that can serve ALL shapes depending on what
  // the caller chains next. For nudge.ts the rate-limit call chains .where()
  // and the list call chains .innerJoin(). We cover both by returning an
  // object with all possible next methods.
  const selectFrom = jest.fn().mockReturnValue({
    where: selectWhereCount,
    innerJoin: selectInnerJoin1,
  });

  const selectFn = jest.fn().mockReturnValue({ from: selectFrom });

  // ── query relational API ───────────────────────────────────────────────────
  // profiles.findFirst is called twice (fromProfile, toProfile) in sequence.
  // null is the NO_PROFILE sentinel → resolve with undefined (missing row).
  const profilesFindFirst = jest
    .fn()
    .mockResolvedValueOnce(fromProfile ?? undefined)
    .mockResolvedValueOnce(toProfile ?? undefined);

  const accountsFindFirst = jest.fn();
  if (parentAccountTimezone !== undefined) {
    accountsFindFirst
      .mockResolvedValueOnce(
        accountTimezone !== null ? { timezone: accountTimezone } : undefined,
      )
      .mockResolvedValueOnce({ timezone: parentAccountTimezone });
  } else {
    accountsFindFirst.mockResolvedValue(
      accountTimezone !== null ? { timezone: accountTimezone } : undefined,
    );
  }

  // ── transaction wrapper ───────────────────────────────────────────────────
  // createNudge wraps count-check + insert in db.transaction(). The tx object
  // receives the same select/insert/execute API as the outer db.
  const executeFn = jest.fn().mockResolvedValue(undefined);
  interface TxShape {
    select: typeof selectFn;
    insert: typeof insertFn;
    execute: typeof executeFn;
  }
  const tx: TxShape = {
    select: selectFn,
    insert: insertFn,
    execute: executeFn,
  };
  const transactionFn = jest
    .fn()
    .mockImplementation((cb: (tx: TxShape) => Promise<unknown>) => cb(tx));

  // ── GDPR-gate seams (isGdprProcessingAllowedV2) ───────────────────────────
  // isGdprProcessingAllowedV2 reads:
  //   1. db.query.membership.findFirst  → resolves organizationId
  //   2. db.query.consentGrant.findFirst → current grant (max grantedAt)
  //   3. db.query.consentRequest.findFirst → request row (prevents lazy minGrantedAt select)
  // consentAllowed=true → grant with withdrawnAt:null → status CONSENTED → allowed
  // consentAllowed=false → grant with withdrawnAt set → status WITHDRAWN → blocked
  const consentGrantRow = consentAllowed
    ? { granted: true, withdrawnAt: null, grantedAt: new Date() }
    : { granted: true, withdrawnAt: new Date(), grantedAt: new Date() };

  return {
    select: selectFn,
    insert: insertFn,
    update: updateFn,
    transaction: transactionFn,
    query: {
      profiles: { findFirst: profilesFindFirst },
      accounts: { findFirst: accountsFindFirst },
      membership: {
        findFirst: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      consentGrant: { findFirst: jest.fn().mockResolvedValue(consentGrantRow) },
      consentRequest: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'requested',
          requestedAt: new Date(),
          createdAt: new Date(),
        }),
      },
      // listUnreadNudges calls getGuardianPersonIds → db.query.guardianship.findMany.
      // Seed one guardian (the fromProfileId) so the early-return guard passes.
      guardianship: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ guardianPersonId: FROM_PROFILE_ID }]),
      },
    },
  } as unknown as Database;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Happy-path defaults for the internal stubs
  mockAssertParentAccess.mockResolvedValue(undefined);
  mockGetConsentStatus.mockResolvedValue('CONSENTED');
  mockSendPushNotification.mockResolvedValue({
    sent: true,
    ticketId: 'ticket-1',
  });
});

// ---------------------------------------------------------------------------
// createNudge
// ---------------------------------------------------------------------------

describe('createNudge', () => {
  describe('happy path', () => {
    it('creates a nudge and sends a push notification', async () => {
      const db = makeDb();
      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: BASE_NOW,
      });

      expect(result.pushSent).toBe(true);
      expect(result.nudge).toMatchObject({
        id: NUDGE_ID,
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        fromDisplayName: 'Parent Name',
        readAt: null,
      });
      // createdAt should be the ISO string of BASE_NOW
      expect(result.nudge.createdAt).toBe(BASE_NOW.toISOString());
    });

    it('passes skipDailyCap: true to sendPushNotification', async () => {
      const db = makeDb();
      await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'proud_of_you',
        now: BASE_NOW,
      });

      expect(mockSendPushNotification).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          profileId: TO_PROFILE_ID,
          title: 'Parent Name sent you a nudge',
          body: 'Proud of you',
          type: 'nudge',
          data: expect.objectContaining({
            nudgeId: NUDGE_ID,
            fromDisplayName: 'Parent Name',
            templateKey: 'proud_of_you',
          }),
        }),
        { skipDailyCap: true },
      );
    });

    it('falls back to "Your parent" when fromProfile has no displayName', async () => {
      const db = makeDb({ fromProfile: NO_PROFILE });
      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'thinking_of_you',
        now: BASE_NOW,
      });

      expect(result.nudge.fromDisplayName).toBe('Your parent');
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        db,
        expect.objectContaining({ title: 'Your parent sent you a nudge' }),
        { skipDailyCap: true },
      );
    });

    it('reflects pushSent: false when sendPushNotification returns sent: false', async () => {
      mockSendPushNotification.mockResolvedValue({
        sent: false,
        reason: 'no_push_token',
      });
      const db = makeDb();
      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'quick_session',
        now: BASE_NOW,
      });
      expect(result.pushSent).toBe(false);
    });
  });

  // ── Parent access guard ───────────────────────────────────────────────────

  describe('parent access', () => {
    it('[BREAK] throws ForbiddenError when assertParentAccess rejects', async () => {
      mockAssertParentAccess.mockRejectedValue(
        new ForbiddenError('You do not have access to this child profile.'),
      );
      const db = makeDb();

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('calls assertParentAccess before any DB write', async () => {
      mockAssertParentAccess.mockRejectedValue(new ForbiddenError());
      const db = makeDb();

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ForbiddenError);

      // insert must never have been called
      expect(db.insert as jest.Mock).not.toHaveBeenCalled();
    });
  });

  // ── Consent gating ────────────────────────────────────────────────────────

  describe('consent gating', () => {
    it('[BREAK] throws ConsentRequiredError when consent status is PENDING', async () => {
      const db = makeDb({ consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ConsentRequiredError);
    });

    it('throws ConsentRequiredError when consent status is WITHDRAWN', async () => {
      const db = makeDb({ consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ConsentRequiredError);
    });

    it('throws ConsentRequiredError when consent status is PARENTAL_CONSENT_REQUESTED', async () => {
      const db = makeDb({ consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ConsentRequiredError);
    });

    it('[BREAK] allows nudge when consent status is null (age 17+, no consent_states row)', async () => {
      // Regression: previously `consentStatus !== 'CONSENTED'` rejected the
      // null case, blocking parents from nudging their 17+ linked children
      // (checkConsentRequired returns required:false for age >= 17, so
      // createProfile skips inserting a consent_states row → getConsentStatus
      // resolves null). The fix treats null as "consent not required".
      mockGetConsentStatus.mockResolvedValue(null);
      const db = makeDb();

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: BASE_NOW,
      });

      expect(result.pushSent).toBe(true);
      expect(db.insert as jest.Mock).toHaveBeenCalled();
    });

    it('error carries the expected code CONSENT_REQUIRED', async () => {
      const db = makeDb({ consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    });

    it('does not insert a nudge row when consent check fails', async () => {
      const db = makeDb({ consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ConsentRequiredError);

      expect(db.insert as jest.Mock).not.toHaveBeenCalled();
    });
  });

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('[PARENT-16][BREAK] throws RateLimitedError when nudge count has reached the limit (4)', async () => {
      const db = makeDb({ nudgeCount: 4 });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(RateLimitedError);
    });

    it('throws RateLimitedError when nudge count exceeds the limit', async () => {
      const db = makeDb({ nudgeCount: 5 });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(RateLimitedError);
    });

    it('error carries the expected code NUDGE_RATE_LIMITED', async () => {
      const db = makeDb({ nudgeCount: 4 });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toMatchObject({ code: 'NUDGE_RATE_LIMITED' });
    });

    it('succeeds when nudge count is exactly 3 (one below limit)', async () => {
      const db = makeDb({ nudgeCount: 3 });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).resolves.toMatchObject({ pushSent: true });
    });

    it('does not insert when rate limit is exceeded', async () => {
      const db = makeDb({ nudgeCount: 4 });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(RateLimitedError);

      expect(db.insert as jest.Mock).not.toHaveBeenCalled();
    });
  });

  // ── Quiet hours ───────────────────────────────────────────────────────────

  describe('quiet hours', () => {
    // QUIET_HOURS_START = 21, QUIET_HOURS_END = 7  (hour >= 21 OR hour < 7)

    it('suppresses push but still creates the nudge at 22:00 UTC', async () => {
      const quietNow = new Date('2026-05-11T22:00:00.000Z'); // 22:00 UTC
      const db = makeDb({ accountTimezone: 'UTC' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: quietNow,
      });

      expect(result.pushSent).toBe(false);
      expect(mockSendPushNotification).not.toHaveBeenCalled();
      // Nudge was still inserted
      expect(db.insert as jest.Mock).toHaveBeenCalled();
    });

    it('suppresses push at 06:00 UTC (still before QUIET_HOURS_END=7)', async () => {
      const quietNow = new Date('2026-05-11T06:00:00.000Z');
      const db = makeDb({ accountTimezone: 'UTC' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: quietNow,
      });

      expect(result.pushSent).toBe(false);
      expect(mockSendPushNotification).not.toHaveBeenCalled();
    });

    it('sends push at 07:00 UTC (exactly at QUIET_HOURS_END boundary)', async () => {
      // hour < QUIET_HOURS_END means hour < 7 → hour 7 is NOT suppressed
      const atBoundary = new Date('2026-05-11T07:00:00.000Z');
      const db = makeDb({ accountTimezone: 'UTC' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: atBoundary,
      });

      expect(result.pushSent).toBe(true);
      expect(mockSendPushNotification).toHaveBeenCalled();
    });

    it('suppresses push at 21:00 UTC (exactly at QUIET_HOURS_START boundary)', async () => {
      // hour >= QUIET_HOURS_START means hour >= 21 → hour 21 IS suppressed
      const atBoundary = new Date('2026-05-11T21:00:00.000Z');
      const db = makeDb({ accountTimezone: 'UTC' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: atBoundary,
      });

      expect(result.pushSent).toBe(false);
      expect(mockSendPushNotification).not.toHaveBeenCalled();
    });

    it('sends push at 12:00 UTC (daytime — outside quiet hours)', async () => {
      const db = makeDb({ accountTimezone: 'UTC' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: BASE_NOW, // 12:00 UTC
      });

      expect(result.pushSent).toBe(true);
      expect(mockSendPushNotification).toHaveBeenCalled();
    });

    it('uses recipient timezone for quiet-hours evaluation', async () => {
      // 08:00 UTC = 23:00 America/Los_Angeles (UTC-7 PDT) → quiet hours
      const utcMorning = new Date('2026-05-11T08:00:00.000Z');
      const db = makeDb({ accountTimezone: 'America/Los_Angeles' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: utcMorning,
      });

      expect(result.pushSent).toBe(false);
      expect(mockSendPushNotification).not.toHaveBeenCalled();
    });

    it('sends push when parent is in quiet hours but child is not (child-only check)', async () => {
      // 12:00 UTC = noon in UTC (child → not quiet)
      // 12:00 UTC = 00:00 NZST in Pacific/Auckland (parent → quiet)
      // Push should still be sent because only the child's timezone matters.
      const db = makeDb({
        accountTimezone: 'UTC',
        parentAccountTimezone: 'Pacific/Auckland',
      });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: BASE_NOW, // 12:00 UTC
      });

      expect(result.pushSent).toBe(true);
      expect(mockSendPushNotification).toHaveBeenCalled();
    });

    it('[BREAK] does not throw when recipient timezone is an invalid Intl string', async () => {
      // Regression: Intl.DateTimeFormat throws RangeError for malformed
      // timezone strings ('foo', 'Europe/', etc.). The nudge transaction
      // commits BEFORE isQuietHours runs, so an exception would return 500
      // while the row sits in the DB — every client retry would consume a
      // rate-limit slot. The fix wraps the formatter call in try/catch and
      // returns false (allow push) on failure.
      const db = makeDb({ accountTimezone: 'this-is-not-a-real-timezone' });

      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: BASE_NOW,
      });

      // Insert must have happened (we're past the transaction); push attempted.
      expect(db.insert as jest.Mock).toHaveBeenCalled();
      expect(mockSendPushNotification).toHaveBeenCalled();
      expect(result.pushSent).toBe(true);
    });

    it('defaults to UTC when no account record is found (toProfile has no accountId)', async () => {
      // Without timezone, falls back to UTC. 12:00 UTC → push sent.
      const db = makeDb({ toProfile: NO_PROFILE, accountTimezone: null });
      const result = await createNudge(db, {
        fromProfileId: FROM_PROFILE_ID,
        toProfileId: TO_PROFILE_ID,
        template: 'you_got_this',
        now: BASE_NOW,
      });

      // 12:00 UTC is not quiet hours → push should have been attempted
      expect(mockSendPushNotification).toHaveBeenCalled();
      // result.pushSent follows whatever sendPushNotification returns
      expect(result.pushSent).toBe(true);
    });
  });

  // ── Guard ordering ────────────────────────────────────────────────────────

  describe('guard ordering', () => {
    it('checks parent access before consent', async () => {
      // Both guards fail — the thrown error must be ForbiddenError (parent
      // access is checked first in the source).
      mockAssertParentAccess.mockRejectedValue(new ForbiddenError());
      const db = makeDb({ consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it('checks consent before rate limit', async () => {
      // Both consent and rate-limit fail — consent is checked first.
      const db = makeDb({ nudgeCount: 4, consentAllowed: false });

      await expect(
        createNudge(db, {
          fromProfileId: FROM_PROFILE_ID,
          toProfileId: TO_PROFILE_ID,
          template: 'you_got_this',
          now: BASE_NOW,
        }),
      ).rejects.toThrow(ConsentRequiredError);
    });
  });
});

// ---------------------------------------------------------------------------
// listUnreadNudges
// ---------------------------------------------------------------------------

describe('listUnreadNudges', () => {
  it('returns mapped Nudge objects for unread rows', async () => {
    const row = makeInsertedRow({ id: 'nudge-aaa' });
    const db = makeDb({ listRows: [row] });

    const result = await listUnreadNudges(db, TO_PROFILE_ID);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'nudge-aaa',
      fromProfileId: FROM_PROFILE_ID,
      toProfileId: TO_PROFILE_ID,
      template: 'you_got_this',
      readAt: null,
    });
    // createdAt must be an ISO string
    expect(typeof result[0]?.createdAt).toBe('string');
    expect(result[0]?.createdAt).toBe(BASE_NOW.toISOString());
  });

  it('returns an empty array when there are no unread nudges', async () => {
    const db = makeDb({ listRows: [] });
    const result = await listUnreadNudges(db, TO_PROFILE_ID);
    expect(result).toEqual([]);
  });

  it('returns multiple nudges in the order returned by the query', async () => {
    const rows = [
      makeInsertedRow({ id: 'nudge-1', template: 'you_got_this' }),
      makeInsertedRow({ id: 'nudge-2', template: 'proud_of_you' }),
    ];
    const db = makeDb({ listRows: rows });

    const result = await listUnreadNudges(db, TO_PROFILE_ID);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('nudge-1');
    expect(result[1]?.id).toBe('nudge-2');
  });
});

// ---------------------------------------------------------------------------
// markNudgeRead
// ---------------------------------------------------------------------------

describe('markNudgeRead', () => {
  it('returns 1 when the nudge exists and was unread', async () => {
    const db = makeDb({ updateRows: [{ id: NUDGE_ID }] });
    const count = await markNudgeRead(db, TO_PROFILE_ID, NUDGE_ID);
    expect(count).toBe(1);
  });

  it('returns 0 when the nudge does not exist for this profile', async () => {
    const db = makeDb({ updateRows: [] });
    const count = await markNudgeRead(db, TO_PROFILE_ID, 'nonexistent-id');
    expect(count).toBe(0);
  });

  it('returns 1 on retry of an already-read nudge (idempotent)', async () => {
    // The row exists for this profile (matched by id+toProfileId), so the
    // update returns 1 even though readAt was already set — clients retrying
    // after a network failure should not see 404.
    const db = makeDb({ updateRows: [{ id: NUDGE_ID }] });
    const count = await markNudgeRead(db, TO_PROFILE_ID, NUDGE_ID);
    expect(count).toBe(1);
  });

  it('calls db.update with the correct nudge id and profile id', async () => {
    const db = makeDb({ updateRows: [{ id: NUDGE_ID }] });
    await markNudgeRead(db, TO_PROFILE_ID, NUDGE_ID);
    expect(db.update as jest.Mock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// [WI-803] listUnreadNudges v2 dispatch break tests
//
// AC: flag-on reads guardianship (the REAL getGuardianPersonIds, driven via
// db.query.guardianship.findMany), never family_links. Post-M-DROP the
// family_links INNER JOIN would 500; the v2 path must not touch that table.
// The break tests use a no-family-links DB stub to prove it.
// ---------------------------------------------------------------------------

describe('[WI-803] listUnreadNudges v2 dispatch', () => {
  /**
   * A DB stub exercising the REAL v2 path (no module mock):
   *  - getGuardianPersonIds → db.query.guardianship.findMany (returns
   *    `guardianRows`)
   *  - the nudge read → db.select().from(nudges).innerJoin(profiles).where()…
   * It does NOT stub familyLinks — the legacy path chains innerJoin TWICE, so
   * on this single-innerJoin stub it would fail, simulating post-M-DROP.
   */
  function makeV2Db(
    listRows: ReturnType<typeof makeInsertedRow>[] = [],
    guardianRows: Array<{ guardianPersonId: string }> = [],
  ) {
    const findMany = jest.fn().mockResolvedValue(guardianRows);
    const selectOrderBy = jest.fn().mockResolvedValue(listRows);
    const selectWhere = jest.fn().mockReturnValue({ orderBy: selectOrderBy });
    const selectInnerJoin = jest.fn().mockReturnValue({ where: selectWhere });
    const selectFrom = jest.fn().mockReturnValue({
      innerJoin: selectInnerJoin,
    });
    const selectFn = jest.fn().mockReturnValue({ from: selectFrom });

    return {
      select: selectFn,
      // No familyLinks — any legacy INNER JOIN would miss this mock
      query: {
        guardianship: { findMany },
        profiles: { findFirst: jest.fn().mockResolvedValue(undefined) },
        accounts: { findFirst: jest.fn().mockResolvedValue(undefined) },
      },
    } as unknown as import('@eduagent/database').Database;
  }

  it('[WI-803] post-collapse: always reads guardianship (v2 path is unconditional)', async () => {
    // Post-flag-collapse the flag-off branch is gone; listUnreadNudges always
    // calls getGuardianPersonIds → db.query.guardianship.findMany.
    const db = makeDb({ listRows: [] });
    await listUnreadNudges(db, TO_PROFILE_ID);
    expect(
      (db.query as unknown as { guardianship?: { findMany: jest.Mock } })
        .guardianship,
    ).toBeDefined();
    expect(
      (db.query as unknown as { guardianship: { findMany: jest.Mock } })
        .guardianship.findMany,
    ).toHaveBeenCalled();
  });

  it('[WI-803][BREAK] flag-on: returns empty when no guardians exist (post-M-DROP safe)', async () => {
    const db = makeV2Db([], []);
    const result = await listUnreadNudges(db, TO_PROFILE_ID, {
      identityV2Enabled: true,
    });
    expect(result).toEqual([]);
    // real getGuardianPersonIds drove guardianship.findMany
    expect(
      (db.query.guardianship as unknown as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledTimes(1);
    // No select chain called — early return before the nudge query
    expect(db.select as jest.Mock).not.toHaveBeenCalled();
  });

  it('[WI-803][BREAK] flag-on: returns nudges via guardianship path when guardians exist', async () => {
    const nudgeRow = makeInsertedRow({ id: 'nudge-v2-aaa' });
    const db = makeV2Db([nudgeRow], [{ guardianPersonId: FROM_PROFILE_ID }]);
    const result = await listUnreadNudges(db, TO_PROFILE_ID, {
      identityV2Enabled: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('nudge-v2-aaa');
    expect(
      (db.query.guardianship as unknown as { findMany: jest.Mock }).findMany,
    ).toHaveBeenCalledTimes(1);
    // select chain was called once (no familyLinks INNER JOIN on v2 path)
    expect(db.select as jest.Mock).toHaveBeenCalledTimes(1);
  });

  it('[WI-803] flag-on: does not call familyLinks (post-M-DROP safe)', async () => {
    const db = makeV2Db([], [{ guardianPersonId: FROM_PROFILE_ID }]);
    // The v2 select chain has a SINGLE innerJoin (profiles). The legacy path
    // chains innerJoin twice (profiles + familyLinks); on this stub that second
    // innerJoin is undefined and would throw — so resolving proves the v2 shape.
    await expect(
      listUnreadNudges(db, TO_PROFILE_ID, { identityV2Enabled: true }),
    ).resolves.not.toThrow();
    expect((db.query as { familyLinks?: unknown }).familyLinks).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// markAllNudgesRead
// ---------------------------------------------------------------------------

describe('markAllNudgesRead', () => {
  it('returns the total count of nudges that were marked read', async () => {
    const db = makeDb({
      updateRows: [{ id: 'nudge-1' }, { id: 'nudge-2' }, { id: 'nudge-3' }],
    });
    const count = await markAllNudgesRead(db, TO_PROFILE_ID);
    expect(count).toBe(3);
  });

  it('returns 0 when there are no unread nudges to mark', async () => {
    const db = makeDb({ updateRows: [] });
    const count = await markAllNudgesRead(db, TO_PROFILE_ID);
    expect(count).toBe(0);
  });

  it('calls db.update exactly once', async () => {
    const db = makeDb({ updateRows: [{ id: 'nudge-x' }] });
    await markAllNudgesRead(db, TO_PROFILE_ID);
    expect(db.update as jest.Mock).toHaveBeenCalledTimes(1);
  });
});
