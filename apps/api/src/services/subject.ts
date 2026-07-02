// ---------------------------------------------------------------------------
// Subject Service — Story 1.2
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import {
  eq,
  and,
  gte,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  sql,
} from 'drizzle-orm';
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
  subjectCurriculumRetryRequestedEventSchema,
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

/**
 * [WI-855] Single normalization path for "is this row the same subject as the
 * requested name?" — used by BOTH the hard-limit reuse-exemption and
 * `findExistingSubjectByName` so the two can never drift (the
 * findExistingSubjectByName SQL is `LOWER(name) = LOWER(:name)` over the
 * trimmed input). Keeping one helper avoids the gate silently blocking valid
 * reuses (or permitting net-new inserts at the cap) if normalization changes.
 */
function subjectNameMatches(rowName: string, inputName: string): boolean {
  return rowName.toLowerCase() === inputName.trim().toLowerCase();
}

/**
 * [WI-855] Authoritative hard-cap assertion: counts ALL subjects for the
 * profile and throws `SubjectLimitError` when a net-new insert would breach
 * `MAX_TOTAL_SUBJECTS`. MUST be called while holding the per-profile cap
 * advisory lock so two concurrent creates cannot both pass a stale count and
 * each insert (the TOCTOU the cheap pre-check alone cannot close).
 */
async function assertSubjectCapNotReached(
  db: Database,
  profileId: string,
): Promise<void> {
  const repo = createScopedRepository(db, profileId);
  const all = await repo.subjects.findMany();
  if (all.length >= MAX_TOTAL_SUBJECTS) {
    throw new SubjectLimitError();
  }
}

