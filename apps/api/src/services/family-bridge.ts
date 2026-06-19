import { createHash } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  curricula,
  curriculumBooks,
  curriculumTopics,
  learningSessions,
  needsDeepeningTopics,
  person,
  subjects,
  type Database,
} from '@eduagent/database';
import type {
  ChildTopicSnapshot,
  CloneCreatedIds,
  CloneFromChildRequest,
  CloneFromChildResponse,
  CloneTopicState,
  UndoCloneFromChildResponse,
} from '@eduagent/schemas';

import { NotFoundError } from '../errors';
import { assertParentAccess } from './family-access';
import { getChargeSubjectsForGuardianV2 } from './identity-v2/family-bridge-v2';
import {
  findOwnedCurriculumTopic,
  type OwnedCurriculumTopic,
} from './curriculum-topic-ownership';

const REQUEST_CACHE_TTL_MS = 60_000;
const cloneRequestCache = new Map<
  string,
  { expiresAt: number; result: CloneFromChildResponse }
>();

export function hashTopicDescription(
  title: string,
  description: string,
): string {
  return createHash('sha256')
    .update(`${title.trim()}\n${description.trim()}`)
    .digest('hex');
}

export function sourceAgeBracket(
  birthYear: number,
): ChildTopicSnapshot['sourceAgeBracket'] {
  const age = new Date().getUTCFullYear() - birthYear;
  if (age <= 12) return 'eleven_twelve';
  if (age <= 15) return 'thirteen_fifteen';
  return 'sixteen_plus';
}

function cacheKey(
  adultProfileId: string,
  childProfileId: string,
  topicId: string,
  requestId: string,
): string {
  return `${adultProfileId}:${childProfileId}:${topicId}:${requestId}`;
}

function readCachedCloneResult(
  adultProfileId: string,
  input: CloneFromChildRequest,
): CloneFromChildResponse | null {
  const key = cacheKey(
    adultProfileId,
    input.childProfileId,
    input.topicId,
    input.requestId,
  );
  const cached = cloneRequestCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    cloneRequestCache.delete(key);
    return null;
  }
  return cached.result;
}

function cacheCloneResult(
  adultProfileId: string,
  input: CloneFromChildRequest,
  result: CloneFromChildResponse,
): void {
  const now = Date.now();
  for (const [key, value] of cloneRequestCache) {
    if (value.expiresAt <= now) cloneRequestCache.delete(key);
  }
  cloneRequestCache.set(
    cacheKey(
      adultProfileId,
      input.childProfileId,
      input.topicId,
      input.requestId,
    ),
    { expiresAt: now + REQUEST_CACHE_TTL_MS, result },
  );
}

export async function getChildTopicSnapshotForParent(
  db: Database,
  adultProfileId: string,
  childProfileId: string,
  topicId: string,
  opts?: { identityV2Enabled?: boolean },
): Promise<ChildTopicSnapshot | null> {
  return getChargeSubjectsForGuardianV2(
    db,
    adultProfileId,
    childProfileId,
    topicId,
  );
}

async function findAdultSubject(
  db: Database,
  adultProfileId: string,
  subjectName: string,
): Promise<typeof subjects.$inferSelect | undefined> {
  const [subject] = await db
    .select()
    .from(subjects)
    .where(
      and(
        eq(subjects.profileId, adultProfileId),
        eq(subjects.status, 'active'),
        sql`lower(${subjects.name}) = lower(${subjectName})`,
      ),
    )
    .limit(1);
  return subject;
}

// [WI-586] Resolve the adult's conversation language. Flag-ON the legacy
// `profiles` table is dropped; the value lives on `person` (person.id ==
// profileId). Returns null when no row exists.
async function getAdultConversationLanguage(
  db: Database,
  adultProfileId: string,
  opts?: { identityV2Enabled?: boolean },
): Promise<string | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.id, adultProfileId),
    columns: { conversationLanguage: true },
  });
  return row?.conversationLanguage ?? null;
}

