import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { SubjectNotFoundError, type DictationMode } from '@eduagent/schemas';
import { createScopedRepository, subjects } from '@eduagent/database';
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
  completionKey?: string;
  localDate: string;
  sentenceCount: number;
  mistakeCount: number | null;
  mode: DictationMode;
  reviewed: boolean;
  subjectId?: string | null;
}

export function deriveLegacyDictationCompletionKey(
  profileId: string,
  localDate: string,
  mode: DictationMode,
): string {
  const hex = createHash('md5')
    .update(`dictation-result:${profileId}:${localDate}:${mode}`)
    .digest('hex')
    .split('');
  hex[12] = '5';
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

export async function recordDictationResult(
  db: Database,
  profileId: string,
  input: RecordResultInput,
) {
  // [SECURITY] Verify the caller owns the subject BEFORE writing anything.
  // `input.subjectId` is client-supplied; without this check an attacker
  // could plant `dictation_results` AND `practice_activity_events` rows
  // tagged with another profile's subject (write-side IDOR). The check uses
  // the scoped repository so `subjects.profile_id = $profileId` is enforced
  // at the repo layer, matching the vocabulary path's pattern.
  if (input.subjectId != null) {
    const ownershipRepo = createScopedRepository(db, profileId);
    const subject = await ownershipRepo.subjects.findFirst(
      eq(subjects.id, input.subjectId),
    );
    if (!subject) {
      throw new SubjectNotFoundError();
    }
  }

  const completionKey =
    input.completionKey ??
    deriveLegacyDictationCompletionKey(profileId, input.localDate, input.mode);
  const completedAt = new Date();
  const row = await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const repo = createScopedRepository(txDb, profileId);
    const inserted = await repo.dictationResults.insert({
      completionKey,
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
          completionKey,
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
  // memory. Ordering and distinctness happen before the limit so the in-memory
  // streak walk never runs over an arbitrary unordered subset.
  const recentDateRows =
    await repo.dictationResults.listRecentDistinctDates(60);
  if (recentDateRows.length === 0) {
    return { streak: 0, lastDate: null };
  }

  // [BUG-850] Normalize each row.date to an ISO `YYYY-MM-DD` string at the
  // boundary. The neon-serverless (production WebSocket) driver returns DATE
  // columns as raw JS `Date` objects, not strings; the streak walk below
  // compares against string `expected` values (`getPreviousDate` returns a
  // sliced ISO string), so an un-normalized `Date` makes `date === expected`
  // always false and collapses the streak to 1.
  const uniqueDates = recentDateRows.map((row) => toIsoDate(row.date));

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

// [BUG-850] The DB driver may hand back a DATE column as either an ISO string
// (HTTP driver) or a raw JS `Date` (neon-serverless WebSocket driver). Normalize
// both to a `YYYY-MM-DD` string so the streak comparison is shape-stable.
function toIsoDate(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