/** Advisory-lock key serialising all net-new subject inserts for a profile. */
function subjectCapLockKey(profileId: string): string {
  return `subject-cap:${profileId}`;
}

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

  const [readyBooks, suggestions, failedBooks, inFlightBooks] =
    await Promise.all([
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
      // Books whose topic generation reached a terminal failure (failed_at set).
      // This is the single authoritative failure signal; a subject is only
      // surfaced as 'failed' when it has NO ready content (see precedence below)
      // — a single failed sibling next to a ready book must not hide studyable
      // content. Consent-blocked is deliberately NOT counted as failure here
      // (it is owned by the consent gate; a retry cannot fix it).
      db.query.curriculumBooks.findMany({
        where: and(
          inArray(curriculumBooks.subjectId, subjectIds),
          isNotNull(curriculumBooks.failedAt),
        ),
        columns: { subjectId: true },
      }),
      // [WI-1210] Books that exist but haven't finished generating and haven't
      // failed either — i.e. actively in flight. Picking a suggestion only
      // stamps bookSuggestions.picked_at; the row is never deleted, so a
      // subject whose picked book is still generating can still have a
      // leftover (or sibling) bookSuggestions row. An in-flight book must
      // outrank that leftover suggestion when deriving 'ready' vs 'preparing'
      // — otherwise the subject reads as "pick a book" / ready while the
      // generation it's actually waiting on is invisible.
      db.query.curriculumBooks.findMany({
        where: and(
          inArray(curriculumBooks.subjectId, subjectIds),
          eq(curriculumBooks.topicsGenerated, false),
          isNull(curriculumBooks.failedAt),
        ),
        columns: { subjectId: true },
      }),
    ]);

  const readySubjectIds = new Set<string>();
  for (const book of readyBooks) {
    readySubjectIds.add(book.subjectId);
  }

  const suggestionSubjectIds = new Set<string>();
  for (const suggestion of suggestions) {
    suggestionSubjectIds.add(suggestion.subjectId);
  }

  const failedSubjectIds = new Set<string>();
  for (const book of failedBooks) {
    failedSubjectIds.add(book.subjectId);
  }

  const inFlightSubjectIds = new Set<string>();
  for (const book of inFlightBooks) {
    inFlightSubjectIds.add(book.subjectId);
  }

  // Precedence: generated-ready beats in-flight beats suggestion-ready beats
  // failed beats preparing.
  //  - 'ready' (generated)   — has a book whose topics actually finished
  //                            generating (topics_generated = true) — real
  //                            studyable content, even if a sibling book
  //                            failed or is still generating.
  //  - 'preparing' (in-flight) — no generated content yet, but a book row
  //                            exists that hasn't finished generating and
  //                            hasn't failed. Outranks a leftover suggestion
  //                            (WI-1210) so an actively-generating subject
  //                            never reads as ready/pick-book. A
  //                            consent-blocked book has this same row shape
  //                            (topics_generated=false, failed_at=null) and so
  //                            also derives 'preparing' — which is the schema's
  //                            documented intent (schema/subjects.ts: "the book
  //                            stays derived-'preparing' until consent is
  //                            granted... or the consent domain surfaces its
  //                            own blocked state"). Distinguishing consent-block
  //                            from active generation is owned by the consent
  //                            domain, not this rollup.
  //  - 'ready' (suggestion)  — no generated content, nothing in flight, but
  //                            the learner has an unpicked suggestion list to
  //                            choose from — a real next action, even if a
  //                            sibling book already failed.
  //  - 'failed'              — no ready content, nothing in flight, no
  //                            suggestion to pick, but at least one book with
  //                            failed_at set (terminal generation failure).
  //                            Consent-blocked is NOT counted here (owned by
  //                            the consent gate).
  //  - 'preparing' (default) — none of the above (nothing dispatched yet).
  return new Map(
    subjectIds.map((subjectId) => {
      const status: SubjectCurriculumStatus = readySubjectIds.has(subjectId)
        ? 'ready'
        : inFlightSubjectIds.has(subjectId)
          ? 'preparing'
          : suggestionSubjectIds.has(subjectId)
            ? 'ready'
            : failedSubjectIds.has(subjectId)
              ? 'failed'
              : 'preparing';
      return [subjectId, status];
    }),
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
  // Validate with the RETRY schema (not prewarm) so a future divergence between
  // the two event shapes can't silently build a payload the retry function
  // rejects with NonRetriableError('invalid-retry-payload') — which would make
  // every retry a no-op while the endpoint still reports dispatched>0.
  const data = subjectCurriculumRetryRequestedEventSchema.parse({
    version: 1,
    ...args,
    timestamp: new Date().toISOString(),
  });

  // core-send: user-initiated Retry — a swallowed dispatch would make the
  // endpoint report dispatched>0 while no regeneration is queued (the "Retry
  // does nothing" failure). Dispatch failure must short-circuit so the caller
  // leaves failed_at intact and the client surfaces the retry error.
  await inngest.send({
    name: 'app/subject.curriculum-retry-requested',
    data,
  });
}

