import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  supporterFeedSurfaceState,
  supportership,
  type Database,
  type SupporterFeedSurfaceState,
} from '@eduagent/database';
import type { ScopeKind } from '@eduagent/schemas';

import { ForbiddenError } from '../errors';

export interface SupporterFeedStateKey {
  viewerPersonId: string;
  scopeKind: Extract<ScopeKind, 'supporter-hub' | 'person'>;
  sourceKind: string;
  sourceKey: string;
  supportershipId?: string;
  targetPersonId?: string;
}

async function assertActiveSupportership(
  db: Database,
  key: SupporterFeedStateKey,
): Promise<void> {
  if (!key.supportershipId) return;

  const rows = await db
    .select({ id: supportership.id })
    .from(supportership)
    .where(
      and(
        eq(supportership.id, key.supportershipId),
        eq(supportership.supporterPersonId, key.viewerPersonId),
        ...(key.targetPersonId
          ? [eq(supportership.supporteePersonId, key.targetPersonId)]
          : []),
        isNull(supportership.revokedAt),
      ),
    )
    .limit(1);

  if (!rows[0]) {
    throw new ForbiddenError('You do not have access to this supportership.');
  }
}

function stateValues(
  key: SupporterFeedStateKey,
  now: Date,
): typeof supporterFeedSurfaceState.$inferInsert {
  return {
    viewerPersonId: key.viewerPersonId,
    scopeKind: key.scopeKind,
    sourceKind: key.sourceKind,
    sourceKey: key.sourceKey,
    supportershipId: key.supportershipId,
    targetPersonId: key.targetPersonId,
    updatedAt: now,
  };
}

export async function readSupporterFeedSurfaceState(
  db: Database,
  key: SupporterFeedStateKey,
): Promise<SupporterFeedSurfaceState | null> {
  await assertActiveSupportership(db, key);

  const rows = await db
    .select()
    .from(supporterFeedSurfaceState)
    .where(
      and(
        eq(supporterFeedSurfaceState.viewerPersonId, key.viewerPersonId),
        eq(supporterFeedSurfaceState.scopeKind, key.scopeKind),
        eq(supporterFeedSurfaceState.sourceKey, key.sourceKey),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function markSupporterFeedCandidateSurfaced(
  db: Database,
  key: SupporterFeedStateKey,
  options: { now?: Date } = {},
): Promise<SupporterFeedSurfaceState> {
  await assertActiveSupportership(db, key);
  const now = options.now ?? new Date();

  const rows = await db
    .insert(supporterFeedSurfaceState)
    .values({
      ...stateValues(key, now),
      surfacedAt: now,
      surfaceCount: 1,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        supporterFeedSurfaceState.viewerPersonId,
        supporterFeedSurfaceState.scopeKind,
        supporterFeedSurfaceState.sourceKey,
      ],
      set: {
        sourceKind: key.sourceKind,
        supportershipId: key.supportershipId,
        targetPersonId: key.targetPersonId,
        surfacedAt: now,
        updatedAt: now,
        surfaceCount: sql`${supporterFeedSurfaceState.surfaceCount} + 1`,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error('Supporter feed state upsert returned no row');
  return row;
}

export async function snoozeSupporterFeedCandidate(
  db: Database,
  key: SupporterFeedStateKey,
  snoozedUntil: Date,
  options: { now?: Date } = {},
): Promise<SupporterFeedSurfaceState> {
  await assertActiveSupportership(db, key);
  const now = options.now ?? new Date();

  const rows = await db
    .insert(supporterFeedSurfaceState)
    .values({
      ...stateValues(key, now),
      snoozedUntil,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [
        supporterFeedSurfaceState.viewerPersonId,
        supporterFeedSurfaceState.scopeKind,
        supporterFeedSurfaceState.sourceKey,
      ],
      set: {
        sourceKind: key.sourceKind,
        supportershipId: key.supportershipId,
        targetPersonId: key.targetPersonId,
        snoozedUntil,
        updatedAt: now,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error('Supporter feed state upsert returned no row');
  return row;
}
