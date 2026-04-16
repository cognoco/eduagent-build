import { Hono } from 'hono';
import { z } from 'zod';
import {
  prepareHomeworkInputSchema,
  dictationModeSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import {
  createScopedRepository,
  dictationResults,
  type Database,
} from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { requireProfileId } from '../middleware/profile-scope';
import { apiError, validationError } from '../errors';
import { prepareHomework, generateDictation } from '../services/dictation';

// ---------------------------------------------------------------------------
// Dictation Routes
//
// POST /dictation/prepare-homework — splits OCR'd/typed homework text into
//   dictation sentences with spoken-punctuation variants.
//
// POST /dictation/generate — generates age-appropriate dictation content
//   themed around the learner's recent study topics.
//
// POST /dictation/result — records a completed dictation session result
//   (for streak tracking and progress history).
//
// GET /dictation/streak — returns consecutive-days dictation streak for profile.
// ---------------------------------------------------------------------------

type DictationRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    profileMeta: ProfileMeta;
  };
};

// RF-04: Accept localDate from client; validate it is within ±1 day of server UTC.
const dictationResultInputSchema = z.object({
  localDate: z.string().date(),
  sentenceCount: z.number().int().positive(),
  mistakeCount: z.number().int().nonnegative().nullable().optional(),
  mode: dictationModeSchema,
  reviewed: z.boolean().optional().default(false),
});

function getServerDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Validates that the client-supplied localDate is within ±1 day of server UTC.
 * Returns null if the date is acceptable, or an error message string if not.
 */
function validateLocalDate(localDate: string): string | null {
  const serverDateMs = new Date(getServerDate()).getTime();
  const clientDateMs = new Date(localDate).getTime();
  const diffDays = Math.abs(serverDateMs - clientDateMs) / (24 * 60 * 60 * 1000);
  if (diffDays > 1) {
    return `localDate "${localDate}" is more than 1 day from server UTC date "${getServerDate()}". Use the current local date.`;
  }
  return null;
}

export const dictationRoutes = new Hono<DictationRouteEnv>()

  // -------------------------------------------------------------------------
  // POST /dictation/prepare-homework
  // Splits raw homework text into dictation sentences with punctuation variants.
  // -------------------------------------------------------------------------
  .post('/dictation/prepare-homework', async (c) => {
    requireProfileId(c.get('profileId'));

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = prepareHomeworkInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, 'text is required and must be between 1 and 10000 characters');
    }

    const result = await prepareHomework(parsed.data.text);
    return c.json(result, 200);
  })

  // -------------------------------------------------------------------------
  // POST /dictation/generate
  // Generates age-appropriate dictation content from the learner's study context.
  // -------------------------------------------------------------------------
  .post('/dictation/generate', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');
    const profileMeta = c.get('profileMeta');

    // Derive age from birthYear available in profileMeta (injected by profileScopeMiddleware)
    const ageYears = profileMeta?.birthYear
      ? new Date().getFullYear() - profileMeta.birthYear
      : 10; // sensible default for unknown age

    // Fetch nativeLanguage from teachingPreferences (not on profile directly)
    const repo = createScopedRepository(db, profileId);
    const prefs = await repo.teachingPreferences.findFirst();
    const nativeLanguage = prefs?.nativeLanguage ?? 'en';

    // Pull recent subject names for thematic context
    // learningSessions links to subjects — grab the most recent ones
    const recentSessions = await repo.sessions.findMany();
    const subjectIds = [
      ...new Set(
        recentSessions
          .slice(0, 10)
          .map((s) => s.subjectId)
          .filter(Boolean)
      ),
    ];

    // Fetch subject names from the scoped repository
    const recentSubjects = await repo.subjects.findMany();
    const recentTopics = recentSubjects
      .filter((s) => subjectIds.includes(s.id))
      .map((s) => s.name)
      .slice(0, 3);

    const result = await generateDictation({
      recentTopics,
      nativeLanguage,
      ageYears,
    });

    return c.json(result, 200);
  })

  // -------------------------------------------------------------------------
  // POST /dictation/result
  // Records a completed dictation session result (RF-04: accepts localDate from client).
  // -------------------------------------------------------------------------
  .post('/dictation/result', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return validationError(c, 'Request body must be valid JSON');
    }

    const parsed = dictationResultInputSchema.safeParse(body);
    if (!parsed.success) {
      return validationError(c, 'Invalid input: localDate, sentenceCount, and mode are required');
    }

    // RF-04: Validate client-supplied date is within ±1 day of server UTC
    const dateError = validateLocalDate(parsed.data.localDate);
    if (dateError) {
      return apiError(c, 400, ERROR_CODES.VALIDATION_ERROR, dateError);
    }

    const [row] = await db
      .insert(dictationResults)
      .values({
        profileId,
        date: parsed.data.localDate,
        sentenceCount: parsed.data.sentenceCount,
        mistakeCount: parsed.data.mistakeCount ?? null,
        mode: parsed.data.mode,
        reviewed: parsed.data.reviewed,
      })
      .returning();

    return c.json({ result: row }, 201);
  })

  // -------------------------------------------------------------------------
  // GET /dictation/streak
  // Returns consecutive days of dictation practice for the profile.
  // -------------------------------------------------------------------------
  .get('/dictation/streak', async (c) => {
    const profileId = requireProfileId(c.get('profileId'));
    const db = c.get('db');

    // Fetch all dictation result dates for this profile, ordered desc
    const rows = await db.query.dictationResults.findMany({
      where: (table, { eq }) => eq(table.profileId, profileId),
      orderBy: (table, { desc }) => [desc(table.date)],
    });

    if (rows.length === 0) {
      return c.json({ streak: 0, lastDate: null });
    }

    // Compute consecutive-day streak from the most recent date backwards
    const today = getServerDate();
    const dates = rows.map((r) => r.date);

    let streak = 0;
    let expected = today;

    for (const date of dates) {
      if (date === expected) {
        streak++;
        expected = getPreviousDate(expected);
      } else if (date < expected) {
        // Gap detected — streak ends
        break;
      }
      // Skip duplicates (same date, multiple results)
    }

    // If the most recent date is not today or yesterday, streak is 0
    const mostRecentDate = dates[0]!;
    const daysSinceMostRecent =
      (new Date(today).getTime() - new Date(mostRecentDate).getTime()) /
      (24 * 60 * 60 * 1000);

    if (daysSinceMostRecent > 1) {
      return c.json({ streak: 0, lastDate: mostRecentDate });
    }

    return c.json({ streak, lastDate: mostRecentDate });
  });

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
