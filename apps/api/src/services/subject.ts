// ---------------------------------------------------------------------------
// Subject Service — Story 1.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, gte, notInArray, sql } from 'drizzle-orm';
import {
  subjects,
  curriculumBooks,
  bookSuggestions,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import { getProfileAge } from './profile';
import { createLogger } from './logger';

const logger = createLogger();
import type {
  LanguageSetupInput,
  SubjectCreateInput,
  SubjectUpdateInput,
  Subject,
  SubjectStructureType,
} from '@eduagent/schemas';
import { ensureCurriculum, persistNarrowTopics } from './curriculum';
import { detectLanguageSubject } from './language-detect';
import {
  generateLanguageCurriculum,
  regenerateLanguageCurriculum,
} from './language-curriculum';
import { setNativeLanguage } from './retention-data';

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
    pedagogyMode: row.pedagogyMode,
    languageCode: row.languageCode ?? null,
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
  // Sort by most recently updated first — prevents arbitrary subject[0] picks
  // in freeform classifier fallback and Learn New "Continue with X" card
  rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return rows.map(mapSubjectRow);
}

export async function createSubject(
  db: Database,
  profileId: string,
  input: SubjectCreateInput
): Promise<Subject> {
  const detectedLanguage =
    input.pedagogyMode === 'four_strands' && input.languageCode
      ? {
          pedagogyMode: input.pedagogyMode,
          code: input.languageCode,
        }
      : await detectLanguageSubject(input.rawInput ?? input.name);

  const [row] = await db
    .insert(subjects)
    .values({
      profileId,
      name: input.name,
      rawInput: input.rawInput ?? null,
      status: 'active',
      pedagogyMode:
        detectedLanguage?.pedagogyMode ?? input.pedagogyMode ?? 'socratic',
      languageCode: detectedLanguage?.code ?? input.languageCode ?? null,
    })
    .returning();
  if (!row) throw new Error('Insert subject did not return a row');
  return mapSubjectRow(row);
}

export interface CreatedSubjectWithStructure {
  subject: Subject;
  structureType: SubjectStructureType;
  bookId?: string;
  bookTitle?: string;
  bookCount?: number;
  topicCount?: number;
  suggestionCount?: number;
  /** True when LLM classification failed and we fell back to narrow */
  classificationFailed?: boolean;
}

async function findExistingSubjectByName(
  db: Database,
  profileId: string,
  name: string
): Promise<Subject | null> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.subjects.findMany(
    and(
      sql`LOWER(${subjects.name}) = LOWER(${name})`,
      eq(subjects.status, 'active')
    )
  );
  return rows.length > 0 && rows[0] ? mapSubjectRow(rows[0]) : null;
}

