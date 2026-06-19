// ---------------------------------------------------------------------------
// Subject Service — Story 1.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, and, gte, inArray, notInArray, sql } from 'drizzle-orm';
import {
  subjects,
  curriculumBooks,
  bookSuggestions,
  learningSessions,
  createScopedRepository,
  type Database,
} from '@eduagent/database';
import {
  SubjectNotFoundError,
  subjectCurriculumPrewarmRequestedEventSchema,
} from '@eduagent/schemas';
import type {
  ConversationLanguage,
  LanguageSetupInput,
  SubjectCreateInput,
  SubjectUpdateInput,
  DeleteSubjectResponse,
  Subject,
  SubjectCurriculumStatus,
  SubjectStructureType,
} from '@eduagent/schemas';
import { inngest } from '../inngest/client';
import {
  areEquivalentBookTitles,
  ensureCurriculum,
  persistNarrowTopics,
  stripOrphanTitles,
} from './curriculum';
import { buildFallbackSubjectStructure } from './book-generation-fallbacks';
import { detectLanguageSubject } from './language-detect';
import {
  generateLanguageCurriculum,
  regenerateLanguageCurriculum,
} from './language-curriculum';
import { createLogger } from './logger';
import { getProfileAge } from './profile';
import { getPersonAge } from './identity-v2/helpers';
import { setNativeLanguage } from './retention-data';
import { safeSend } from './safe-non-core';

/**
 * [BUG-SUBJ-LANG] Thrown when `configureLanguageSubject` is called on a
 * subject that is not set up for language learning (i.e. pedagogyMode is not
 * 'four_strands' or languageCode is absent). The route layer maps this to a
 * 422 Unprocessable Entity via `instanceof` — the previous classification used
 * a raw message-string comparison which silently breaks if the message text
 * changes, matching the classify-before-format / typed-error-hierarchy rule.
 */
export class SubjectNotLanguageLearningError extends Error {
  constructor() {
    super('Subject is not configured for language learning');
    this.name = 'SubjectNotLanguageLearningError';
  }
}

/**
 * [WI-855 / SUBJECT-20] Thrown when a profile is at the hard subject cap and the
 * request would create a net-new subject. The route maps this to HTTP 409
 * Conflict with the stable `SUBJECT_LIMIT_EXCEEDED` code (see ERROR_CODES) so
 * mobile branches on the typed code instead of regexing the message.
 *
 * PRD (docs/PRD.md "Subject Limits") defines TWO limits:
 *  - Soft limit (10 active): a non-blocking prompt/override flow — OUT OF SCOPE
 *    here, tracked as a separate WI.
 *  - Hard limit (25 total active+paused+archived): the BLOCKING gate this class
 *    enforces — "Must archive or delete before creating new".
 */
export class SubjectLimitError extends Error {
  constructor(
    message = 'You have reached the maximum number of subjects. Delete or archive one before creating a new subject.',
  ) {
    super(message);
    this.name = 'SubjectLimitError';
  }
}

/**
 * [WI-855] PRD hard limit: 25 total subjects per profile across ALL statuses
 * (active + paused + archived). The soft limit (10 active) is a separate,
 * non-blocking prompt and is intentionally not enforced here.
 */
export const MAX_TOTAL_SUBJECTS = 25;

const logger = createLogger();

// ---------------------------------------------------------------------------
// Mapper — Drizzle Date → API ISO string
// ---------------------------------------------------------------------------

function mapSubjectRow(
  row: typeof subjects.$inferSelect,
  curriculumStatus?: SubjectCurriculumStatus,
): Subject {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    rawInput: row.rawInput ?? null,
    status: row.status,
    ...(curriculumStatus ? { curriculumStatus } : {}),
    pedagogyMode: row.pedagogyMode,
    languageCode: row.languageCode ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    urgencyBoostUntil: row.urgencyBoostUntil?.toISOString() ?? null,
    urgencyBoostReason: row.urgencyBoostReason ?? null,
  };
}

