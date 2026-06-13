import { eq } from 'drizzle-orm';
import {
  coachingCardCache,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type {
  CoachingCard,
  HomeCard,
  HomeCardId,
  HomeCardInteractionType,
  PendingCelebration,
} from '@eduagent/schemas';

const HOME_SURFACE_TTL_MS = 24 * 60 * 60 * 1000;
const HOME_SURFACE_CACHE_KIND = 'home_surface_cache_v1';

type HomeCardInteractionEvent = {
  cardId: HomeCardId;
  interactionType: HomeCardInteractionType;
  occurredAt: string;
};

export type HomeCardInteractionStats = {
  tapsByCardId: Partial<Record<HomeCardId, number>>;
  dismissalsByCardId: Partial<Record<HomeCardId, number>>;
  events: HomeCardInteractionEvent[];
};

export type HomeSurfaceCacheData = {
  kind: typeof HOME_SURFACE_CACHE_KIND;
  cachedAt: string;
  legacyCoachingCard?: CoachingCard;
  rankedHomeCards: HomeCard[];
  coldStart?: boolean;
  interactionStats: HomeCardInteractionStats;
};

export type HomeSurfaceCacheRow = typeof coachingCardCache.$inferSelect;

/**
 * Reducer that computes the next `pendingCelebrations` array from the row's
 * CURRENT (locked) value. Used by celebration writes so the read-dedup-append
 * happens INSIDE the SELECT ... FOR UPDATE window rather than against a stale
 * pre-lock snapshot.
 */
export type PendingCelebrationsReducer = (
  current: PendingCelebration[],
  lockedRow: HomeSurfaceCacheRow | undefined,
) => PendingCelebration[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHomeSurfaceCacheData(value: unknown): value is HomeSurfaceCacheData {
  return (
    isRecord(value) &&
    value.kind === HOME_SURFACE_CACHE_KIND &&
    typeof value.cachedAt === 'string' &&
    Array.isArray(value.rankedHomeCards) &&
    isRecord(value.interactionStats)
  );
}

function isCoachingCardLike(value: unknown): value is CoachingCard {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.profileId === 'string' &&
    typeof value.type === 'string' &&
    typeof value.title === 'string' &&
    typeof value.body === 'string'
  );
}

function normalizeInteractionStats(value: unknown): HomeCardInteractionStats {
  const record = isRecord(value) ? value : {};
  const normalizeCountMap = (
    input: unknown,
  ): Partial<Record<HomeCardId, number>> => {
    if (!isRecord(input)) return {};

    return Object.fromEntries(
      Object.entries(input).filter(
        (entry): entry is [HomeCardId, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]),
      ),
    ) as Partial<Record<HomeCardId, number>>;
  };

  const events = Array.isArray(record.events)
    ? record.events.filter(
        (entry): entry is HomeCardInteractionEvent =>
          isRecord(entry) &&
          typeof entry.cardId === 'string' &&
          (entry.interactionType === 'tap' ||
            entry.interactionType === 'dismiss') &&
          typeof entry.occurredAt === 'string',
      )
    : [];

  return {
    tapsByCardId: normalizeCountMap(record.tapsByCardId),
    dismissalsByCardId: normalizeCountMap(record.dismissalsByCardId),
    events,
  };
}

// Phase 5 migration seam:
// The current repo still stores home-surface state in coaching_card_cache.
// Story 12.7 uses a typed wrapper inside `card_data` so coaching cards,
// celebrations, and ranked home cards can coexist during the migration.

