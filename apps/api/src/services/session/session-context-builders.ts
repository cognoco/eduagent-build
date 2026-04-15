// ---------------------------------------------------------------------------
// Session Context Builders — active time computation and context helpers
// ---------------------------------------------------------------------------

import { eq, and, asc, desc, inArray, isNotNull } from 'drizzle-orm';
import {
  learningSessions,
  curriculumBooks,
  subjects,
  curricula,
  curriculumTopics,
  topicNotes,
  createScopedRepository,
  type Database,
} from '@eduagent/database';

// ---------------------------------------------------------------------------
// FR210: Active time computation (internal analytics)
// ---------------------------------------------------------------------------

const FALLBACK_GAP_CAP_SECONDS = 10 * 60; // 10 min when no LLM estimate
const PACE_BUFFER = 1.5; // 1.5x buffer for slower-than-estimated work

export interface TimedEvent {
  createdAt: Date;
  metadata?: unknown;
  eventType?: string;
}

export function perGapCap(event: TimedEvent): number {
  const meta = event.metadata as Record<string, unknown> | null | undefined;
  const minutes = meta?.expectedResponseMinutes;
  if (typeof minutes === 'number' && minutes > 0) {
    return minutes * 60 * PACE_BUFFER;
  }
  return FALLBACK_GAP_CAP_SECONDS;
}

/** Compute active learning seconds from session event timestamps.
 *  Each inter-event gap is capped at the LLM-estimated expected response time
 *  (from the later event's metadata) × pace buffer. Falls back to 10 min. */
export function computeActiveSeconds(
  sessionStartedAt: Date,
  events: TimedEvent[]
): number {
  if (events.length === 0) return 0;

  const sorted = [...events].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  const first = sorted[0];
  if (!first) return 0;

  let total = 0;

  // Gap from session start to first event
  const firstGap = Math.max(
    0,
    (first.createdAt.getTime() - sessionStartedAt.getTime()) / 1000
  );
  total += Math.min(firstGap, perGapCap(first));

  // Gaps between consecutive events
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (!curr || !next) continue;
    const gap = Math.max(
      0,
      (next.createdAt.getTime() - curr.createdAt.getTime()) / 1000
    );
    total += Math.min(gap, perGapCap(next));
  }

  return Math.round(total);
}