async function getSubjectCurriculumStatuses(
  db: Database,
  subjectIds: string[],
): Promise<Map<string, SubjectCurriculumStatus>> {
  if (subjectIds.length === 0) return new Map();

  const [readyBooks, suggestions] = await Promise.all([
    db.query.curriculumBooks.findMany({
      where: and(
        inArray(curriculumBooks.subjectId, subjectIds),
        eq(curriculumBooks.topicsGenerated, true),
      ),
      columns: { subjectId: true },
    }),
    db.query.bookSuggestions.findMany({
      where: inArray(bookSuggestions.subjectId, subjectIds),
      columns: { subjectId: true },
    }),
  ]);

  const readySubjectIds = new Set<string>();
  for (const book of readyBooks) {
    readySubjectIds.add(book.subjectId);
  }
  for (const suggestion of suggestions) {
    readySubjectIds.add(suggestion.subjectId);
  }

  return new Map(
    subjectIds.map((subjectId) => [
      subjectId,
      readySubjectIds.has(subjectId) ? 'ready' : 'preparing',
    ]),
  );
}

async function dispatchCurriculumPrewarm(args: {
  subjectId: string;
  profileId: string;
  bookId: string;
}): Promise<void> {
  const data = subjectCurriculumPrewarmRequestedEventSchema.parse({
    version: 1,
    ...args,
    timestamp: new Date().toISOString(),
  });

  await safeSend(
    () =>
      inngest.send({
        name: 'app/subject.curriculum-prewarm-requested',
        data,
      }),
    'subject.curriculum-prewarm',
    {
      profileId: args.profileId,
      subjectId: args.subjectId,
      bookId: args.bookId,
    },
  );
}

async function dispatchCurriculumRetry(args: {
  subjectId: string;
  profileId: string;
  bookId: string;
}): Promise<void> {
  const data = subjectCurriculumPrewarmRequestedEventSchema.parse({
    version: 1,
    ...args,
    timestamp: new Date().toISOString(),
  });

  await safeSend(
    () =>
      inngest.send({
        name: 'app/subject.curriculum-retry-requested',
        data,
      }),
    'subject.curriculum-retry',
    {
      profileId: args.profileId,
      subjectId: args.subjectId,
      bookId: args.bookId,
    },
  );
}