export function buildFallbackHomeSurfaceCard(profileId: string): CoachingCard {
  const now = new Date();
  return {
    id: generateUUIDv7(),
    profileId,
    type: 'streak',
    title: 'Ready to start?',
    body: 'Begin a session to start building momentum.',
    priority: 3,
    expiresAt: new Date(now.getTime() + HOME_SURFACE_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
    currentStreak: 0,
    graceRemaining: 0,
  };
}

export function normalizeHomeSurfaceCacheData(
  raw: unknown,
  profileId: string,
): HomeSurfaceCacheData {
  if (isHomeSurfaceCacheData(raw)) {
    return {
      ...raw,
      interactionStats: normalizeInteractionStats(raw.interactionStats),
    };
  }

  return {
    kind: HOME_SURFACE_CACHE_KIND,
    cachedAt: new Date().toISOString(),
    legacyCoachingCard: isCoachingCardLike(raw)
      ? raw
      : buildFallbackHomeSurfaceCard(profileId),
    rankedHomeCards: [],
    interactionStats: normalizeInteractionStats(undefined),
  };
}

export async function findHomeSurfaceCache(
  db: Database,
  profileId: string,
): Promise<HomeSurfaceCacheRow | undefined> {
  return db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });
}

export async function readHomeSurfaceCacheData(
  db: Database,
  profileId: string,
): Promise<{
  row: HomeSurfaceCacheRow;
  data: HomeSurfaceCacheData;
} | null> {
  const row = await findHomeSurfaceCache(db, profileId);
  if (!row) return null;

  return {
    row,
    data: normalizeHomeSurfaceCacheData(row.cardData, profileId),
  };
}

/**
 * Core read-modify-write body for the home surface cache.
 *
 * Operates directly on the provided `db` handle — which may be either a root
 * Database or a transaction handle cast via `tx as unknown as Database`. Does
 * NOT open its own transaction; the caller is responsible for wrapping if
 * atomicity is required.
 *
 * [BUG-467] Extracted so callers that already hold a transaction (e.g.
 * `queueCelebration`) can pass their `txDb` without causing a nested
 * `db.transaction()` call, which on neon-serverless either throws or silently
 * degrades the inner SELECT FOR UPDATE.
 */
async function mergeHomeSurfaceCacheDataInTx(
  db: Database,
  profileId: string,
  merge: (current: HomeSurfaceCacheData) => HomeSurfaceCacheData,
  options?: {
    pendingCelebrations?: PendingCelebration[];
    computePending?: PendingCelebrationsReducer;
    expiresAt?: Date;
  },
): Promise<HomeSurfaceCacheData> {
  // Ensure a row exists so SELECT FOR UPDATE has something to lock.
  // ON CONFLICT DO NOTHING is idempotent for concurrent first-writes.
  const defaultData = normalizeHomeSurfaceCacheData(undefined, profileId);
  await db
    .insert(coachingCardCache)
    .values({
      profileId,
      cardData: defaultData,
      pendingCelebrations: [] as PendingCelebration[],
      expiresAt: new Date(Date.now() + HOME_SURFACE_TTL_MS),
    })
    .onConflictDoNothing({ target: coachingCardCache.profileId });

  // Acquire row-level lock — blocks concurrent merges for this profile
  // until this transaction commits.
  const [lockedRow] = await db
    .select()
    .from(coachingCardCache)
    .where(eq(coachingCardCache.profileId, profileId))
    .for('update');

  const now = new Date();
  const current = lockedRow
    ? normalizeHomeSurfaceCacheData(lockedRow.cardData, profileId)
    : defaultData;
  const next: HomeSurfaceCacheData = {
    ...merge(current),
    kind: HOME_SURFACE_CACHE_KIND,
    cachedAt: now.toISOString(),
  };
  const expiresAt =
    options?.expiresAt ?? new Date(now.getTime() + HOME_SURFACE_TTL_MS);

  // Resolve the next celebrations array UNDER the held row lock. A
  // computePending reducer (used by queueCelebration) computes from the locked
  // row's current value so concurrent appends serialise without lost updates;
  // a concrete pendingCelebrations array (used by pruning / write callers)
  // overwrites; otherwise the locked row's value is preserved unchanged.
  const lockedPending =
    (lockedRow?.pendingCelebrations as PendingCelebration[] | null) ??
    ([] as PendingCelebration[]);
  const nextPending = options?.computePending
    ? options.computePending(lockedPending, lockedRow)
    : (options?.pendingCelebrations ?? lockedPending);

  await db
    .update(coachingCardCache)
    .set({
      cardData: next,
      pendingCelebrations: nextPending,
      expiresAt,
      updatedAt: now,
    })
    .where(eq(coachingCardCache.profileId, profileId));

  return next;
}