async function resolveSubject(
  db: Database,
  adultProfileId: string,
  snapshot: ChildTopicSnapshot,
  opts?: { identityV2Enabled?: boolean },
): Promise<{ subject: typeof subjects.$inferSelect; created: boolean }> {
  const existing = await findAdultSubject(
    db,
    adultProfileId,
    snapshot.subjectName,
  );
  if (existing) {
    if (!existing.languageCode) {
      const conversationLanguage = await getAdultConversationLanguage(
        db,
        adultProfileId,
        opts,
      );
      if (conversationLanguage) {
        await db
          .update(subjects)
          .set({
            languageCode: conversationLanguage,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(subjects.id, existing.id),
              eq(subjects.profileId, adultProfileId),
            ),
          );
        return {
          subject: { ...existing, languageCode: conversationLanguage },
          created: false,
        };
      }
    }
    return { subject: existing, created: false };
  }

  const conversationLanguage = await getAdultConversationLanguage(
    db,
    adultProfileId,
    opts,
  );
  if (conversationLanguage === null) throw new NotFoundError('Profile');
  const adult = { conversationLanguage };

  await db
    .insert(subjects)
    .values({
      profileId: adultProfileId,
      name: snapshot.subjectName,
      rawInput: snapshot.subjectName,
      languageCode: adult.conversationLanguage,
      pedagogyMode: 'socratic',
    })
    .onConflictDoNothing();

  const subject = await findAdultSubject(
    db,
    adultProfileId,
    snapshot.subjectName,
  );
  if (!subject) throw new Error('Subject resolve-or-create failed');
  return { subject, created: true };
}

async function resolveCurriculum(
  db: Database,
  subjectId: string,
): Promise<typeof curricula.$inferSelect> {
  const existing = await db.query.curricula.findFirst({
    where: and(eq(curricula.subjectId, subjectId), eq(curricula.version, 1)),
  });
  if (existing) return existing;

  await db
    .insert(curricula)
    .values({ subjectId, version: 1 })
    .onConflictDoNothing();

  const curriculum = await db.query.curricula.findFirst({
    where: and(eq(curricula.subjectId, subjectId), eq(curricula.version, 1)),
  });
  if (!curriculum) throw new Error('Curriculum resolve-or-create failed');
  return curriculum;
}

async function findBook(
  db: Database,
  subjectId: string,
  bookTitle: string,
): Promise<typeof curriculumBooks.$inferSelect | undefined> {
  const [book] = await db
    .select()
    .from(curriculumBooks)
    .where(
      and(
        eq(curriculumBooks.subjectId, subjectId),
        sql`lower(${curriculumBooks.title}) = lower(${bookTitle})`,
      ),
    )
    .limit(1);
  return book;
}

async function resolveBook(
  db: Database,
  subjectId: string,
  snapshot: ChildTopicSnapshot,
): Promise<{ book: typeof curriculumBooks.$inferSelect; created: boolean }> {
  const existing = await findBook(db, subjectId, snapshot.bookTitle);
  if (existing) return { book: existing, created: false };

  await db
    .insert(curriculumBooks)
    .values({
      subjectId,
      title: snapshot.bookTitle,
      description: null,
      sortOrder: sql`COALESCE((SELECT MAX(${curriculumBooks.sortOrder}) + 1 FROM ${curriculumBooks} WHERE ${curriculumBooks.subjectId} = ${subjectId}), 0)`,
      topicsGenerated: true,
    })
    .onConflictDoNothing();

  const book = await findBook(db, subjectId, snapshot.bookTitle);
  if (!book) throw new Error('Book resolve-or-create failed');
  return { book, created: true };
}

async function findTopicByTitle(
  db: Database,
  bookId: string,
  topicTitle: string,
): Promise<typeof curriculumTopics.$inferSelect | undefined> {
  const [topic] = await db
    .select()
    .from(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.bookId, bookId),
        sql`lower(${curriculumTopics.title}) = lower(${topicTitle})`,
      ),
    )
    .limit(1);
  return topic;
}

async function getTopicState(
  db: Database,
  adultProfileId: string,
  subjectId: string,
  topicId: string,
): Promise<CloneTopicState> {
  const [session] = await db
    .select({
      status: learningSessions.status,
      exchangeCount: learningSessions.exchangeCount,
    })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, adultProfileId),
        eq(learningSessions.topicId, topicId),
      ),
    )
    .orderBy(desc(learningSessions.updatedAt), desc(learningSessions.id))
    .limit(1);

  if (session) {
    return session.status === 'completed' || session.status === 'auto_closed'
      ? 'completed'
      : 'in_progress';
  }

  const activeDeepening = await db.query.needsDeepeningTopics.findFirst({
    where: and(
      eq(needsDeepeningTopics.profileId, adultProfileId),
      eq(needsDeepeningTopics.subjectId, subjectId),
      eq(needsDeepeningTopics.topicId, topicId),
      eq(needsDeepeningTopics.status, 'active'),
    ),
  });

  return activeDeepening ? 'in_progress' : 'unstarted';
}

function forceCopyTitle(snapshot: ChildTopicSnapshot, attempt: number): string {
  // Avoid embedding the child's display name in the persisted title — the
  // sourceChildProfileId column already drives the live "From {child}" chip
  // via TopicProvenance, so name resolution happens at render time. Storing
  // the name in the title would survive child-profile deletion (the FK is
  // ON DELETE SET NULL) and leak PII into any future export/analytics path.
  const base = `${snapshot.topicTitle} (copy)`;
  return attempt === 0 ? base : `${base} ${attempt + 1}`;
}