export async function retryCurriculumForSubject(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<number> {
  const repo = createScopedRepository(db, profileId);
  const subjectRow = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subjectRow) throw new SubjectNotFoundError();

  const stuckBooks = await db.query.curriculumBooks.findMany({
    where: and(
      eq(curriculumBooks.subjectId, subjectId),
      eq(curriculumBooks.topicsGenerated, false),
    ),
  });

  let dispatched = 0;
  for (const book of stuckBooks) {
    await dispatchCurriculumRetry({ subjectId, profileId, bookId: book.id });
    dispatched++;
  }
  return dispatched;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export async function listSubjects(
  db: Database,
  profileId: string,
  options?: { includeInactive?: boolean },
): Promise<Subject[]> {
  const repo = createScopedRepository(db, profileId);
  const extraWhere = options?.includeInactive
    ? undefined
    : eq(subjects.status, 'active');
  const rows = await repo.subjects.findMany(extraWhere);
  // Sort by most recently updated first — prevents arbitrary subject[0] picks
  // in freeform classifier fallback and Learn New "Continue with X" card
  rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const curriculumStatuses = await getSubjectCurriculumStatuses(
    db,
    rows.filter((row) => row.status === 'active').map((row) => row.id),
  );
  return rows.map((row) =>
    mapSubjectRow(
      row,
      row.status === 'active'
        ? (curriculumStatuses.get(row.id) ?? 'preparing')
        : undefined,
    ),
  );
}

export async function createSubject(
  db: Database,
  profileId: string,
  input: SubjectCreateInput,
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

async function persistBroadBookSuggestions(
  db: Database,
  subjectId: string,
  books: Array<{
    title: string;
    emoji: string;
    description: string;
  }>,
  subjectName?: string,
): Promise<number> {
  await ensureCurriculum(db, subjectId);
  // Deterministic backstop: never suggest a book that merely restates the
  // subject it sits under (orphan suggestion). Sibling duplicates are already
  // rejected at generation by bookGenerationResultSchema's distinct-title
  // refine; this guards the parent-restatement case the schema cannot see.
  const cleanedBooks = subjectName
    ? stripOrphanTitles(books, subjectName)
    : books;
  const suggestionValues = cleanedBooks.map((book) => ({
    subjectId,
    title: book.title,
    emoji: book.emoji,
    description: book.description,
  }));
  if (suggestionValues.length > 0) {
    await db.insert(bookSuggestions).values(suggestionValues);
  }
  return suggestionValues.length;
}

async function findExistingSubjectByName(
  db: Database,
  profileId: string,
  name: string,
): Promise<Subject | null> {
  const repo = createScopedRepository(db, profileId);
  const rows = await repo.subjects.findMany(
    and(
      sql`LOWER(${subjects.name}) = LOWER(${name})`,
      eq(subjects.status, 'active'),
    ),
  );
  return rows.length > 0 && rows[0] ? mapSubjectRow(rows[0]) : null;
}

export async function createSubjectWithStructure(
  db: Database,
  profileId: string,
  input: SubjectCreateInput,
  options?: {
    conversationLanguage?: ConversationLanguage;
    identityV2Enabled?: boolean;
  },
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

  // [WI-855 / SUBJECT-20] Hard-limit gate (PRD: 25 total subjects across all
  // statuses: active + paused + archived). Guards every creation branch below.
  // Exemption: the focused-book path (effectiveFocus set) re-uses an existing
  // active same-name subject via findExistingSubjectByName, inserting NO net-new
  // subject row — so it is allowed even at the cap. Every other path (broad,
  // narrow, language) always inserts a new subject, so no exemption applies.
  const repo = createScopedRepository(db, profileId);
  const allSubjects = await repo.subjects.findMany();
  if (allSubjects.length >= MAX_TOTAL_SUBJECTS) {
    const reusesExistingSubject =
      effectiveFocus !== undefined &&
      allSubjects.some(
        (row) =>
          row.status === 'active' &&
          row.name.toLowerCase() === input.name.trim().toLowerCase(),
      );
    if (!reusesExistingSubject) {
      throw new SubjectLimitError();
    }
  }

  // Focused book path: input combines a broad subject with a specific focus area
  if (effectiveFocus) {
    const normalizedSubjectName = input.name.trim();
    const subjectNameLockKey = `subject:${profileId}:${normalizedSubjectName.toLowerCase()}`;
    const targetSubject = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${subjectNameLockKey}))`,
      );
      const existingSubject = await findExistingSubjectByName(
        txDb,
        profileId,
        normalizedSubjectName,
      );
      return (
        existingSubject ??
        (await createSubject(txDb, profileId, {
          name: normalizedSubjectName,
          rawInput: input.rawInput,
        }))
      );
    });

    await ensureCurriculum(db, targetSubject.id);

    const bookRow = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${targetSubject.id}))`,
      );

      // Check for an existing focused book while holding the per-subject lock.
      // Without this in-lock recheck, two concurrent focused-book requests can
      // both observe no match before serialising and then both insert.
      const exactExistingBook = await tx.query.curriculumBooks.findFirst({
        where: and(
          eq(curriculumBooks.subjectId, targetSubject.id),
          sql`LOWER(${curriculumBooks.title}) = LOWER(${effectiveFocus})`,
        ),
      });
      const existingBook =
        exactExistingBook ??
        (
          await tx.query.curriculumBooks.findMany({
            where: eq(curriculumBooks.subjectId, targetSubject.id),
          })
        ).find((book) => areEquivalentBookTitles(book.title, effectiveFocus));
      if (existingBook) return existingBook;

      const maxOrderResult = await tx
        .select({
          maxOrder: sql<number>`COALESCE(MAX(${curriculumBooks.sortOrder}), 0)`,
        })
        .from(curriculumBooks)
        .where(eq(curriculumBooks.subjectId, targetSubject.id));
      const nextOrder = (maxOrderResult[0]?.maxOrder ?? 0) + 1;

      const [inserted] = await tx
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

      return inserted;
    });

    if (!bookRow)
      throw new Error('Insert curriculum book did not return a row');
    if (!bookRow.topicsGenerated) {
      await dispatchCurriculumPrewarm({
        subjectId: targetSubject.id,
        profileId,
        bookId: bookRow.id,
      });
    }
    return {
      subject: targetSubject,
      structureType: 'focused_book',
      bookId: bookRow.id,
      bookTitle: bookRow.title,
      bookCount: 1,
    };
  }

  if (input.pedagogyMode === 'four_strands' && input.languageCode) {
    const subject = await createSubject(db, profileId, input);
    const milestones = generateLanguageCurriculum(input.languageCode, 'A1');
    await regenerateLanguageCurriculum(
      db,
      profileId,
      subject.id,
      input.languageCode,
      'A1',
    );
    return {
      subject,
      structureType: 'narrow',
      topicCount: milestones.length,
    };
  }

  const learnerAge = options?.identityV2Enabled
    ? await getPersonAge(db, profileId)
    : await getProfileAge(db, profileId);
  const { detectSubjectType } = await import('./book-generation');
  const subject = await createSubject(db, profileId, input);
  let classificationFailed = false;
  // i18n Phase 1 — thread conversation_language into the subject-structure
  // LLM so the persisted books/topics render in the learner's UI language.
  const detectedStructure = await detectSubjectType(subject.name, learnerAge, {
    conversationLanguage: options?.conversationLanguage,
  }).catch(async (error) => {
    classificationFailed = true;
    logger.warn(
      '[createSubjectWithStructure] Falling back to deterministic subject structure',
      {
        metric: 'subject_structure_generation_fallback',
        subjectId: subject.id,
        profileId,
        error: error instanceof Error ? error.message : String(error),
      },
    );

    return buildFallbackSubjectStructure(subject.name);
  });

  if (detectedStructure.type === 'broad') {
    const usedEmptyStructureFallback = detectedStructure.books.length === 0;
    const fallbackStructure = !usedEmptyStructureFallback
      ? detectedStructure
      : buildFallbackSubjectStructure(subject.name);
    if (fallbackStructure.type === 'broad') {
      const suggestionCount = await persistBroadBookSuggestions(
        db,
        subject.id,
        fallbackStructure.books,
        subject.name,
      );
      return {
        subject,
        structureType: 'broad',
        bookCount: 0,
        suggestionCount,
        ...(usedEmptyStructureFallback || classificationFailed
          ? { classificationFailed: true }
          : {}),
      };
    }

    await persistNarrowTopics(
      db,
      subject.id,
      fallbackStructure.topics,
      subject.name,
    );
    return {
      subject,
      structureType: 'narrow',
      topicCount: fallbackStructure.topics.length,
      classificationFailed: true,
    };
  }

  // Narrow subject — persist the LLM-generated topics as curriculum topics
  const narrowFallbackStructure =
    detectedStructure.topics.length === 0
      ? buildFallbackSubjectStructure(subject.name)
      : null;
  if (narrowFallbackStructure?.type === 'broad') {
    const suggestionCount = await persistBroadBookSuggestions(
      db,
      subject.id,
      narrowFallbackStructure.books,
      subject.name,
    );
    return {
      subject,
      structureType: 'broad',
      bookCount: 0,
      suggestionCount,
      classificationFailed: true,
    };
  }
  const topics =
    detectedStructure.topics.length > 0
      ? detectedStructure.topics
      : narrowFallbackStructure?.type === 'narrow'
        ? narrowFallbackStructure.topics
        : [];
  if (topics.length > 0) {
    await persistNarrowTopics(db, subject.id, topics, subject.name);
  }

  return {
    subject,
    structureType: 'narrow',
    topicCount: topics.length,
    ...(detectedStructure.topics.length === 0 || classificationFailed
      ? { classificationFailed: true }
      : {}),
  };
}

