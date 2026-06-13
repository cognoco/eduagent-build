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
import { recordCelebrationEvent } from './celebration-events';

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
  celebrationLevel: CelebrationLevel,
): PendingCelebration[] {
  if (celebrationLevel === 'off') {
    return [];
  }

  if (celebrationLevel === 'big_only') {
    return celebrations.filter(
      (entry) =>
        entry.celebration === 'comet' || entry.celebration === 'orions_belt',
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
  },
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
  detail?: string | null,
): Promise<PendingCelebration[]> {
  const nextEntry: PendingCelebration = {
    celebration,
    reason,
    detail: detail ?? null,
    queuedAt: new Date().toISOString(),
  };

  let pendingCelebrations: PendingCelebration[] = [];
  let appended = false;

  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    // Reset on each transaction attempt so a retry never carries a stale flag
    // (the reducer below sets it synchronously under the lock before the
    // conditional recordCelebrationEvent reads it).
    appended = false;

    // The read-dedup-append runs INSIDE the SELECT ... FOR UPDATE window via the
    // reducer below — closing the lost-update races [F-170] (the write used to
    // ignore the locked row's current array) and [F-171] (the read used to
    // happen outside the lock, against a stale snapshot). Two concurrent
    // queueCelebration calls for the same profile now serialise: the second
    // reducer runs against the first's committed array, so both entries persist.
    //
    // [BUG-467] inTransaction:true so writeHomeSurfacePendingCelebrations does
    // not open a nested db.transaction inside this one (neon-serverless throws
    // on nested transactions or silently degrades the row lock).
    await writeHomeSurfacePendingCelebrations(
      txDb,
      profileId,
      (existing, lockedRow) => {
        const seenByChildAt = lockedRow?.celebrationsSeenByChild ?? null;
        const hasDuplicate = existing.some((entry) => {
          if (
            entry.celebration !== nextEntry.celebration ||
            entry.reason !== nextEntry.reason ||
            (entry.detail ?? null) !== nextEntry.detail
          ) {
            return false;
          }

          if (nextEntry.detail !== null || !seenByChildAt) {
            return true;
          }

          const queuedAt = new Date(entry.queuedAt);
          return Number.isNaN(queuedAt.getTime()) || queuedAt > seenByChildAt;
        });

        pendingCelebrations = hasDuplicate
          ? existing
          : [...existing, nextEntry];
        appended = !hasDuplicate;
        return pendingCelebrations;
      },
      { inTransaction: true },
    );

    if (appended) {
      await recordCelebrationEvent(txDb, {
        profileId,
        celebratedAt: new Date(nextEntry.queuedAt),
        celebrationType: celebration,
        reason,
        sourceType: 'home_surface_pending_celebration',
        sourceId: detail ?? null,
        dedupeKey:
          detail === null || detail === undefined
            ? `${celebration}:${reason}:${nextEntry.queuedAt}`
            : undefined,
        metadata: { detail: detail ?? null },
      });
    }
  });

  return pendingCelebrations;
}

export async function getPendingCelebrations(
  db: Database,
  profileId: string,
  viewer: 'child' | 'parent',
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
  viewer: 'child' | 'parent',
): Promise<void> {
  await markHomeSurfaceCelebrationsSeen(db, profileId, viewer);
}
