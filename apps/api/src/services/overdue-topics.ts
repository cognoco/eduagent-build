import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import {
  createScopedRepository,
  curricula,
  curriculumBooks,
  curriculumTopics,
  needsDeepeningTopics,
  retentionCards,
  subjects,
  type Database,
} from '@eduagent/database';
import type {
  OverdueSubject,
  OverdueTopic,
  OverdueTopicsResponse,
  RetentionStatus,
} from '@eduagent/schemas';
import { getRetentionStatus } from './retention';

const DAY_MS = 24 * 60 * 60 * 1000;

// [Flow 3 / RR-5 / T10] Worst-first ordering for the merged relearn queue:
// forgotten topics surface above strong ones. getRetentionStatus()
// (services/retention.ts) is the single source of truth for the band — we only
// map its result to a sort rank here so thresholds never get duplicated.
const BAND_RANK: Record<RetentionStatus, number> = {
  forgotten: 0,
  weak: 1,
  fading: 2,
  strong: 3,
};

function toOverdueDays(now: Date, nextReviewAt: Date | null): number {
  const reviewedAt = nextReviewAt?.getTime() ?? now.getTime();
  return Math.max(0, Math.floor((now.getTime() - reviewedAt) / DAY_MS));
}

// Compute the retention band for an overdue card from its SM-2 schedule.
// getRetentionStatus reads only lastReviewedAt + intervalDays; the remaining
// RetentionState fields are placeholders it never inspects.
function bandForCard(
  lastReviewedAt: Date | null,
  intervalDays: number | null,
): RetentionStatus {
  return getRetentionStatus({
    topicId: '',
    easeFactor: 0,
    intervalDays: intervalDays ?? 1,
    repetitions: 0,
    failureCount: 0,
    consecutiveSuccesses: 0,
    xpStatus: 'pending',
    nextReviewAt: null,
    lastReviewedAt: lastReviewedAt ? lastReviewedAt.toISOString() : null,
  });
}

// Per-topic sort metadata kept out of the response shape. flaggedRecencyMs is
// the needs_deepening row's createdAt (ms) for flagged-only rows; 0 otherwise.
interface TopicSortMeta {
  bandRank: number;
  flaggedRecencyMs: number;
}