export async function getSubject(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<Subject | null> {
  const repo = createScopedRepository(db, profileId);
  const row = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  return row ? mapSubjectRow(row) : null;
}

export async function configureLanguageSubject(
  db: Database,
  profileId: string,
  subjectId: string,
  input: LanguageSetupInput,
): Promise<Subject> {
  const subject = await getSubject(db, profileId, subjectId);
  if (!subject) {
    throw new SubjectNotFoundError();
  }
  if (subject.pedagogyMode !== 'four_strands' || !subject.languageCode) {
    throw new SubjectNotLanguageLearningError();
  }

  await setNativeLanguage(db, profileId, subjectId, input.nativeLanguage);
  await regenerateLanguageCurriculum(
    db,
    profileId,
    subjectId,
    subject.languageCode,
    input.startingLevel,
  );

  return subject;
}

export async function updateSubject(
  db: Database,
  profileId: string,
  subjectId: string,
  input: SubjectUpdateInput,
): Promise<Subject | null> {
  const rows = await db
    .update(subjects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)))
    .returning();
  return rows[0] ? mapSubjectRow(rows[0]) : null;
}

export async function deleteSubject(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<DeleteSubjectResponse> {
  const [deletedSubject] = await db
    .delete(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)))
    .returning({ id: subjects.id });

  if (!deletedSubject) {
    throw new SubjectNotFoundError();
  }

  return {
    deleted: true,
    subjectId: deletedSubject.id,
  };
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
  cutoffDate: Date,
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
        gte(learningSessions.exchangeCount, 1),
      ),
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
        notInArray(subjects.id, recentlyActiveSubjectIds),
      ),
    )
    .returning({ id: subjects.id });

  return result;
}
