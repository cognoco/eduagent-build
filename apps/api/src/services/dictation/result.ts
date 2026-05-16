import type { DictationMode } from '@eduagent/schemas';
import { createScopedRepository } from '@eduagent/database';
import type { Database } from '@eduagent/database';
import { recordPracticeActivityEvent } from '../practice-activity-events';
import { safeWrite } from '../safe-non-core';
import type { GenerateContext } from './generate';

// ---------------------------------------------------------------------------
// Dictation Result & Streak Service
//
// Records completed dictation sessions and computes consecutive-day streaks.
// All DB access goes through the scoped repository to enforce profile isolation.
// ---------------------------------------------------------------------------

export interface RecordResultInput {
  localDate: string;
  sentenceCount: number;
  mistakeCount: number | null;
  mode: DictationMode;
  reviewed: boolean;
  subjectId?: string | null;
}

export async function recordDictationResult(
  db: Database,
  profileId: string,
  input: RecordResultInput,
) {
  const completedAt = new Date();
  const row = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const repo = createScopedRepository(txDb, profileId);
    const inserted = await repo.dictationResults.insert({
      date: input.localDate,
      sentenceCount: input.sentenceCount,
      mistakeCount: input.mistakeCount,
      mode: input.mode,
      reviewed: input.reviewed,
    });
    if (!inserted)
      throw new Error('Dictation result insert did not return a row');
    return inserted;
  });

  await safeWrite(
    () =>
      recordPracticeActivityEvent(db, {
        profileId,
        subjectId: input.subjectId ?? null,
        activityType: 'dictation',
        activitySubtype: input.mode,
        completedAt,
        score:
          input.mistakeCount == null
            ? null
            : Math.max(0, input.sentenceCount - input.mistakeCount),
        total: input.sentenceCount,
        sourceType: 'dictation_result',
        sourceId: row.id,
        metadata: {
          reviewed: input.reviewed,
          mistakeCount: input.mistakeCount,
        },
      }),
    'dictation.practice-activity-event',
    { profileId },
  );

  return row;
}

export interface StreakResult {
  streak: number;
  lastDate: string | null;
}

export async function getDictationStreak(
  db: Database,
  profileId: string,
): Promise<StreakResult> {
  const repo = createScopedRepository(db, profileId);

  // [IMP-3] Only fetch the most recent 60 dates — the streak algorithm
  // breaks at the first gap, so 60 days is more than sufficient. Without a
  // limit, a child practising daily for years would load every row into
  // memory. The (profile_id, date) index covers this query efficiently.
  const rows = await repo.dictationResults.findMany(undefined, undefined, 60);
  if (rows.length === 0) {
    return { streak: 0, lastDate: null };
  }

  // Sort desc by date, deduplicate
  const uniqueDates = [
    ...new Set(rows.map((r) => r.date).sort((a, b) => (a > b ? -1 : 1))),
  ];

  const today = getServerDate();
  const mostRecentDate = uniqueDates[0];
  if (mostRecentDate == null) return { streak: 0, lastDate: null };
  const daysSinceMostRecent =
    (new Date(today).getTime() - new Date(mostRecentDate).getTime()) /
    (24 * 60 * 60 * 1000);

  // If last practice was more than 1 day ago, streak is broken
  if (daysSinceMostRecent > 1) {
    return { streak: 0, lastDate: mostRecentDate };
  }

  // Start expected from the most recent date (today or yesterday)
  let expected = mostRecentDate;
  let streak = 0;

  for (const date of uniqueDates) {
    if (date === expected) {
      streak++;
      expected = getPreviousDate(expected);
    } else {
      break;
    }
  }

  return { streak, lastDate: mostRecentDate };
}

/**
 * Fetches the context needed by generateDictation from the learner's profile:
 * native language from teaching preferences and age from birth year.
 */
export async function fetchGenerateContext(
  db: Database,
  profileId: string,
  birthYear: number,
): Promise<GenerateContext> {
  const repo = createScopedRepository(db, profileId);

  const ageYears = new Date().getFullYear() - birthYear;

  const prefs = await repo.teachingPreferences.findFirst();
  const nativeLanguage = prefs?.nativeLanguage ?? 'en';

  return { nativeLanguage, ageYears };
}

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
