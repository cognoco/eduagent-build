// ---------------------------------------------------------------------------
// Parking Lot Data Service — DB-aware queries
// Separate from parking-lot.ts (pure LLM logic) to keep service boundaries clean.
// ---------------------------------------------------------------------------

import { eq, and, sql } from 'drizzle-orm';
import { parkingLotItems, type Database } from '@eduagent/database';
import { MAX_PARKING_LOT_PER_TOPIC } from './parking-lot';

/** Re-export the max for route-level limit checks */
export const MAX_ITEMS_PER_TOPIC = MAX_PARKING_LOT_PER_TOPIC;

function mapRow(row: typeof parkingLotItems.$inferSelect): {
  id: string;
  question: string;
  explored: boolean;
  createdAt: string;
} {
  return {
    id: row.id,
    question: row.question,
    explored: row.explored,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getParkingLotItems(
  db: Database,
  profileId: string,
  sessionId: string
): Promise<{ items: ReturnType<typeof mapRow>[]; count: number }> {
  const rows = await db.query.parkingLotItems.findMany({
    where: and(
      eq(parkingLotItems.sessionId, sessionId),
      eq(parkingLotItems.profileId, profileId)
    ),
  });

  return {
    items: rows.map(mapRow),
    count: rows.length,
  };
}

export async function getParkingLotItemsForTopic(
  db: Database,
  profileId: string,
  topicId: string
): Promise<{ items: ReturnType<typeof mapRow>[]; count: number }> {
  const rows = await db.query.parkingLotItems.findMany({
    where: and(
      eq(parkingLotItems.topicId, topicId),
      eq(parkingLotItems.profileId, profileId)
    ),
  });

  return {
    items: rows.map(mapRow),
    count: rows.length,
  };
}

export async function addParkingLotItem(
  db: Database,
  profileId: string,
  sessionId: string,
  question: string,
  topicId?: string
): Promise<ReturnType<typeof mapRow> | null> {
  // D-04: wrap count check + insert in a transaction to prevent concurrent
  // POSTs from exceeding the per-topic limit (TOCTOU race).
  return db.transaction(async (tx) => {
    // Advisory lock per (profileId, topicId-or-sessionId) — serializes all
    // concurrent inserts for the same bucket without blocking unrelated ones.
    // Lock is released automatically on commit/rollback. [BUG-860]
    const lockKey =
      topicId != null
        ? `parking-lot:${topicId}`
        : `parking-lot:session:${sessionId}`;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`
    );

    const existing = await tx.query.parkingLotItems.findMany({
      where:
        topicId != null
          ? and(
              eq(parkingLotItems.topicId, topicId),
              eq(parkingLotItems.profileId, profileId)
            )
          : and(
              eq(parkingLotItems.sessionId, sessionId),
              eq(parkingLotItems.profileId, profileId)
            ),
    });

    if (existing.length >= MAX_ITEMS_PER_TOPIC) {
      return null;
    }

    const [row] = await tx
      .insert(parkingLotItems)
      .values({
        sessionId,
        profileId,
        topicId: topicId ?? null,
        question,
      })
      .returning();

    if (!row) throw new Error('Insert parking lot item did not return a row');
    return mapRow(row);
  }) as Promise<ReturnType<typeof mapRow> | null>;
}