export function formatLearningRecency(endedAt: Date): string {
  const diffDays = Math.floor(
    (Date.now() - endedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return 'covered today';
  if (diffDays === 1) return 'covered yesterday';
  if (diffDays < 7) return `covered ${diffDays} days ago`;
  return `covered on ${endedAt.toISOString().slice(0, 10)}`;
}

export async function buildBookLearningHistoryContext(
  db: Database,
  profileId: string,
  currentTopicId: string,
  bookId: string
): Promise<string | undefined> {
  const book = await db.query.curriculumBooks.findFirst({
    where: eq(curriculumBooks.id, bookId),
  });
  if (!book) return undefined;

  // Verify the subject (and therefore the book) belongs to this profile using
  // the scoped repo — curriculumBooks has no profileId column so ownership is
  // verified through the subjects table.
  const repo = createScopedRepository(db, profileId);
  const subject = await repo.subjects.findFirst(
    eq(subjects.id, book.subjectId)
  );
  // If the subject doesn't belong to this profile, bail out silently.
  if (!subject) return undefined;

  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, book.subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) return undefined;

  const topics = await db.query.curriculumTopics.findMany({
    where: and(
      eq(curriculumTopics.curriculumId, curriculum.id),
      eq(curriculumTopics.bookId, bookId)
    ),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  const topicIds = topics.map((topic) => topic.id);
  if (topicIds.length === 0) return undefined;

  // [CR-2E.2] Intentional raw queries: column projection (.select) and .limit()
  // are not supported by createScopedRepository's findMany. profileId scoping
  // is enforced explicitly in the WHERE clauses below. Ownership is already
  // verified through the subject check above (line 102–107).
  const [sessions, notes] = await Promise.all([
    db
      .select({
        topicId: learningSessions.topicId,
        endedAt: learningSessions.endedAt,
      })
      .from(learningSessions)
      .where(
        and(
          eq(learningSessions.profileId, profileId),
          inArray(learningSessions.topicId, topicIds),
          inArray(learningSessions.status, ['completed', 'auto_closed']),
          isNotNull(learningSessions.endedAt)
        )
      ),
    // Fetch recent topic notes for this book (last 3, full text)
    db
      .select({
        topicId: topicNotes.topicId,
        content: topicNotes.content,
        updatedAt: topicNotes.updatedAt,
      })
      .from(topicNotes)
      .where(
        and(
          inArray(topicNotes.topicId, topicIds),
          eq(topicNotes.profileId, profileId)
        )
      )
      .orderBy(desc(topicNotes.updatedAt))
      .limit(3),
  ]);

  const latestByTopic = new Map<string, Date>();
  for (const session of sessions) {
    if (!session.topicId || !session.endedAt) continue;

    const previous = latestByTopic.get(session.topicId);
    if (!previous || previous.getTime() < session.endedAt.getTime()) {
      latestByTopic.set(session.topicId, session.endedAt);
    }
  }

  // Build chapter groupings with topic summaries
  const chapterMap = new Map<string, typeof topics>();
  for (const topic of topics) {
    if (topic.id === currentTopicId) continue;
    const chapter = topic.chapter ?? 'General';
    const list = chapterMap.get(chapter) ?? [];
    list.push(topic);
    chapterMap.set(chapter, list);
  }

  const sections: string[] = [];

  // Header with shelf and book info
  const shelfName = subject?.name ?? 'Unknown';
  sections.push(`Shelf: ${shelfName}`);
  sections.push(
    `Book: ${book.title}${book.description ? ` — "${book.description}"` : ''}`
  );

  // Chapter groupings
  if (chapterMap.size > 0) {
    sections.push('Chapters:');
    for (const [chapterName, chapterTopics] of chapterMap.entries()) {
      const coveredTopics = chapterTopics
        .filter((t) => latestByTopic.has(t.id))
        .slice(0, 5);
      if (coveredTopics.length > 0) {
        const topicNames = coveredTopics.map((t) => {
          const latest = latestByTopic.get(t.id);
          if (!latest)
            throw new Error(`Expected latestByTopic entry for topic ${t.id}`);
          const recency = formatLearningRecency(latest);
          return `${t.title} (${recency})`;
        });
        sections.push(`- ${chapterName}: ${topicNames.join(', ')}`);
      }
    }
  }

  // Recent notes
  if (notes.length > 0) {
    const topicTitleMap = new Map(topics.map((t) => [t.id, t.title]));
    sections.push('Recent notes:');
    for (const note of notes) {
      const title = topicTitleMap.get(note.topicId) ?? 'Unknown';
      // Truncate note content to avoid token blowup
      const content =
        note.content.length > 200
          ? note.content.slice(0, 200) + '...'
          : note.content;
      sections.push(`- ${title}: "${content}"`);
    }
  }

  // Only return if there is meaningful content beyond headers
  const hasTopicHistory = latestByTopic.size > 0;
  const hasNotes = notes.length > 0;
  if (!hasTopicHistory && !hasNotes) return undefined;

  sections.push(
    'Build on these naturally when they help the learner connect ideas.'
  );
  return sections.join('\n');
}

export async function buildHomeworkLibraryContext(
  db: Database,
  subjectId: string
): Promise<string | undefined> {
  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) return undefined;

  const topics = await db.query.curriculumTopics.findMany({
    where: eq(curriculumTopics.curriculumId, curriculum.id),
    orderBy: asc(curriculumTopics.sortOrder),
  });
  if (topics.length === 0) return undefined;

  return [
    "Topics already in the learner's Library for this subject:",
    ...topics.slice(0, 12).map((topic) => `- ${topic.title}`),
    'When useful, connect the homework to these topics naturally.',
  ].join('\n');
}
