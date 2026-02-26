// ---------------------------------------------------------------------------
// Subject Service — Story 1.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, notInArray, sql } from 'drizzle-orm';
import {
  subjects,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import type {
  SubjectCreateInput,
  SubjectUpdateInput,
  Subject,
} from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapSubjectRow(row: typeof subjects.$inferSelect): Subject {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function listSubjects(
  db: Database,
  profileId: string,
  options?: { includeInactive?: boolean }
): Promise<Subject[]> {
  const repo = createScopedRepository(db, profileId);
  const extraWhere = options?.includeInactive
    ? undefined
    : eq(subjects.status, 'active');
  const rows = await repo.subjects.findMany(extraWhere);
  return rows.map(mapSubjectRow);
}

export async function createSubject(
  db: Database,
  profileId: string,
  input: SubjectCreateInput
): Promise<Subject> {
  const [row] = await db
    .insert(subjects)
    .values({
      profileId,
      name: input.name,
      status: 'active',
    })
    .returning();
  return mapSubjectRow(row);
}

export async function getSubject(
  db: Database,
  profileId: string,
  subjectId: string
): Promise<Subject | null> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  return row ? mapSubjectRow(row) : null;
}

export async function updateSubject(
  db: Database,
  profileId: string,
  subjectId: string,
  input: SubjectUpdateInput
): Promise<Subject | null> {
  const rows = await db
    .update(subjects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)))
    .returning();
  return rows[0] ? mapSubjectRow(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Auto-archive — used by subject-auto-archive Inngest function
// ---------------------------------------------------------------------------

/**
 * Archive all active subjects with no learning session activity since
 * `cutoffDate`. Returns the list of archived subject IDs.
 *
 * This is a cross-profile batch operation (no profileId scoping) — it runs
 * from a cron job, not a user request.
 */
export async function archiveInactiveSubjects(
  db: Database,
  cutoffDate: Date
): Promise<{ id: string }[]> {
  const now = new Date();

  // Subquery: subjects that had at least one session after the cutoff
  const recentlyActiveSubjectIds = db
    .select({ subjectId: learningSessions.subjectId })
    .from(learningSessions)
    .where(sql`${learningSessions.lastActivityAt} >= ${cutoffDate}`)
    .groupBy(learningSessions.subjectId);

  // Archive all active subjects NOT in the recently-active set
  const result = await db
    .update(subjects)
    .set({ status: 'archived', updatedAt: now })
    .where(
      and(
        eq(subjects.status, 'active'),
        notInArray(subjects.id, recentlyActiveSubjectIds)
      )
    )
    .returning({ id: subjects.id });

  return result;
}