async function insertBridgeTopic(
  db: Database,
  params: {
    curriculumId: string;
    bookId: string;
    snapshot: ChildTopicSnapshot;
    title: string;
  },
): Promise<typeof curriculumTopics.$inferSelect | undefined> {
  const [topic] = await db
    .insert(curriculumTopics)
    .values({
      curriculumId: params.curriculumId,
      bookId: params.bookId,
      title: params.title,
      description: params.snapshot.topicDescription,
      estimatedMinutes: params.snapshot.estimatedMinutes,
      sortOrder: sql`COALESCE((SELECT MAX(${curriculumTopics.sortOrder}) + 1 FROM ${curriculumTopics} WHERE ${curriculumTopics.bookId} = ${params.bookId}), 0)`,
      relevance: 'core',
      source: 'parent_bridge',
      sourceChildProfileId: params.snapshot.childProfileId,
    })
    .onConflictDoNothing()
    .returning();
  return topic;
}

export async function cloneTopicFromChild(
  db: Database,
  adultProfileId: string,
  input: CloneFromChildRequest,
  opts?: { identityV2Enabled?: boolean },
): Promise<CloneFromChildResponse> {
  const cached = readCachedCloneResult(adultProfileId, input);
  if (cached) return cached;

  await assertParentAccess(db, adultProfileId, input.childProfileId, opts);
  const snapshot = await getChildTopicSnapshotForParent(
    db,
    adultProfileId,
    input.childProfileId,
    input.topicId,
    opts,
  );
  if (!snapshot) throw new NotFoundError('Topic');

  const result = await db.transaction(async (tx) => {
    const database = tx as unknown as Database;
    const createdIds: CloneCreatedIds = {};
    const resolvedSubject = await resolveSubject(
      database,
      adultProfileId,
      snapshot,
      opts,
    );
    if (resolvedSubject.created)
      createdIds.subjectId = resolvedSubject.subject.id;

    const curriculum = await resolveCurriculum(
      database,
      resolvedSubject.subject.id,
    );
    const resolvedBook = await resolveBook(
      database,
      resolvedSubject.subject.id,
      snapshot,
    );
    if (resolvedBook.created) createdIds.bookId = resolvedBook.book.id;

    if (!input.forceCopy) {
      const existingTopic = await findTopicByTitle(
        database,
        resolvedBook.book.id,
        snapshot.topicTitle,
      );

      if (existingTopic) {
        const topicState = await getTopicState(
          database,
          adultProfileId,
          resolvedSubject.subject.id,
          existingTopic.id,
        );
        const existingHash = hashTopicDescription(
          existingTopic.title,
          existingTopic.description,
        );
        if (existingHash === snapshot.topicDescriptionHash) {
          return {
            topicId: existingTopic.id,
            subjectId: resolvedSubject.subject.id,
            alreadyExisted: true,
            descriptionDivergent: false,
            descriptionRefreshed: false,
            topicState,
            createdIds,
          } satisfies CloneFromChildResponse;
        }

        if (topicState === 'unstarted') {
          await database
            .update(curriculumTopics)
            .set({
              description: snapshot.topicDescription,
              estimatedMinutes: snapshot.estimatedMinutes,
              sourceChildProfileId: snapshot.childProfileId,
              updatedAt: new Date(),
            })
            .where(eq(curriculumTopics.id, existingTopic.id));
          return {
            topicId: existingTopic.id,
            subjectId: resolvedSubject.subject.id,
            alreadyExisted: true,
            descriptionDivergent: false,
            descriptionRefreshed: true,
            topicState,
            createdIds,
          } satisfies CloneFromChildResponse;
        }

        return {
          topicId: existingTopic.id,
          subjectId: resolvedSubject.subject.id,
          alreadyExisted: true,
          descriptionDivergent: true,
          descriptionRefreshed: false,
          topicState,
          createdIds,
        } satisfies CloneFromChildResponse;
      }
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const title = input.forceCopy
        ? forceCopyTitle(snapshot, attempt)
        : snapshot.topicTitle;
      const createdTopic = await insertBridgeTopic(database, {
        curriculumId: curriculum.id,
        bookId: resolvedBook.book.id,
        snapshot,
        title,
      });

      if (createdTopic) {
        createdIds.topicId = createdTopic.id;
        return {
          topicId: createdTopic.id,
          subjectId: resolvedSubject.subject.id,
          alreadyExisted: false,
          descriptionDivergent: false,
          descriptionRefreshed: false,
          topicState: 'unstarted',
          createdIds,
        } satisfies CloneFromChildResponse;
      }

      const racedTopic = await findTopicByTitle(
        database,
        resolvedBook.book.id,
        title,
      );
      if (racedTopic && !input.forceCopy) {
        const topicState = await getTopicState(
          database,
          adultProfileId,
          resolvedSubject.subject.id,
          racedTopic.id,
        );
        return {
          topicId: racedTopic.id,
          subjectId: resolvedSubject.subject.id,
          alreadyExisted: true,
          descriptionDivergent: false,
          descriptionRefreshed: false,
          topicState,
          createdIds,
        } satisfies CloneFromChildResponse;
      }
    }

    throw new Error('Topic clone insert failed after conflict retries');
  });

  cacheCloneResult(adultProfileId, input, result);
  return result;
}

