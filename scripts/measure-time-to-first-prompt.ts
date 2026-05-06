import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// scripts/measure-time-to-first-prompt.ts
//
// Measure time from subject creation to first mentor `ai_response` event
// in the first **curriculum** session for that subject. Cohort: profiles
// whose all-time-first subject FALLS INSIDE the window — these are the
// genuinely-onboarding users that 5d (curriculum pre-warm) is supposed
// to help.
//
// Naming caveat: interview AI turns live in `onboarding_drafts.exchange_history`
// (jsonb), not in `session_events`. The user has already exchanged messages
// with the AI by the time `session_events.ai_response` fires. So "time to
// first prompt" here measures interview duration + curriculum generation +
// first-session boot — the full cold path. Read the plan's prose before
// citing this number.
//
// Usage (from repo root):
//   doppler run -c stg -- pnpm tsx scripts/measure-time-to-first-prompt.ts \
//     --from 2026-04-15 --to 2026-05-06
//
// Output: JSON to stdout, structured per ResultBundle.

/**
 * Rows that landed beyond this window after subject creation are bucketed
 * as `delayedStart` and excluded from percentile reporting. The interview
 * is timeboxed (~3 min) + curriculum gen (<30s) + first-session boot
 * (<2s); >60 min means the user closed the app and returned later, which
 * 5d cannot move.
 */
export const REACHED_CAP_SECONDS = 60 * 60;

/** Below this, p50 reports null (small-N noise). */
export const MIN_COHORT_FOR_P50 = 10;
/** Below this, p75/p90 report null. */
export const MIN_COHORT_FOR_P75_P90 = 20;

/**
 * Data-quality floor. Rows whose first-AI gap is below this (including
 * negatives from clock-skewed seed fixtures) are bucketed as `belowMinReply`,
 * not `reachedWithinCap`. Empirical reason: staging seed fixtures backdate
 * `session_started_at` by 1 day and E2E test runs hit mock LLMs in <1s; both
 * dominate percentiles otherwise. 5s is a defensible floor — no real human
 * onboarding (interview turn + curriculum gen + first-session boot) finishes
 * faster than that.
 */
export const MIN_HUMAN_REPLY_SECONDS = 5;

export interface RawRow {
  subjectId: string;
  profileId: string;
  isLanguage: boolean;
  subjectCreatedAt: Date;
  firstSessionStartedAt: Date | null;
  firstAiResponseAt: Date | null;
}

export interface CohortStats {
  count: number;
  p50Seconds: number | null;
  p75Seconds: number | null;
  p90Seconds: number | null;
}

export interface ResultBundle {
  windowStart: string;
  windowEnd: string;
  totalFirstSubjects: number;
  reachedFirstPrompt: number;
  /** Cohort buckets — sum should equal totalFirstSubjects. */
  buckets: {
    reachedWithinCap: number;
    delayedStart: number; // first AI reply > REACHED_CAP_SECONDS after subject create
    belowMinReply: number; // first AI reply < MIN_HUMAN_REPLY_SECONDS (incl. negative); seed/E2E artifact
    noAiAfterSessionStart: number; // session started, no ai_response observed
    noSession: number; // subject created, no learning_session ever
  };
  overall: CohortStats;
  language: CohortStats;
  nonLanguage: CohortStats;
}

/**
 * Lower nearest-rank percentile with floor. NOT linear interpolation, NOT
 * Postgres `percentile_cont`. For [1,2,3,4] @ p50 returns 3 (floor(0.5*4)=2,
 * sorted[2]). Documented and pinned by the even-length test in
 * measure-time-to-first-prompt.test.ts.
 */
export function percentile(
  sortedSeconds: ReadonlyArray<number>,
  p: number
): number | null {
  if (sortedSeconds.length === 0) return null;
  const idx = Math.min(
    sortedSeconds.length - 1,
    Math.floor((p / 100) * sortedSeconds.length)
  );
  return sortedSeconds[idx]!;
}

