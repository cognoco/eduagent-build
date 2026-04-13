import type { Database } from '@eduagent/database';
import type {
  CelebrationLevel,
  CelebrationName,
  CelebrationReason,
  PendingCelebration,
} from '@eduagent/schemas';
import {
  findHomeSurfaceCache,
  markHomeSurfaceCelebrationsSeen,
  writeHomeSurfacePendingCelebrations,
} from './home-surface-cache';

const CELEBRATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const PARENT_VISIBLE_REASONS: CelebrationReason[] = [
  'topic_mastered',
  'curriculum_complete',
  'evaluate_success',
  'teach_back_success',
  'streak_7',
  'streak_30',
];

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
  const row = await findHomeSurfaceCache(db, profileId);

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

  await writeHomeSurfacePendingCelebrations(db, profileId, pendingCelebrations);

  return pendingCelebrations;
}

export async function getPendingCelebrations(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent'
): Promise<PendingCelebration[]> {
  const row = await findHomeSurfaceCache(db, profileId);

  if (!row) return [];

  const seenAt =
    viewer === 'child'
      ? row.celebrationsSeenByChild
      : row.celebrationsSeenByParent;

  const pending =
    (row.pendingCelebrations as PendingCelebration[] | null) ?? [];
  const now = new Date();
  const filtered = filterPendingCelebrations(pending, { viewer, seenAt, now });

  // Opportunistically clean out expired/invalid entries only.
  // Use viewer: 'child' (no seenAt) to strip just expired entries — child sees
  // everything, so this avoids spurious writes caused by viewer/seen filtering.
  const pruned = filterPendingCelebrations(pending, { viewer: 'child', now });
  if (pruned.length !== pending.length) {
    await writeHomeSurfacePendingCelebrations(db, profileId, pruned);
  }

  return filtered;
}

export async function markCelebrationsSeen(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent'
): Promise<void> {
  await markHomeSurfaceCelebrationsSeen(db, profileId, viewer);
}