async function topicBelongsToProfile(
  db: Database,
  profileId: string,
  topicId: string,
): Promise<OwnedCurriculumTopic | null> {
  return findOwnedCurriculumTopic(db, { profileId, topicId });
}

// [BUG-863] Delete the book + subject that THIS clone created, but only when
// each is now empty. Ownership is enforced on every delete: the book delete is
// scoped to the adult's subject chain (book → subject.profileId = adult) and the
// subject delete is scoped directly to subjects.profileId = adult. The emptiness
// guards (NOT EXISTS remaining topic / book) ensure a pre-existing or
// still-populated ancestor is never removed. Deleting the subject cascades its
// curricula + books + topics, so the book delete is ordered first and is a no-op
// when the subject delete already swept it.
async function cascadeUndoCreatedAncestors(
  db: Database,
  adultProfileId: string,
  createdIds: CloneCreatedIds,
): Promise<void> {
  if (createdIds.bookId) {
    await db.delete(curriculumBooks).where(
      and(
        eq(curriculumBooks.id, createdIds.bookId),
        sql`EXISTS (
          SELECT 1
          FROM ${subjects}
          WHERE ${subjects.id} = ${curriculumBooks.subjectId}
            AND ${subjects.profileId} = ${adultProfileId}
        )`,
        sql`NOT EXISTS (
          SELECT 1
          FROM ${curriculumTopics}
          WHERE ${curriculumTopics.bookId} = ${curriculumBooks.id}
        )`,
      ),
    );
  }

  if (createdIds.subjectId) {
    await db.delete(subjects).where(
      and(
        eq(subjects.id, createdIds.subjectId),
        eq(subjects.profileId, adultProfileId),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${curriculumBooks}
          WHERE ${curriculumBooks.subjectId} = ${subjects.id}
        )`,
      ),
    );
  }
}

export async function undoCloneFromChild(
  db: Database,
  adultProfileId: string,
  createdIds: CloneCreatedIds,
): Promise<UndoCloneFromChildResponse> {
  if (!createdIds.topicId) {
    return { deleted: { topic: false } };
  }

  const topic = await topicBelongsToProfile(
    db,
    adultProfileId,
    createdIds.topicId,
  );
  if (!topic || topic.topicSource !== 'parent_bridge') {
    return { deleted: { topic: false } };
  }

  const [deletedTopic] = await db
    .delete(curriculumTopics)
    .where(
      and(
        eq(curriculumTopics.id, topic.topicId),
        sql`NOT EXISTS (
          SELECT 1
          FROM ${learningSessions}
          WHERE ${learningSessions.profileId} = ${adultProfileId}
            AND ${learningSessions.topicId} = ${topic.topicId}
        )`,
      ),
    )
    .returning({ id: curriculumTopics.id });

  if (deletedTopic) {
    // [BUG-863] Cascade the undo to ancestors THIS clone created. createdIds
    // carries bookId/subjectId only when cloneTopicFromChild had to create them
    // (first clone into a brand-new book/subject). Without this cascade an
    // immediate undo leaves an orphan book + subject on the parent's account
    // with no UI affordance to clean up. Delete an ancestor only when it is
    // (a) present in createdIds (this clone made it), (b) now empty, and
    // (c) owned by the adult via the parent chain — guarding against deleting
    // a pre-existing or still-populated ancestor.
    await cascadeUndoCreatedAncestors(db, adultProfileId, createdIds);
    return { deleted: { topic: true } };
  }

  const [sessionStarted] = await db
    .select({ id: learningSessions.id })
    .from(learningSessions)
    .where(
      and(
        eq(learningSessions.profileId, adultProfileId),
        eq(learningSessions.topicId, topic.topicId),
      ),
    )
    .limit(1);

  if (sessionStarted) {
    return {
      deleted: { topic: false },
      reason: 'session_started',
    };
  }

  return { deleted: { topic: false } };
}