export function aggregate(rows: ReadonlyArray<RawRow>): ResultBundle {
  const empty: CohortStats = {
    count: 0,
    p50Seconds: null,
    p75Seconds: null,
    p90Seconds: null,
  };
  const emptyBundle: ResultBundle = {
    windowStart: '',
    windowEnd: '',
    totalFirstSubjects: 0,
    reachedFirstPrompt: 0,
    buckets: {
      reachedWithinCap: 0,
      delayedStart: 0,
      belowMinReply: 0,
      noAiAfterSessionStart: 0,
      noSession: 0,
    },
    overall: { ...empty },
    language: { ...empty },
    nonLanguage: { ...empty },
  };

  if (rows.length === 0) return emptyBundle;

  const buckets = {
    reachedWithinCap: [] as RawRow[],
    delayedStart: 0,
    belowMinReply: 0,
    noAiAfterSessionStart: 0,
    noSession: 0,
  };

  const secondsFor = (r: RawRow): number =>
    Math.round(
      (r.firstAiResponseAt!.getTime() - r.subjectCreatedAt.getTime()) / 1000
    );

  for (const r of rows) {
    if (r.firstSessionStartedAt === null) {
      buckets.noSession += 1;
      continue;
    }
    if (r.firstAiResponseAt === null) {
      buckets.noAiAfterSessionStart += 1;
      continue;
    }
    const gap = secondsFor(r);
    if (gap < MIN_HUMAN_REPLY_SECONDS) {
      // Negatives + sub-floor positives both go here. Negatives mean
      // session/ai timestamps predate subject creation (clock-skewed
      // seed fixtures); sub-floor positives are E2E mock-LLM runs.
      buckets.belowMinReply += 1;
      continue;
    }
    if (gap > REACHED_CAP_SECONDS) {
      buckets.delayedStart += 1;
      continue;
    }
    buckets.reachedWithinCap.push(r);
  }

  function statsFor(subset: ReadonlyArray<RawRow>): CohortStats {
    const sorted = subset.map(secondsFor).sort((a, b) => a - b);
    const n = sorted.length;
    const p50 = n >= MIN_COHORT_FOR_P50 ? percentile(sorted, 50) : null;
    const p75 = n >= MIN_COHORT_FOR_P75_P90 ? percentile(sorted, 75) : null;
    const p90 = n >= MIN_COHORT_FOR_P75_P90 ? percentile(sorted, 90) : null;
    return { count: n, p50Seconds: p50, p75Seconds: p75, p90Seconds: p90 };
  }

  return {
    windowStart: '',
    windowEnd: '',
    totalFirstSubjects: rows.length,
    reachedFirstPrompt: buckets.reachedWithinCap.length,
    buckets: {
      reachedWithinCap: buckets.reachedWithinCap.length,
      delayedStart: buckets.delayedStart,
      belowMinReply: buckets.belowMinReply,
      noAiAfterSessionStart: buckets.noAiAfterSessionStart,
      noSession: buckets.noSession,
    },
    overall: statsFor(buckets.reachedWithinCap),
    language: statsFor(buckets.reachedWithinCap.filter((r) => r.isLanguage)),
    nonLanguage: statsFor(
      buckets.reachedWithinCap.filter((r) => !r.isLanguage)
    ),
  };
}

function parseArgs(): { from: Date; to: Date } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const fromStr = get('--from');
  const toStr = get('--to');
  if (!fromStr || !toStr) {
    throw new Error('Usage: --from YYYY-MM-DD --to YYYY-MM-DD (both required)');
  }
  return {
    from: new Date(`${fromStr}T00:00:00Z`),
    to: new Date(`${toStr}T00:00:00Z`),
  };
}

async function main(): Promise<void> {
  const { from, to } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set — run via `doppler run -c stg --`');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    // Cohort: profiles whose ALL-TIME-FIRST subject was created in [from, to).
    // Note the structure: we compute the all-time-first subject per profile
    // FIRST (across all of subjects history), then filter by the window.
    // Doing it the other way around (`WHERE created_at >= from` before
    // `DISTINCT ON`) silently includes returning users whose 2nd/3rd subjects
    // happened to fall in the window, which contaminates the metric with
    // warm-path latency that 5d (curriculum pre-warm) cannot move.
    //
    // For each cohort subject, find the FIRST learning_session for that
    // subject and the FIRST ai_response in that session. firstSessionStartedAt
    // is null if no session ever started; firstAiResponseAt is null if a
    // session started but the LLM never replied. isLanguage = subjects
    // .language_code IS NOT NULL.
    const result = await db.execute(sql`
    WITH all_time_first_subject AS (
      SELECT DISTINCT ON (profile_id)
        id AS subject_id,
        profile_id,
        language_code,
        created_at AS subject_created_at
      FROM subjects
      ORDER BY profile_id, created_at ASC
    ),
    cohort AS (
      SELECT * FROM all_time_first_subject
      WHERE subject_created_at >= ${from} AND subject_created_at < ${to}
    ),
    first_session AS (
      SELECT DISTINCT ON (subject_id)
        id AS session_id,
        subject_id,
        started_at
      FROM learning_sessions
      WHERE subject_id IN (SELECT subject_id FROM cohort)
        AND session_type = 'curriculum'
      ORDER BY subject_id, started_at ASC
    ),
    first_ai AS (
      SELECT DISTINCT ON (session_id)
        session_id,
        created_at AS first_ai_at
      FROM session_events
      WHERE session_id IN (SELECT session_id FROM first_session)
        AND event_type = 'ai_response'
      ORDER BY session_id, created_at ASC, id ASC
    )
    SELECT
      c.subject_id,
      c.profile_id,
      (c.language_code IS NOT NULL) AS is_language,
      c.subject_created_at,
      fs.started_at AS first_session_started_at,
      fa.first_ai_at
    FROM cohort c
    LEFT JOIN first_session fs ON fs.subject_id = c.subject_id
    LEFT JOIN first_ai fa ON fa.session_id = fs.session_id
  `);

    // neon-serverless returns native Date for timestamptz, not string —
    // accept both since the Date constructor handles either input.
    const rows: RawRow[] = (result.rows as Array<Record<string, unknown>>).map(
      (r) => ({
        subjectId: r.subject_id as string,
        profileId: r.profile_id as string,
        isLanguage: r.is_language as boolean,
        subjectCreatedAt: new Date(r.subject_created_at as string | Date),
        firstSessionStartedAt:
          r.first_session_started_at == null
            ? null
            : new Date(r.first_session_started_at as string | Date),
        firstAiResponseAt:
          r.first_ai_at == null
            ? null
            : new Date(r.first_ai_at as string | Date),
      })
    );

    const bundle = aggregate(rows);
    bundle.windowStart = from.toISOString();
    bundle.windowEnd = to.toISOString();
    console.log(JSON.stringify(bundle, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
