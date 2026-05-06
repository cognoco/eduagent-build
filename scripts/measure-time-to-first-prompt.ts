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
    if (secondsFor(r) > REACHED_CAP_SECONDS) {
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

async function main(): Promise<void> {
  throw new Error('not implemented');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