export async function retryCurriculumForSubject(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<number> {
  const repo = createScopedRepository(db, profileId);
  const subjectRow = await repo.subjects.findFirst(eq(subjects.id, subjectId));
  if (!subjectRow) throw new SubjectNotFoundError();

  // `topicsGenerated=false` is the canonical "needs (re)generation" set — it
  // captures every non-ready book (still preparing, or terminally failed with
  // failed_at set; the retry-claim clears failed_at so the book derives back to
  // preparing while regenerating). Do NOT broaden it to include generated books
  // — the Inngest retry function early-returns on already-generated books, so
  // re-dispatching them is a no-op. The rare "generated-but-zero-active-topics"
  // stuck case is not regenerable here; it is surfaced client-side via
  // `dispatched: 0`.
  const stuckBooks = await db.query.curriculumBooks.findMany({
    where: and(
      eq(curriculumBooks.subjectId, subjectId),
      eq(curriculumBooks.topicsGenerated, false),
    ),
  });

  let dispatched = 0;
  for (const book of stuckBooks) {
    // Core send (throws on dispatch failure). If this throws, the loop aborts
    // BEFORE the failed_at clear below, so failed_at stays set, the subject
    // stays 'failed', and the client surfaces the retry error.
    await dispatchCurriculumRetry({ subjectId, profileId, bookId: book.id });
    dispatched++;
  }

  if (dispatched > 0) {
    // Only AFTER a successful dispatch: clear any terminal failure on the
    // re-dispatched books, in THIS request, so the subject derives 'preparing'
    // synchronously. Without it, the client's refetch immediately after this
    // call still reads failed_at set → status 'failed' → the hub's
    // preparing-poll never starts (polling is gated on status==='preparing') →
    // the screen sits on 'stuck' even though regeneration is queued, recreating
    // "Retry does nothing". The Inngest claim re-clears failed_at idempotently.
    // Ownership is already enforced above via the scoped `repo.subjects` lookup
    // (throws if not owned), so scoping by subjectId here is safe.
    await db
      .update(curriculumBooks)
      .set({ failedReason: null, failedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(curriculumBooks.subjectId, subjectId),
          eq(curriculumBooks.topicsGenerated, false),
        ),
      );
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
  options?: {
    /**
     * [WI-855] When true the caller already holds the per-profile cap advisory
     * lock inside an open transaction (the focused-book path), so this function
     * must NOT open its own transaction/lock — it only re-asserts the cap and
     * inserts on the passed-in `db`/`tx`. When false/omitted, this function
     * opens its own cap-locked transaction (broad / narrow / language paths).
     */
    alreadyCapLocked?: boolean;
  },
): Promise<Subject> {
  const detectedLanguage =
    input.pedagogyMode === 'four_strands' && input.languageCode
      ? {
          pedagogyMode: input.pedagogyMode,
          code: input.languageCode,
        }
      : await detectLanguageSubject(input.rawInput ?? input.name);

  const insertRow = async (txDb: Database): Promise<Subject> => {
    const [row] = await txDb
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
  };

  // [WI-855] Caller already holds the cap lock + has re-asserted the cap inside
  // its transaction — just insert on the provided handle.
  if (options?.alreadyCapLocked) {
    return insertRow(db);
  }

  // [WI-855] Net-new insert paths (broad / narrow / language): take the
  // per-profile cap lock, re-assert the count under it, then insert — closing
  // the TOCTOU window where two concurrent creates both pass a stale count.
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${subjectCapLockKey(profileId)}))`,
    );
    await assertSubjectCapNotReached(txDb, profileId);
    return insertRow(txDb);
  });
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
  // statuses: active + paused + archived). This is a CHEAP PRE-CHECK that
  // fast-paths the obvious over-cap case before any LLM/structure work. The
  // AUTHORITATIVE, race-free enforcement happens under the per-profile cap
  // advisory lock at the actual insert (createSubject / the focused-book
  // net-new branch) — see assertSubjectCapNotReached. Two concurrent creates
  // can both pass THIS pre-check, but only one passes the in-lock re-count.
  //
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
          row.status === 'active' && subjectNameMatches(row.name, input.name),
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
      if (existingSubject) {
        // Reuse — no net-new row, so the cap does not apply.
        return existingSubject;
      }
      // [WI-855] Net-new focused subject: take the per-profile cap lock and
      // re-assert the count under it (authoritative, race-free), then insert.
      // createSubject is told the cap lock is already held so it does not open
      // a nested transaction.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${subjectCapLockKey(profileId)}))`,
      );
      await assertSubjectCapNotReached(txDb, profileId);
      return createSubject(
        txDb,
        profileId,
        {
          name: normalizedSubjectName,
          rawInput: input.rawInput,
        },
        { alreadyCapLocked: true },
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

  // [WI-867] v2 always: learner age from person.
  const learnerAge = await getPersonAge(db, profileId);
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

  // Wrap both writes in ONE transaction so the subject is never left
  // half-configured: native-language set but curriculum un-regenerated (or
  // vice versa). If regenerateLanguageCurriculum fails — or the request dies
  // between the two writes — the setNativeLanguage upsert rolls back with it.
  // Both inner writes run on the tx handle; regenerateLanguageCurriculum opens
  // its own transaction by default, so `inTransaction: true` makes it run on
  // this one instead (neon-serverless throws on / degrades nested
  // transactions). The non-null `languageCode` is guaranteed by the
  // four_strands guard above.
  const languageCode = subject.languageCode;
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    await setNativeLanguage(txDb, profileId, subjectId, input.nativeLanguage);
    await regenerateLanguageCurriculum(
      txDb,
      profileId,
      subjectId,
      languageCode,
      input.startingLevel,
      { inTransaction: true },
    );
  });

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
