import {
  percentile,
  aggregate,
  REACHED_CAP_SECONDS,
  MIN_COHORT_FOR_P50,
  MIN_HUMAN_REPLY_SECONDS,
  type RawRow,
} from './measure-time-to-first-prompt';

describe('percentile (lower nearest-rank with floor)', () => {
  it('returns null for empty input', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('returns the only value for a singleton', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 90)).toBe(42);
  });

  it('returns the median of an odd-length sorted list', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('pins the even-length convention: [1,2,3,4] @ p50 = 3 (floor(2)=2, sorted[2])', () => {
    // Documents that this is NOT linear interpolation (would be 2.5) and
    // NOT lower nearest-rank ceil-based (would be 2). Anyone re-implementing
    // against pg `percentile_cont` will get different numbers; that's
    // intentional — see comment on percentile() in the source.
    expect(percentile([1, 2, 3, 4], 50)).toBe(3);
  });

  it('returns p90 of a sorted list of 10', () => {
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBe(100);
  });
});

describe('aggregate', () => {
  function row(opts: {
    isLanguage: boolean;
    sessionStartSeconds: number | null; // null = no session at all
    aiResponseSeconds: number | null; // null = no ai_response observed
  }): RawRow {
    const created = new Date('2026-04-20T10:00:00Z');
    const sessionStart =
      opts.sessionStartSeconds === null
        ? null
        : new Date(created.getTime() + opts.sessionStartSeconds * 1000);
    const ai =
      opts.aiResponseSeconds === null
        ? null
        : new Date(created.getTime() + opts.aiResponseSeconds * 1000);
    return {
      subjectId: 'sub',
      profileId: 'prof',
      isLanguage: opts.isLanguage,
      subjectCreatedAt: created,
      firstSessionStartedAt: sessionStart,
      firstAiResponseAt: ai,
    };
  }

  it('buckets noSession, noAiAfterSessionStart, delayedStart, reachedWithinCap separately', () => {
    const result = aggregate([
      // reachedWithinCap (30s)
      row({ isLanguage: false, sessionStartSeconds: 5, aiResponseSeconds: 30 }),
      // delayedStart (>1h)
      row({
        isLanguage: false,
        sessionStartSeconds: 5,
        aiResponseSeconds: REACHED_CAP_SECONDS + 60,
      }),
      // noAiAfterSessionStart
      row({
        isLanguage: false,
        sessionStartSeconds: 5,
        aiResponseSeconds: null,
      }),
      // noSession
      row({
        isLanguage: false,
        sessionStartSeconds: null,
        aiResponseSeconds: null,
      }),
    ]);
    expect(result.totalFirstSubjects).toBe(4);
    expect(result.reachedFirstPrompt).toBe(1); // only reachedWithinCap counts
    expect(result.buckets.reachedWithinCap).toBe(1);
    expect(result.buckets.delayedStart).toBe(1);
    expect(result.buckets.noAiAfterSessionStart).toBe(1);
    expect(result.buckets.noSession).toBe(1);
    expect(result.buckets.belowMinReply).toBe(0);
  });

  it('buckets sub-floor and negative-gap rows as belowMinReply (data-quality floor)', () => {
    // Empirical finding from staging: seeded fixtures backdated session_started_at
    // by exactly 1 day relative to subject created_at, and E2E test runs hit a
    // mock LLM in <1s. Both pollute percentiles. MIN_HUMAN_REPLY_SECONDS bucket
    // separates them from genuine onboarding rows.
    const result = aggregate([
      // negative gap — session timestamp predates subject creation (clock skew/seed)
      row({
        isLanguage: false,
        sessionStartSeconds: -86400,
        aiResponseSeconds: -86399,
      }),
      // sub-floor positive — sub-second AI reply (E2E mock)
      row({
        isLanguage: false,
        sessionStartSeconds: 0,
        aiResponseSeconds: MIN_HUMAN_REPLY_SECONDS - 1,
      }),
      // exactly at floor — counts as reachedWithinCap (boundary inclusive on the high side)
      row({
        isLanguage: false,
        sessionStartSeconds: 1,
        aiResponseSeconds: MIN_HUMAN_REPLY_SECONDS,
      }),
    ]);
    expect(result.buckets.belowMinReply).toBe(2);
    expect(result.buckets.reachedWithinCap).toBe(1);
    expect(result.reachedFirstPrompt).toBe(1);
  });

  it('splits language vs non-language cohorts (only reachedWithinCap rows)', () => {
    // Need >= MIN_COHORT_FOR_P50 reached rows per split for percentiles to
    // be non-null; this test uses a smaller fixture and asserts null instead.
    const result = aggregate([
      row({ isLanguage: true, sessionStartSeconds: 1, aiResponseSeconds: 100 }),
      row({ isLanguage: true, sessionStartSeconds: 1, aiResponseSeconds: 200 }),
      row({ isLanguage: false, sessionStartSeconds: 1, aiResponseSeconds: 50 }),
      row({
        isLanguage: false,
        sessionStartSeconds: 1,
        aiResponseSeconds: 150,
      }),
    ]);
    expect(result.language.count).toBe(2);
    expect(result.nonLanguage.count).toBe(2);
    // 2 < MIN_COHORT_FOR_P50 → suppressed
    expect(MIN_COHORT_FOR_P50).toBeGreaterThan(2);
    expect(result.language.p50Seconds).toBeNull();
    expect(result.nonLanguage.p50Seconds).toBeNull();
  });

  it('reports p50 once cohort meets MIN_COHORT_FOR_P50', () => {
    const reached: RawRow[] = [];
    for (let i = 1; i <= MIN_COHORT_FOR_P50; i++) {
      reached.push(
        row({
          isLanguage: false,
          sessionStartSeconds: 1,
          aiResponseSeconds: i * 10,
        })
      );
    }
    const result = aggregate(reached);
    expect(result.nonLanguage.count).toBe(MIN_COHORT_FOR_P50);
    // Pin the end-to-end wiring (aggregate → statsFor → percentile) to a
    // specific value rather than just non-null. With seconds = [10..100],
    // sorted[floor(0.5 * 10)] = sorted[5] = 60. A regression in secondsFor
    // mapping or sort order would change this.
    expect(result.nonLanguage.p50Seconds).toBe(60);
  });
});
