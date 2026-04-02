import { eq } from 'drizzle-orm';
import {
  coachingCardCache,
  generateUUIDv7,
  type Database,
} from '@eduagent/database';
import type { CoachingCard, PendingCelebration } from '@eduagent/schemas';

const HOME_SURFACE_TTL_MS = 24 * 60 * 60 * 1000;

// Phase 5 migration seam:
// The current repo still stores home-surface state in coaching_card_cache.
// Story 12.7 should swap the backing store here to the new home-card cache
// rather than making celebration callers know about the legacy table.

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

export async function findHomeSurfaceCache(
  db: Database,
  profileId: string
): Promise<typeof coachingCardCache.$inferSelect | undefined> {
  return db.query.coachingCardCache.findFirst({
    where: eq(coachingCardCache.profileId, profileId),
  });
}

export async function writeHomeSurfacePendingCelebrations(
  db: Database,
  profileId: string,
  pendingCelebrations: PendingCelebration[]
): Promise<void> {
  const now = new Date();

  await db
    .insert(coachingCardCache)
    .values({
      profileId,
      cardData: buildFallbackHomeSurfaceCard(profileId),
      pendingCelebrations,
      expiresAt: new Date(now.getTime() + HOME_SURFACE_TTL_MS),
    })
    .onConflictDoUpdate({
      target: coachingCardCache.profileId,
      set: {
        pendingCelebrations,
        expiresAt: new Date(now.getTime() + HOME_SURFACE_TTL_MS),
        updatedAt: now,
      },
    });
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
