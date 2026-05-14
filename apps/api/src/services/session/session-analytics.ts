// ---------------------------------------------------------------------------
// Session Analytics — aggregation primitives over session_events
// Extracted from dashboard.ts (PR-2 surface-ownership-boundaries)
// ---------------------------------------------------------------------------

import { eq, and, gte, inArray, sql } from 'drizzle-orm';
import { sessionEvents, type Database } from '@eduagent/database';

export interface GuidedMetrics {
  guidedCount: number;
  totalProblemCount: number;
}

/**
 * Counts AI-response events in sessionEvents for a child within a date range,
 * classifying those with escalationRung >= 3 as "guided".
 *
 * Rung 1-2 = Socratic (child thinking independently)
 * Rung 3+ = Parallel Example / Transfer Bridge / Teaching Mode (AI had to demonstrate)
 */
export async function countGuidedMetrics(
  db: Database,
  childProfileId: string,
  startDate: Date,
): Promise<GuidedMetrics> {
  // BUG-731 [PERF-1]: previously loaded every ai_response event into JS to
  // count one JSONB field. Now aggregated in SQL: a single round-trip
  // returns COUNT(*) plus a conditional COUNT for rung >= 3.
  //
  // Rungs are stored on `metadata->>'escalationRung'` as JSON-encoded
  // numbers; the `->>` operator returns text, which casts cleanly to int
  // (Postgres rejects non-numeric text and we filter to ai_response rows
  // that always set the field, so the cast is safe in practice).
  const [row] = await db
    .select({
      guidedCount: sql<number>`COUNT(*) FILTER (WHERE (${sessionEvents.metadata}->>'escalationRung')::int >= 3)`,
      totalProblemCount: sql<number>`COUNT(*)`,
    })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.profileId, childProfileId),
        eq(sessionEvents.eventType, 'ai_response'),
        gte(sessionEvents.createdAt, startDate),
      ),
    );

  // drizzle returns aggregate counts as string from the pg driver. Coerce
  // to number so callers stay JSON-clean.
  return {
    guidedCount: Number(row?.guidedCount ?? 0),
    totalProblemCount: Number(row?.totalProblemCount ?? 0),
  };
}

/**
 * Batched variant of countGuidedMetrics for dashboards covering multiple
 * children. Replaces N parallel round-trips (one per child) with a single
 * GROUP BY query.
 *
 * [BUG-734 / PERF-4] The parent dashboard previously called
 * countGuidedMetrics inside Promise.all over every child link, which made
 * one connection-bound round-trip per child. For a parent of 4 children
 * that is 4× the latency tax with identical SQL shape on every call. This
 * variant collapses them into a single aggregate query keyed by profileId
 * and returns a Map so callers can index by child ID without losing the
 * "0 events" case (children with no events appear in the map with zeros).
 */
export async function countGuidedMetricsBatch(
  db: Database,
  childProfileIds: string[],
  startDate: Date,
): Promise<Map<string, GuidedMetrics>> {
  const result = new Map<string, GuidedMetrics>();
  for (const id of childProfileIds) {
    result.set(id, { guidedCount: 0, totalProblemCount: 0 });
  }
  if (childProfileIds.length === 0) return result;

  const rows = await db
    .select({
      profileId: sessionEvents.profileId,
      guidedCount: sql<number>`COUNT(*) FILTER (WHERE (${sessionEvents.metadata}->>'escalationRung')::int >= 3)`,
      totalProblemCount: sql<number>`COUNT(*)`,
    })
    .from(sessionEvents)
    .where(
      and(
        inArray(sessionEvents.profileId, childProfileIds),
        eq(sessionEvents.eventType, 'ai_response'),
        gte(sessionEvents.createdAt, startDate),
      ),
    )
    .groupBy(sessionEvents.profileId);

  for (const row of rows) {
    result.set(row.profileId, {
      guidedCount: Number(row.guidedCount ?? 0),
      totalProblemCount: Number(row.totalProblemCount ?? 0),
    });
  }
  return result;
}
