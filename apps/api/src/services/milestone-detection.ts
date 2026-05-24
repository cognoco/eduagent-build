import { milestones, type Database } from '@eduagent/database';
import type {
  MilestoneRecord,
  MilestoneType,
  ProgressMetrics,
} from '@eduagent/schemas';
import { milestoneRecordSchema } from '@eduagent/schemas';

interface DetectedMilestone {
  profileId: string;
  milestoneType: MilestoneType;
  threshold: number;
  subjectId?: string | null;
  bookId?: string | null;
  metadata?: Record<string, unknown> | null;
}

const VOCABULARY_THRESHOLDS = [5, 10, 25, 50, 100, 250, 500, 1000];
const TOPIC_THRESHOLDS = [1, 3, 5, 10, 25, 50];
const BOOK_THRESHOLDS = [1, 3, 5, 10];
const SESSION_THRESHOLDS = [1, 3, 5, 10, 25, 50, 100, 250];
const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100];
const LEARNING_TIME_THRESHOLDS = [1, 5, 10, 25, 50, 100];
const TOPICS_EXPLORED_THRESHOLDS = [1, 3, 5, 10, 25];

function crossed(
  previousValue: number,
  currentValue: number,
  threshold: number,
): boolean {
  return previousValue < threshold && currentValue >= threshold;
}

function defaultMetrics(): ProgressMetrics {
  return {
    totalSessions: 0,
    totalActiveMinutes: 0,
    totalWallClockMinutes: 0,
    totalExchanges: 0,
    topicsAttempted: 0,
    topicsMastered: 0,
    topicsInProgress: 0,
    booksCompleted: 0,
    vocabularyTotal: 0,
    vocabularyMastered: 0,
    vocabularyLearning: 0,
    vocabularyNew: 0,
    retentionCardsDue: 0,
    retentionCardsStrong: 0,
    retentionCardsFading: 0,
    currentStreak: 0,
    longestStreak: 0,
    subjects: [],
  };
}

export function detectMilestones(
  profileId: string,
  previousMetrics: ProgressMetrics | null,
  currentMetrics: ProgressMetrics,
): DetectedMilestone[] {
  const previous = previousMetrics ?? defaultMetrics();
  const detected: DetectedMilestone[] = [];

  for (const threshold of VOCABULARY_THRESHOLDS) {
    if (
      crossed(
        previous.vocabularyTotal,
        currentMetrics.vocabularyTotal,
        threshold,
      )
    ) {
      detected.push({
        profileId,
        milestoneType: 'vocabulary_count',
        threshold,
      });
    }
  }

  for (const threshold of TOPIC_THRESHOLDS) {
    if (
      crossed(previous.topicsMastered, currentMetrics.topicsMastered, threshold)
    ) {
      detected.push({
        profileId,
        milestoneType: 'topic_mastered_count',
        threshold,
      });
    }
  }

  for (const threshold of BOOK_THRESHOLDS) {
    if (
      crossed(previous.booksCompleted, currentMetrics.booksCompleted, threshold)
    ) {
      detected.push({
        profileId,
        milestoneType: 'book_completed',
        threshold,
      });
    }
  }

  for (const threshold of SESSION_THRESHOLDS) {
    if (
      crossed(previous.totalSessions, currentMetrics.totalSessions, threshold)
    ) {
      detected.push({
        profileId,
        milestoneType: 'session_count',
        threshold,
      });
    }
  }

  for (const threshold of STREAK_THRESHOLDS) {
    if (
      crossed(previous.currentStreak, currentMetrics.currentStreak, threshold)
    ) {
      detected.push({
        profileId,
        milestoneType: 'streak_length',
        threshold,
      });
    }
  }

  const previousHours = Math.floor(previous.totalActiveMinutes / 60);
  const currentHours = Math.floor(currentMetrics.totalActiveMinutes / 60);
  for (const threshold of LEARNING_TIME_THRESHOLDS) {
    if (crossed(previousHours, currentHours, threshold)) {
      detected.push({
        profileId,
        milestoneType: 'learning_time',
        threshold,
      });
    }
  }

  for (const subject of currentMetrics.subjects) {
    const previousSubject =
      previous.subjects.find(
        (candidate) => candidate.subjectId === subject.subjectId,
      ) ?? null;
    const previousExplored = previousSubject?.topicsExplored ?? 0;

    if (
      subject.topicsTotal > 0 &&
      crossed(
        previousSubject?.topicsMastered ?? 0,
        subject.topicsMastered,
        subject.topicsTotal,
      )
    ) {
      detected.push({
        profileId,
        milestoneType: 'subject_mastered',
        threshold: subject.topicsTotal,
        subjectId: subject.subjectId,
        metadata: {
          subjectName: subject.subjectName,
        },
      });
    }

    if (subject.topicsExplored > 0) {
      for (const threshold of TOPICS_EXPLORED_THRESHOLDS) {
        if (crossed(previousExplored, subject.topicsExplored, threshold)) {
          detected.push({
            profileId,
            milestoneType: 'topics_explored',
            threshold,
            subjectId: subject.subjectId,
            metadata: {
              subjectName: subject.subjectName,
            },
          });
        }
      }
    }
  }

  return detected;
}

function mapMilestoneRow(row: typeof milestones.$inferSelect): MilestoneRecord {
  return milestoneRecordSchema.parse({
    id: row.id,
    profileId: row.profileId,
    milestoneType: row.milestoneType,
    threshold: row.threshold,
    subjectId: row.subjectId ?? null,
    bookId: row.bookId ?? null,
    metadata:
      (row.metadata as Record<string, unknown> | null | undefined) ?? null,
    celebratedAt: row.celebratedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function storeMilestones(
  db: Database,
  profileId: string,
  detected: DetectedMilestone[],
): Promise<MilestoneRecord[]> {
  if (detected.length === 0) {
    return [];
  }

  // [CR-2026-05-21-067] Bulk insert: one round-trip for the full batch instead
  // of N. onConflictDoNothing() still applies per-row so existing milestones
  // are silently skipped and only newly-inserted rows come back via RETURNING.
  const rows = await db
    .insert(milestones)
    .values(
      detected.map((milestone) => ({
        profileId,
        milestoneType: milestone.milestoneType,
        threshold: milestone.threshold,
        subjectId: milestone.subjectId ?? null,
        bookId: milestone.bookId ?? null,
        metadata: milestone.metadata ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning();

  return rows.map(mapMilestoneRow);
}
