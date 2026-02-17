// ---------------------------------------------------------------------------
// Subject Service — Story 1.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and } from 'drizzle-orm';
import {
  subjects,
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
  profileId: string
): Promise<Subject[]> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.subjects.findMany();
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
