import { eq } from 'drizzle-orm';
import {
  coachingCardCache,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type {
  CelebrationLevel,
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';

const CELEBRATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export const PARENT_VISIBLE_REASONS: CelebrationReason[] = [
  'topic_mastered',
  'curriculum_complete',
  'evaluate_success',
  'teach_back_success',
  'streak_7',
  'streak_30',
];

export function buildFallbackCard(profileId: string) {
  const now = new Date();
  return {
    id: generateUUIDv7(),
    profileId,
    type: 'challenge' as const,
    title: 'Ready for a challenge?',
    body: 'Keep building momentum.',
    priority: 3,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
    topicId: profileId,
    difficulty: 'easy' as const,
    xpReward: 10,
  };
}

export function filterCelebrationsByLevel(
  celebrations: PendingCelebration[],
  celebrationLevel: CelebrationLevel
): PendingCelebration[] {
  if (celebrationLevel === 'off') {
    return [];
  }

  if (celebrationLevel === 'big_only') {
    return celebrations.filter(
      (entry) =>
        entry.celebration === 'comet' || entry.celebration === 'orions_belt'
    );
  }

  return celebrations;
}

export function filterPendingCelebrations(
  celebrations: PendingCelebration[],
  options: {
    viewer: 'child' | 'parent';
    seenAt?: Date | null;
    now?: Date;
  }
): PendingCelebration[] {
  const now = options.now ?? new Date();
  const expiryCutoff = new Date(now.getTime() - CELEBRATION_EXPIRY_MS);

  return celebrations.filter((entry) => {
    const queuedAt = new Date(entry.queuedAt);
    if (Number.isNaN(queuedAt.getTime()) || queuedAt < expiryCutoff) {
      return false;
    }

    if (options.seenAt && queuedAt <= options.seenAt) {
      return false;
    }

    if (
      options.viewer === 'parent' &&
      !PARENT_VISIBLE_REASONS.includes(entry.reason)
    ) {
      return false;
    }

    return true;
  });
}

export async function queueCelebration(
  db: Database,
  profileId: string,
  celebration: CelebrationName,
  reason: CelebrationReason,
  detail?: string | null
): Promise<PendingCelebration[]> {
  const row = await db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });

  const nextEntry: PendingCelebration = {
    celebration,
    reason,
    detail: detail ?? null,
    queuedAt: new Date().toISOString(),
  };

  const existing = ((row?.pendingCelebrations as PendingCelebration[] | null) ??
    []) as PendingCelebration[];
  const hasDuplicate = existing.some(
    (entry) =>
      entry.celebration === nextEntry.celebration &&
      entry.reason === nextEntry.reason &&
      (entry.detail ?? null) === nextEntry.detail
  );

  const pendingCelebrations = hasDuplicate
    ? existing
    : [...existing, nextEntry];

  if (row) {
    await db
      .update(coachingCardCache)
      .set({
        pendingCelebrations,
        updatedAt: new Date(),
      })
      .where(eq(coachingCardCache.profileId, profileId));
  } else {
    await db.insert(coachingCardCache).values({
      profileId,
      cardData: buildFallbackCard(profileId),
      pendingCelebrations,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  return pendingCelebrations;
}

export async function getPendingCelebrations(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent'
): Promise<PendingCelebration[]> {
  const row = await db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });

  if (!row) return [];

  const seenAt =
    viewer === 'child'
      ? row.celebrationsSeenByChild
      : row.celebrationsSeenByParent;

  const pending =
    (row.pendingCelebrations as PendingCelebration[] | null) ?? [];
  const filtered = filterPendingCelebrations(pending, { viewer, seenAt });

  // Opportunistically clean out expired entries.
  if (filtered.length !== pending.length) {
    await db
      .update(coachingCardCache)
      .set({
        pendingCelebrations: pending.filter(
          (entry) =>
            filterPendingCelebrations([entry], { viewer: 'child' }).length > 0
        ),
        updatedAt: new Date(),
      })
      .where(eq(coachingCardCache.profileId, profileId));
  }

  return filtered;
}

export async function markCelebrationsSeen(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent'
): Promise<void> {
  const now = new Date();
  await db
    .update(coachingCardCache)
    .set({
      ...(viewer === 'child'
        ? { celebrationsSeenByChild: now }
        : { celebrationsSeenByParent: now }),
      updatedAt: now,
    })
    .where(eq(coachingCardCache.profileId, profileId));
}
