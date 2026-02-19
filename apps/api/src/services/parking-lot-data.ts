// ---------------------------------------------------------------------------
// Parking Lot Data Service — DB-aware queries
// Separate from parking-lot.ts (pure LLM logic) to keep service boundaries clean.
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import { parkingLotItems, type Database } from '@eduagent/database';
import { MAX_PARKING_LOT_PER_TOPIC } from './parking-lot';

/** Re-export the max for route-level limit checks */
export const MAX_ITEMS_PER_SESSION = MAX_PARKING_LOT_PER_TOPIC;

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

export async function addParkingLotItem(
  db: Database,
  profileId: string,
  sessionId: string,
  question: string,
  topicId?: string
): Promise<ReturnType<typeof mapRow> | null> {
  const existing = await db.query.parkingLotItems.findMany({
    where: and(
      eq(parkingLotItems.sessionId, sessionId),
      eq(parkingLotItems.profileId, profileId)
    ),
  });

  if (existing.length >= MAX_ITEMS_PER_SESSION) {
    return null;
  }

  const [row] = await db
    .insert(parkingLotItems)
    .values({
      sessionId,
      profileId,
      topicId: topicId ?? null,
      question,
    })
    .returning();

  return mapRow(row);
}
