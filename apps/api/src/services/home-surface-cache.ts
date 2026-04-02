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
const MAX_HOME_CARD_EVENTS = 40;

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
  legacyCoachingCard: CoachingCard;
  rankedHomeCards: HomeCard[];
  interactionStats: HomeCardInteractionStats;
};

type HomeSurfaceCacheRow = typeof coachingCardCache.$inferSelect;

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

function normalizeInteractionStats(
  value: unknown
): HomeCardInteractionStats {
  const record = isRecord(value) ? value : {};
  const normalizeCountMap = (
    input: unknown
  ): Partial<Record<HomeCardId, number>> => {
    if (!isRecord(input)) return {};

    return Object.fromEntries(
      Object.entries(input).filter(
        (entry): entry is [HomeCardId, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1])
      )
    ) as Partial<Record<HomeCardId, number>>;
  };

  const events = Array.isArray(record.events)
    ? record.events.filter(
        (entry): entry is HomeCardInteractionEvent =>
          isRecord(entry) &&
          typeof entry.cardId === 'string' &&
          (entry.interactionType === 'tap' ||
            entry.interactionType === 'dismiss') &&
          typeof entry.occurredAt === 'string'
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
    type: 'challenge',
    title: 'Ready for a challenge?',
    body: 'Keep building momentum.',
    priority: 3,
    expiresAt: new Date(now.getTime() + HOME_SURFACE_TTL_MS).toISOString(),
    createdAt: now.toISOString(),
    topicId: generateUUIDv7(), // placeholder — no real topic for fallback card
    difficulty: 'easy',
    xpReward: 10,
  };
}

export function normalizeHomeSurfaceCacheData(
  raw: unknown,
  profileId: string
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
  profileId: string
): Promise<HomeSurfaceCacheRow | undefined> {
  return db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });
}

export async function readHomeSurfaceCacheData(
  db: Database,
  profileId: string
): Promise<
  | {
      row: HomeSurfaceCacheRow;
      data: HomeSurfaceCacheData;
    }
  | null
> {
  const row = await findHomeSurfaceCache(db, profileId);
  if (!row) return null;

  return {
    row,
    data: normalizeHomeSurfaceCacheData(row.cardData, profileId),
  };
}

export async function mergeHomeSurfaceCacheData(
  db: Database,
  profileId: string,
  merge: (current: HomeSurfaceCacheData) => HomeSurfaceCacheData,
  options?: {
    pendingCelebrations?: PendingCelebration[];
    expiresAt?: Date;
  }
): Promise<HomeSurfaceCacheData> {
  const existing = await readHomeSurfaceCacheData(db, profileId);
  const now = new Date();
  const current =
    existing?.data ?? normalizeHomeSurfaceCacheData(undefined, profileId);
  const next: HomeSurfaceCacheData = {
    ...merge(current),
    kind: HOME_SURFACE_CACHE_KIND,
    cachedAt: now.toISOString(),
  };
  const expiresAt =
    options?.expiresAt ?? new Date(now.getTime() + HOME_SURFACE_TTL_MS);

  await db
    .insert(coachingCardCache)
    .values({
      profileId,
      cardData: next,
      pendingCelebrations:
        options?.pendingCelebrations ??
        existing?.row.pendingCelebrations ??
        ([] as PendingCelebration[]),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: coachingCardCache.profileId,
      set: {
        cardData: next,
        pendingCelebrations:
          options?.pendingCelebrations ??
          existing?.row.pendingCelebrations ??
          ([] as PendingCelebration[]),
        expiresAt,
        updatedAt: now,
      },
    });

  return next;
}

export async function recordHomeCardInteraction(
  db: Database,
  profileId: string,
  input: {
    cardId: HomeCardId;
    interactionType: HomeCardInteractionType;
  }
): Promise<void> {
  const occurredAt = new Date().toISOString();

  await mergeHomeSurfaceCacheData(db, profileId, (current) => {
    const interactionStats = normalizeInteractionStats(current.interactionStats);
    const countsKey =
      input.interactionType === 'tap' ? 'tapsByCardId' : 'dismissalsByCardId';
    const counts = interactionStats[countsKey];

    interactionStats[countsKey] = {
      ...counts,
      [input.cardId]: (counts[input.cardId] ?? 0) + 1,
    };
    interactionStats.events = [
      ...interactionStats.events,
      {
        cardId: input.cardId,
        interactionType: input.interactionType,
        occurredAt,
      },
    ].slice(-MAX_HOME_CARD_EVENTS);

    return {
      ...current,
      rankedHomeCards: [],
      interactionStats,
    };
  });
}

export async function writeHomeSurfacePendingCelebrations(
  db: Database,
  profileId: string,
  pendingCelebrations: PendingCelebration[]
): Promise<void> {
  const expiresAt = new Date(Date.now() + HOME_SURFACE_TTL_MS);

  await mergeHomeSurfaceCacheData(
    db,
    profileId,
    (current) => current,
    { pendingCelebrations, expiresAt }
  );
}

export async function markHomeSurfaceCelebrationsSeen(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent',
  seenAt = new Date()
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
