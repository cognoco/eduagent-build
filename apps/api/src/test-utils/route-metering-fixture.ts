/// <reference types="jest" />

// Internal mock to be replaced by real-DB integration tests under the C1
// mock-inventory plan (docs/_archive/plans/done/2026-05-04-c1-mock-inventory/). When touching: extend
// in-memory state rather than stubbing additional services, and surface
// contract drift loudly (see fallback branches below) instead of silently
// returning empty rows.

type BillingTier = 'free' | 'plus' | 'family' | 'pro';
type BillingStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';

type DbMethod = (...args: unknown[]) => unknown;

type MutableDb = Record<string, unknown> & {
  query?: object;
  insert?: DbMethod;
  select?: DbMethod;
  update?: DbMethod;
  execute?: DbMethod;
  transaction?: DbMethod;
};

type RouteMeteringFixtureOptions = {
  accountId: string;
  profileId: string;
  subscriptionId?: string;
  quotaPoolId?: string;
  tier?: BillingTier;
  status?: BillingStatus;
  monthlyLimit?: number;
  usedThisMonth?: number;
  dailyLimit?: number | null;
  usedToday?: number;
  topUpCreditsRemaining?: number;
  notificationLogCount?: number;
  ownsProfile?: boolean;
};

type FixtureState = Required<
  Omit<
    RouteMeteringFixtureOptions,
    | 'dailyLimit'
    | 'topUpCreditsRemaining'
    | 'notificationLogCount'
    | 'ownsProfile'
  >
> & {
  dailyLimit: number | null;
  topUpCreditsRemaining: number;
  notificationLogCount: number;
  ownsProfile: boolean;
};

function buildDefaultState(options: RouteMeteringFixtureOptions): FixtureState {
  return {
    accountId: options.accountId,
    profileId: options.profileId,
    subscriptionId: options.subscriptionId ?? 'sub-seeded-route-test',
    quotaPoolId: options.quotaPoolId ?? 'qp-seeded-route-test',
    tier: options.tier ?? 'free',
    status: options.status ?? 'active',
    monthlyLimit: options.monthlyLimit ?? 500,
    usedThisMonth: options.usedThisMonth ?? 10,
    dailyLimit: options.dailyLimit ?? null,
    usedToday: options.usedToday ?? 0,
    topUpCreditsRemaining: options.topUpCreditsRemaining ?? 0,
    notificationLogCount: options.notificationLogCount ?? 0,
    ownsProfile: options.ownsProfile ?? true,
  };
}