export async function createSubjectWithStructure(
  db: Database,
  profileId: string,
  input: SubjectCreateInput
): Promise<CreatedSubjectWithStructure> {
  // Server-side focus inference: if rawInput ("tea") differs from name ("Botany"),
  // the rawInput IS the focus even if the client didn't send it explicitly.
  // This prevents falling through to the broad path and generating 8+ generic books.
  const effectiveFocus =
    input.focus ??
    (input.rawInput && input.rawInput.toLowerCase() !== input.name.toLowerCase()
      ? input.rawInput
      : undefined);
  const effectiveFocusDescription = input.focusDescription ?? undefined;

  // Focused book path: input combines a broad subject with a specific focus area
  if (effectiveFocus) {
    const existingSubject = await findExistingSubjectByName(
      db,
      profileId,
      input.name
    );
    const targetSubject =
      existingSubject ??
      (await createSubject(db, profileId, {
        name: input.name,
        rawInput: input.rawInput,
      }));

    await ensureCurriculum(db, targetSubject.id);

    // Check if a book with this focus already exists on the subject
    const existingBook = await db.query.curriculumBooks.findFirst({
      where: and(
        eq(curriculumBooks.subjectId, targetSubject.id),
        sql`LOWER(${curriculumBooks.title}) = LOWER(${effectiveFocus})`
      ),
    });
    if (existingBook) {
      return {
        subject: targetSubject,
        structureType: 'focused_book' as SubjectStructureType,
        bookId: existingBook.id,
        bookTitle: existingBook.title,
        bookCount: 1,
      };
    }

    // Create the focused book
    const maxOrderResult = await db
      .select({
        maxOrder: sql<number>`COALESCE(MAX(${curriculumBooks.sortOrder}), 0)`,
      })
      .from(curriculumBooks)
      .where(eq(curriculumBooks.subjectId, targetSubject.id));
    const nextOrder = (maxOrderResult[0]?.maxOrder ?? 0) + 1;

    const [bookRow] = await db
      .insert(curriculumBooks)
      .values({
        subjectId: targetSubject.id,
        title: effectiveFocus,
        description: effectiveFocusDescription ?? null,
        emoji: null,
        sortOrder: nextOrder,
        topicsGenerated: false,
      })
      .returning();

    if (!bookRow)
      throw new Error('Insert curriculum book did not return a row');
    return {
      subject: targetSubject,
      structureType: 'focused_book',
      bookId: bookRow.id,
      bookTitle: effectiveFocus,
      bookCount: 1,
    };
  }

  const subject = await createSubject(db, profileId, input);

  if (subject.pedagogyMode === 'four_strands' && subject.languageCode) {
    const milestones = generateLanguageCurriculum(subject.languageCode, 'A1');
    await regenerateLanguageCurriculum(
      db,
      subject.id,
      subject.languageCode,
      'A1'
    );
    return {
      subject,
      structureType: 'narrow',
      topicCount: milestones.length,
    };
  }

  try {
    const learnerAge = await getProfileAge(db, profileId);

    // Dynamic import — book-generation depends on LLM infra which may not
    // initialize in all environments (integration tests without API keys).
    const { detectSubjectType } = await import('./book-generation');
    const structure = await detectSubjectType(subject.name, learnerAge);

    if (structure.type === 'broad') {
      await ensureCurriculum(db, subject.id);
      // Store as suggestions, NOT real books — learner picks from picker screen
      const suggestionValues = structure.books.map((book) => ({
        subjectId: subject.id,
        title: book.title,
        emoji: book.emoji,
        description: book.description,
      }));
      if (suggestionValues.length > 0) {
        await db.insert(bookSuggestions).values(suggestionValues);
      }
      return {
        subject,
        structureType: 'broad',
        bookCount: 0,
        suggestionCount: suggestionValues.length,
      };
    }

    // Narrow subject — persist the LLM-generated topics as curriculum topics
    if (structure.topics.length > 0) {
      await persistNarrowTopics(db, subject.id, structure.topics, subject.name);
    }

    return {
      subject,
      structureType: 'narrow',
      topicCount: structure.topics.length,
    };
  } catch (error) {
    logger.warn(
      '[createSubjectWithStructure] Falling back to narrow subject flow',
      {
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }

  return {
    subject,
    structureType: 'narrow',
    classificationFailed: true,
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

export async function configureLanguageSubject(
  db: Database,
  profileId: string,
  subjectId: string,
  input: LanguageSetupInput
): Promise<Subject> {
  const subject = await getSubject(db, profileId, subjectId);
  if (!subject) {
    throw new Error('Subject not found');
  }
  if (subject.pedagogyMode !== 'four_strands' || !subject.languageCode) {
    throw new Error('Subject is not configured for language learning');
  }

  await setNativeLanguage(db, profileId, subjectId, input.nativeLanguage);
  await regenerateLanguageCurriculum(
    db,
    subjectId,
    subject.languageCode,
    input.startingLevel
  );

  return subject;
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

  // Subquery: subjects that had at least one real session after the cutoff
  // Ghost sessions (exchangeCount=0) must not prevent archival.
  const recentlyActiveSubjectIds = db
    .select({ subjectId: learningSessions.subjectId })
    .from(learningSessions)
    .where(
      and(
        sql`${learningSessions.lastActivityAt} >= ${cutoffDate}`,
        gte(learningSessions.exchangeCount, 1)
      )
    )
    .groupBy(learningSessions.subjectId);

  // Archive all active subjects NOT in the recently-active set.
  // C-02: exclude subjects created after the cutoff — newly created subjects
  // with zero sessions should not be archived immediately.
  const result = await db
    .update(subjects)
    .set({ status: 'archived', updatedAt: now })
    .where(
      and(
        eq(subjects.status, 'active'),
        sql`${subjects.createdAt} <= ${cutoffDate}`,
        notInArray(subjects.id, recentlyActiveSubjectIds)
      )
    )
    .returning({ id: subjects.id });

  return result;
}