export async function getOverdueTopicsGrouped(
  db: Database,
  profileId: string,
): Promise<OverdueTopicsResponse> {
  const repo = createScopedRepository(db, profileId);
  const now = new Date();

  // Real total may exceed the 500-card display cap. Run a separate count so
  // the UI can show "500+" or the true backlog without loading all rows.
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(retentionCards)
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, retentionCards.topicId),
    )
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
        eq(subjects.profileId, profileId),
      ),
    )
    .where(
      and(
        eq(retentionCards.profileId, profileId),
        lt(retentionCards.nextReviewAt, now),
      ),
    );
  const countAvailable = countRow?.count != null;

  const overdueCards = await db
    .select({
      topicId: retentionCards.topicId,
      nextReviewAt: retentionCards.nextReviewAt,
      lastReviewedAt: retentionCards.lastReviewedAt,
      intervalDays: retentionCards.intervalDays,
      failureCount: retentionCards.failureCount,
      topicTitle: curriculumTopics.title,
      subjectId: subjects.id,
    })
    .from(retentionCards)
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, retentionCards.topicId),
    )
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
        eq(subjects.profileId, profileId),
      ),
    )
    .where(
      and(
        eq(retentionCards.profileId, profileId),
        lt(retentionCards.nextReviewAt, now),
      ),
    )
    .orderBy(asc(retentionCards.nextReviewAt))
    .limit(500);

  // [Flow 3 / RR-10 / T10] Flagged-weak topics (needs_deepening_topics, status
  // active/pending_review). Scoped through the full topic parent chain so a
  // foreign topic title can never leak: the topic's real owning subject (via
  // books + curricula) must equal the needs_deepening row's subjectId AND be
  // owned by profileId. needs_deepening_topics carries an independent topicId FK
  // (assessments.ts), so a corrupt/stale row with the caller's profileId +
  // subjectId but another profile's topicId would otherwise pull that profile's
  // curriculumTopics.title. Verifying curriculumTopics → books/curricula →
  // subjects (matching the overdue query above) closes that gap.
  const flaggedRows = await db
    .select({
      topicId: needsDeepeningTopics.topicId,
      concept: needsDeepeningTopics.concept,
      createdAt: needsDeepeningTopics.createdAt,
      topicTitle: curriculumTopics.title,
      subjectId: subjects.id,
      subjectName: subjects.name,
    })
    .from(needsDeepeningTopics)
    .innerJoin(
      curriculumTopics,
      eq(curriculumTopics.id, needsDeepeningTopics.topicId),
    )
    .innerJoin(curriculumBooks, eq(curriculumBooks.id, curriculumTopics.bookId))
    .innerJoin(curricula, eq(curricula.id, curriculumTopics.curriculumId))
    .innerJoin(
      subjects,
      and(
        eq(subjects.id, curriculumBooks.subjectId),
        eq(subjects.id, curricula.subjectId),
        eq(subjects.id, needsDeepeningTopics.subjectId),
        eq(subjects.profileId, profileId),
      ),
    )
    .where(
      and(
        eq(needsDeepeningTopics.profileId, profileId),
        inArray(needsDeepeningTopics.status, ['active', 'pending_review']),
      ),
    )
    .orderBy(desc(needsDeepeningTopics.createdAt));

  const totalOverdue = countRow?.count ?? overdueCards.length;

  if (overdueCards.length === 0 && flaggedRows.length === 0) {
    return {
      totalOverdue: 0,
      subjects: [],
      truncated: false,
      displayedCount: 0,
    };
  }

  // Resolve subject names for overdue subjects via the scoped repo; flagged-only
  // subjects carry their name inline from the join above.
  const subjectIds = [...new Set(overdueCards.map((card) => card.subjectId))];
  const subjectsRows =
    subjectIds.length > 0
      ? await repo.subjects.findMany(inArray(subjects.id, subjectIds))
      : [];
  const subjectLookup = new Map(subjectsRows.map((s) => [s.id, s]));

  const subjectMap = new Map<string, OverdueSubject>();
  // topicId → its topic object (for reason-tag mutation when a flagged row
  // matches an overdue topic) and its sort metadata.
  const topicLookup = new Map<string, OverdueTopic>();
  const sortMeta = new Map<string, TopicSortMeta>();

  for (const card of overdueCards) {
    const subject = subjectLookup.get(card.subjectId);
    if (!subject) continue;

    const entry = subjectMap.get(subject.id) ?? {
      subjectId: subject.id,
      subjectName: subject.name,
      overdueCount: 0,
      topics: [],
    };

    entry.overdueCount += 1;
    const band = bandForCard(card.lastReviewedAt, card.intervalDays);
    const topic: OverdueTopic = {
      topicId: card.topicId,
      topicTitle: card.topicTitle,
      overdueDays: toOverdueDays(now, card.nextReviewAt),
      failureCount: card.failureCount ?? 0,
      reason: 'overdue',
      retentionStatus: band,
    };
    entry.topics.push(topic);
    topicLookup.set(card.topicId, topic);
    sortMeta.set(card.topicId, {
      bandRank: BAND_RANK[band],
      flaggedRecencyMs: 0,
    });

    subjectMap.set(subject.id, entry);
  }

  // Merge flagged-weak rows: tag an existing overdue topic as 'both' (attaching
  // its concept), or add a flagged-only topic tagged 'flagged_weak'. Dedup is by
  // topicId; a topic belongs to exactly one subject. flaggedRows arrive newest
  // first, so the first row seen for a topicId carries the freshest concept.
  for (const flagged of flaggedRows) {
    const existing = topicLookup.get(flagged.topicId);
    if (existing) {
      existing.reason = 'both';
      if (existing.concept == null && flagged.concept != null) {
        existing.concept = flagged.concept;
      }
      continue;
    }

    const entry = subjectMap.get(flagged.subjectId) ?? {
      subjectId: flagged.subjectId,
      subjectName: flagged.subjectName,
      overdueCount: 0,
      topics: [],
    };

    const topic: OverdueTopic = {
      topicId: flagged.topicId,
      topicTitle: flagged.topicTitle,
      overdueDays: 0,
      failureCount: 0,
      reason: 'flagged_weak',
      // Flagged-only rows have no SM-2 schedule to derive a band from — treat
      // as 'forgotten' to match the BAND_RANK.forgotten assigned below.
      retentionStatus: 'forgotten',
      ...(flagged.concept != null ? { concept: flagged.concept } : {}),
    };
    entry.topics.push(topic);
    topicLookup.set(flagged.topicId, topic);
    // Flagged-only rows have no SM-2 schedule → forgotten band, ordered among
    // themselves by needs_deepening recency (newest first).
    sortMeta.set(flagged.topicId, {
      bandRank: BAND_RANK.forgotten,
      flaggedRecencyMs: flagged.createdAt.getTime(),
    });

    subjectMap.set(flagged.subjectId, entry);
  }

  const groupedSubjects = [...subjectMap.values()]
    .map((subject) => ({
      ...subject,
      topics: [...subject.topics].sort((a, b) => {
        const aMeta = sortMeta.get(a.topicId);
        const bMeta = sortMeta.get(b.topicId);
        const aBand = aMeta?.bandRank ?? BAND_RANK.forgotten;
        const bBand = bMeta?.bandRank ?? BAND_RANK.forgotten;
        if (aBand !== bBand) {
          return aBand - bBand;
        }
        if (b.overdueDays !== a.overdueDays) {
          return b.overdueDays - a.overdueDays;
        }
        const aRecency = aMeta?.flaggedRecencyMs ?? 0;
        const bRecency = bMeta?.flaggedRecencyMs ?? 0;
        if (bRecency !== aRecency) {
          return bRecency - aRecency;
        }
        return a.topicTitle.localeCompare(b.topicTitle);
      }),
    }))
    .sort((a, b) => {
      if (b.overdueCount !== a.overdueCount) {
        return b.overdueCount - a.overdueCount;
      }
      return a.subjectName.localeCompare(b.subjectName);
    });

  // [BUG-470 / P2] Surface truncation so the mobile UI can show "500+" rather
  // than implying the displayed list is the full backlog. The cap is 500 cards;
  // if the returned list hits exactly 500, totalOverdue > displayedCount signals
  // the UX discrepancy and truncated:true makes it unambiguous. Truncation is an
  // overdue-card concern only — the flagged-weak merge does not affect the cap.
  //
  // Fail-open: if countRow?.count is null (e.g. the COUNT query returned no
  // row) and we already hit the 500-row cap, we cannot know the true total —
  // assume truncated so the UI shows "500+" rather than a misleadingly-exact
  // number. This is conservative and correct.
  const displayedCount = overdueCards.length;
  const truncated =
    displayedCount === 500 && (!countAvailable || totalOverdue > 500);

  return {
    totalOverdue,
    subjects: groupedSubjects,
    truncated,
    displayedCount,
  };
}