export function createRouteMeteringFixture(
  db: MutableDb,
  options: RouteMeteringFixtureOptions,
) {
  const actualDb = jest.requireActual(
    '@eduagent/database',
  ) as typeof import('@eduagent/database');

  const originalQuery = db.query;
  const originalInsert =
    typeof db.insert === 'function'
      ? db.insert.bind(db)
      : () => {
          throw new Error('Expected mock db.insert to exist');
        };
  const originalUpdate =
    typeof db.update === 'function'
      ? db.update.bind(db)
      : () => {
          throw new Error('Expected mock db.update to exist');
        };

  const state = buildDefaultState(options);
  const defaults = buildDefaultState(options);

  const buildQuotaPoolRow = () => ({
    id: state.quotaPoolId,
    subscriptionId: state.subscriptionId,
    monthlyLimit: state.monthlyLimit,
    usedThisMonth: state.usedThisMonth,
    dailyLimit: state.dailyLimit,
    usedToday: state.usedToday,
    cycleResetAt: new Date('2026-06-01T00:00:00.000Z'),
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
  });

  const subscriptionAccessor = {
    findFirst: jest.fn(async () => ({
      id: state.subscriptionId,
      accountId: state.accountId,
      tier: state.tier,
      status: state.status,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      trialEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelledAt: null,
      lastStripeEventTimestamp: null,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    })),
  };

  const quotaPoolAccessor = {
    findFirst: jest.fn(async () => buildQuotaPoolRow()),
  };

  const topUpCreditsAccessor = {
    findFirst: jest.fn().mockResolvedValue(undefined),
    findMany: jest.fn().mockResolvedValue([]),
  };

  db.query = new Proxy(originalQuery ?? {}, {
    get(target, prop, receiver) {
      if (prop === 'subscriptions') return subscriptionAccessor;
      if (prop === 'quotaPools') return quotaPoolAccessor;
      if (prop === 'topUpCredits') return topUpCreditsAccessor;
      return Reflect.get(target, prop, receiver);
    },
  });

  const selectImpl = jest.fn().mockImplementation(() => {
    let selectedTable: unknown;
    const chain: Record<string, jest.Mock> = {} as Record<string, jest.Mock>;
    const resolveRows = async () => {
      if (selectedTable === actualDb.topUpCredits) {
        return [{ total: state.topUpCreditsRemaining }];
      }

      if (selectedTable === actualDb.profiles) {
        return state.ownsProfile ? [{ id: state.profileId }] : [];
      }

      if (selectedTable === actualDb.notificationLog) {
        return Array.from({ length: state.notificationLogCount }, (_, i) => ({
          id: `notification-log-${i + 1}`,
          profileId: state.profileId,
          type: 'dictation_review',
          sentAt: new Date(),
        }));
      }

      return [];
    };

    chain.from = jest.fn().mockImplementation((table: unknown) => {
      selectedTable = table;
      return chain;
    });
    chain.where = jest.fn().mockReturnValue(chain);
    chain.innerJoin = jest.fn().mockReturnValue(chain);
    chain.orderBy = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockImplementation(() => resolveRows());
    (chain as Record<string, unknown>).then = (
      onfulfilled?: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => resolveRows().then(onfulfilled, onrejected);

    return chain;
  });

  const insertImpl = jest.fn().mockImplementation((table: unknown) => {
    if (table === actualDb.notificationLog) {
      return {
        values: jest.fn().mockImplementation(async () => {
          state.notificationLogCount += 1;
          return undefined;
        }),
      };
    }

    return originalInsert(table);
  });

  const updateImpl = jest.fn().mockImplementation((table: unknown) => {
    if (table === actualDb.quotaPools) {
      return {
        set: jest
          .fn()
          .mockImplementation((setValues: Record<string, unknown>) => {
            let applied = false;
            // Rows are plain values (never thenables) — the prior implementation
            // returned `[quotaPoolAccessor.findFirst()]` (a Promise) and relied
            // on Promise.all to flatten it. That made the contract implicit and
            // brittle. Build the row synchronously here so callers get
            // unwrapped data on the first await.
            let rows: ReturnType<typeof buildQuotaPoolRow>[] = [];

            const apply = () => {
              if (applied) return rows;
              applied = true;

              if ('usedThisMonth' in setValues && 'usedToday' in setValues) {
                const underMonthly = state.usedThisMonth < state.monthlyLimit;
                const underDaily =
                  state.dailyLimit === null ||
                  state.usedToday < state.dailyLimit;

                if (!underMonthly || !underDaily) {
                  rows = [];
                  return rows;
                }

                state.usedThisMonth += 1;
                state.usedToday += 1;
                rows = [buildQuotaPoolRow()];
                return rows;
              }

              if ('usedToday' in setValues) {
                const underDaily =
                  state.dailyLimit === null ||
                  state.usedToday < state.dailyLimit;

                if (!underDaily) {
                  rows = [];
                  return rows;
                }

                state.usedToday += 1;
                rows = [buildQuotaPoolRow()];
                return rows;
              }

              // Contract drift: production decrement helper passed a setValues
              // shape we don't recognise (neither monthly+daily nor daily-only).
              // Throw loudly so the test fails fast instead of papering over
              // a divergence between this fixture and the real helper.
              throw new Error(
                `route-metering-fixture: unrecognised quotaPools update shape — keys=[${Object.keys(
                  setValues,
                ).join(', ')}]. ` +
                  'Either extend the fixture to handle this case or update the production helper.',
              );
            };

            return {
              where: jest.fn().mockImplementation(() => {
                apply();
                return {
                  returning: jest.fn().mockImplementation(async () => apply()),
                };
              }),
            };
          }),
      };
    }

    if (table === actualDb.topUpCredits) {
      return {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      };
    }

    return originalUpdate(table);
  });

  db.select = selectImpl;
  db.insert = insertImpl;
  db.update = updateImpl;
  db.execute = jest.fn().mockResolvedValue([]);
  db.transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: MutableDb) => unknown) =>
      fn({
        ...db,
        query: db.query,
        select: selectImpl,
        insert: insertImpl,
        update: updateImpl,
        execute: jest.fn().mockResolvedValue([]),
      }),
    );

  return {
    reset() {
      Object.assign(state, buildDefaultState(defaults));
    },
    setQuotaUsage(usedThisMonth: number, usedToday = state.usedToday) {
      state.usedThisMonth = usedThisMonth;
      state.usedToday = usedToday;
    },
    setNotificationLogCount(count: number) {
      state.notificationLogCount = count;
    },
    setOwnsProfile(ownsProfile: boolean) {
      state.ownsProfile = ownsProfile;
    },
    state,
  };
}