/**
 * Atomically read-modify-write the home surface cache for a profile.
 *
 * Wraps the operation in a transaction with SELECT FOR UPDATE to prevent
 * concurrent requests from silently overwriting each other's updates
 * (e.g., lost interaction counter increments). Bug #25.
 *
 * For the first-write case (no row yet), an idempotent INSERT … ON CONFLICT
 * DO NOTHING ensures a row exists before locking.
 *
 * When called from within an existing transaction, pass the transaction handle
 * cast as Database and set `options.inTransaction = true` to skip the inner
 * `db.transaction()` wrapper. [BUG-467] Without this, neon-serverless throws
 * on nested transactions or silently degrades the SELECT FOR UPDATE row lock.
 *
 * When `inTransaction: true` is passed, `db` MUST be a transaction handle
 * (`PgTransaction` cast as `Database`). Passing a non-transactional handle
 * silently loses row-lock guarantees. Callers are responsible for honoring this.
 */
export async function mergeHomeSurfaceCacheData(
  db: Database,
  profileId: string,
  merge: (current: HomeSurfaceCacheData) => HomeSurfaceCacheData,
  options?: {
    pendingCelebrations?: PendingCelebration[];
    computePending?: PendingCelebrationsReducer;
    expiresAt?: Date;
    /** Set true when `db` is already a transaction handle. Skips the inner
     *  db.transaction() wrapper to avoid nested transactions on neon-serverless. */
    inTransaction?: boolean;
  },
): Promise<HomeSurfaceCacheData> {
  if (options?.inTransaction) {
    // Caller already holds a transaction — run the body directly on the
    // provided handle so we do not open a nested transaction.
    return mergeHomeSurfaceCacheDataInTx(db, profileId, merge, options);
  }

  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    return mergeHomeSurfaceCacheDataInTx(txDb, profileId, merge, options);
  });
}

/**
 * Write the pending-celebrations array for a profile under the row lock.
 *
 * `pending` may be either a concrete array (overwrite — used by opportunistic
 * pruning) or a {@link PendingCelebrationsReducer} that computes the next array
 * from the locked row's CURRENT value. The reducer form is the race-free path
 * for read-compute-append callers (e.g. queueCelebration): the read, dedup and
 * append all run inside the SELECT ... FOR UPDATE window, so concurrent appends
 * serialise instead of overwriting each other.
 */
export async function writeHomeSurfacePendingCelebrations(
  db: Database,
  profileId: string,
  pending: PendingCelebration[] | PendingCelebrationsReducer,
  options?: { inTransaction?: boolean },
): Promise<void> {
  const expiresAt = new Date(Date.now() + HOME_SURFACE_TTL_MS);

  await mergeHomeSurfaceCacheData(db, profileId, (current) => current, {
    ...(typeof pending === 'function'
      ? { computePending: pending }
      : { pendingCelebrations: pending }),
    expiresAt,
    inTransaction: options?.inTransaction,
  });
}

export async function markHomeSurfaceCelebrationsSeen(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent',
  seenAt = new Date(),
): Promise<void> {
  await db
    .update(coachingCardCache)
    .set({
      ...(viewer === 'child'
        ? { celebrationsSeenByChild: seenAt }
        : { celebrationsSeenByParent: seenAt }),
      updatedAt: seenAt,
    })
    .where(eq(coachingCardCache.profileId, profileId));
}
