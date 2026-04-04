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
import { getProfileAge } from './profile';
import type {
  SubjectCreateInput,
  SubjectUpdateInput,
  Subject,
  SubjectStructureType,
} from '@eduagent/schemas';
import {
  createBooks,
  ensureCurriculum,
  persistNarrowTopics,
} from './curriculum';

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapSubjectRow(row: typeof subjects.$inferSelect): Subject {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    rawInput: row.rawInput ?? null,
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
      rawInput: input.rawInput ?? null,
      status: 'active',
    })
    .returning();
  return mapSubjectRow(row!);
}

export interface CreatedSubjectWithStructure {
  subject: Subject;
  structureType: SubjectStructureType;
  bookCount?: number;
}

export async function createSubjectWithStructure(
  db: Database,
  profileId: string,
  input: SubjectCreateInput
): Promise<CreatedSubjectWithStructure> {
  const subject = await createSubject(db, profileId, input);

  try {
    const learnerAge = await getProfileAge(db, profileId);

    // Dynamic import — book-generation depends on LLM infra which may not
    // initialize in all environments (integration tests without API keys).
    const { detectSubjectType } = await import('./book-generation');
    const structure = await detectSubjectType(subject.name, learnerAge);

    if (structure.type === 'broad') {
      await ensureCurriculum(db, subject.id);
      const books = await createBooks(
        db,
        profileId,
        subject.id,
        structure.books
      );
      return {
        subject,
        structureType: 'broad',
        ...(books.length > 0 ? { bookCount: books.length } : {}),
      };
    }

    // Narrow subject — persist the LLM-generated topics as curriculum topics
    if (structure.topics.length > 0) {
      await persistNarrowTopics(db, subject.id, structure.topics);
    }

    return {
      subject,
      structureType: 'narrow',
    };
  } catch (error) {
    console.warn(
      '[createSubjectWithStructure] Falling back to narrow subject flow:',
      error
    );
  }

  return {
    subject,
    structureType: 'narrow',
  };
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
