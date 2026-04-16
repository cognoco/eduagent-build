import type { DictationMode } from '@eduagent/schemas';
import { createScopedRepository } from '@eduagent/database';
import type { Database } from '@eduagent/database';
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
}

export async function recordDictationResult(
  db: Database,
  profileId: string,
  input: RecordResultInput
) {
  const repo = createScopedRepository(db, profileId);
  return repo.dictationResults.insert({
    date: input.localDate,
    sentenceCount: input.sentenceCount,
    mistakeCount: input.mistakeCount,
    mode: input.mode,
    reviewed: input.reviewed,
  });
}

export interface StreakResult {
  streak: number;
  lastDate: string | null;
}

export async function getDictationStreak(
  db: Database,
  profileId: string
): Promise<StreakResult> {
  const repo = createScopedRepository(db, profileId);

  // The scoped repo returns all results for the profile; we need them
  // ordered by date desc to compute the streak.
  const rows = await repo.dictationResults.findMany();
  if (rows.length === 0) {
    return { streak: 0, lastDate: null };
  }

  // Sort desc by date, deduplicate
  const uniqueDates = [
    ...new Set(rows.map((r) => r.date).sort((a, b) => (a > b ? -1 : 1))),
  ];

  const today = getServerDate();
  const mostRecentDate = uniqueDates[0]!;
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
 * native language from teaching preferences, and recent topic names from sessions.
 */
export async function fetchGenerateContext(
  db: Database,
  profileId: string,
  birthYear: number | null
): Promise<GenerateContext> {
  const repo = createScopedRepository(db, profileId);

  const ageYears = birthYear ? new Date().getFullYear() - birthYear : 10; // sensible default

  const prefs = await repo.teachingPreferences.findFirst();
  const nativeLanguage = prefs?.nativeLanguage ?? 'en';

  // Pull recent sessions → subject IDs → subject names
  const recentSessions = await repo.sessions.findMany();
  const subjectIds = [
    ...new Set(
      recentSessions
        .slice(0, 10)
        .map((s) => s.subjectId)
        .filter(Boolean)
    ),
  ];

  const allSubjects = await repo.subjects.findMany();
  const recentTopics = allSubjects
    .filter((s) => subjectIds.includes(s.id))
    .map((s) => s.name)
    .slice(0, 3);

  return { recentTopics, nativeLanguage, ageYears };
}

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
