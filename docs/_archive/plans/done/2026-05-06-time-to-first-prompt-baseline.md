# Time-To-First-Prompt Baseline Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a measurable baseline for "time from subject creation to first AI message in the first **curriculum** session" so PR 5d (curriculum pre-warm) and any future onboarding-latency change has a number to validate against.

> **What this metric is NOT:** the user's first-ever AI reply. Interview turns live in `onboarding_drafts.exchangeHistory` (jsonb), not `session_events`, and there is no `interview` value in `session_type_enum`. By the time the first `session_events.ai_response` fires, the user has already exchanged several messages with the AI during the interview. The metric measures interview duration + curriculum generation + first-session boot — i.e., the full cold path that 5d targets. Anyone reading the appendix should know this so they don't conclude "5d failed" if interview-segment latency dominates. (`t2fp` is the npm-script shorthand only — `pnpm measure:t2fp`.)

**Architecture:** A standalone TypeScript script queries the production-shaped staging database and computes percentiles over a date window. The script reads existing timestamps (`subjects.created_at`, the first `session_events.created_at` of type `ai_response` for the first session of that subject) — no new instrumentation. Output is JSON to stdout, with split by language vs non-language subject (language goes through extra `language-setup` calibration so its baseline is structurally different). The script is checked in so it can be re-run after 5d to compare.

**Tech Stack:** TypeScript, Drizzle ORM (raw SQL via `db.execute`), Node.js (`tsx`), Doppler for staging credentials.

**Why this plan exists separately from PR 5d:** The audit (`docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`) sized 5d as M, but reading `services/interview.ts:912` and `services/curriculum.ts:61` shows `generateCurriculum()` consumes interview-derived signals (`goals`, `experienceLevel`, `interviewSummary`). Pre-warming curriculum on subject create is therefore an architectural change, not a wiring change, and needs a brainstorm before its own plan. This plan ships first so that brainstorm has a measured number to anchor against.

**Out of scope:**
- Changing onboarding latency (that's 5d).
- Adding ongoing analytics events for time-to-first-prompt. The script is re-runnable; that's enough until we know the metric is worth permanent instrumentation.
- Production data. Staging only — same schema, no PII risk, sufficient sample for relative comparison.

---

## File Structure

- **Create:** `scripts/measure-time-to-first-prompt.ts` — entry point. Parses `--from`/`--to` flags, executes the SQL, computes percentiles, prints JSON.
- **Create:** `scripts/measure-time-to-first-prompt.test.ts` — unit tests for the pure functions (percentile math, row aggregation). The SQL itself is validated by manual run against staging.
- **Modify:** `package.json` — add `"measure:t2fp"` script entry.
- **Modify:** `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md` — append a "Baseline (captured YYYY-MM-DD)" appendix with the staging numbers.

The script is small (one file plus its test). It does not need a service or repository wrapper — analytics scripts in this repo (`scripts/embedding-benchmark.ts`, `scripts/translate.ts`) follow the same flat pattern.

---

## Task 1: Define the metric and stub the script

**Files:**
- Create: `scripts/measure-time-to-first-prompt.ts`

- [ ] **Step 1: Create the script with type-only stubs (no runtime yet)**

```typescript
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
  throw new Error('not implemented');
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
```

- [ ] **Step 2: Verify the file type-checks AND that the deps it will need resolve from this location**

```bash
# Type-check (the root tsconfig should pick up scripts/; if not, fail loudly).
cd apps/api && pnpm exec tsc --noEmit

# Probe runtime resolution for the deps Task 3 will import.
# tsx is already a root devDep; @neondatabase/serverless and ws are workspace
# deps and must hoist to a place the root scripts/ folder can see them.
pnpm exec tsx -e "import('@neondatabase/serverless').then(()=>console.log('ok'))"
pnpm exec tsx -e "import('ws').then(()=>console.log('ok'))"
pnpm exec tsx -e "import('drizzle-orm/neon-serverless').then(()=>console.log('ok'))"
```

Expected: all four PASS.

If any resolution probe fails, do **not** "move on" — `tsx` does not type-check at runtime, it transpiles, so a missing dep will only surface when Task 4 runs against staging. Either (a) add the missing deps to the root `package.json`, or (b) move the script under `apps/api/scripts/` and run via `pnpm --filter api exec tsx` (the same pattern `eval:llm` uses). Update the rest of this plan's paths if you take option (b).

- [ ] **Step 3: Commit**

```bash
git add scripts/measure-time-to-first-prompt.ts
git commit  # use /commit skill — never use raw git commit
```

Commit message draft: `chore(scripts): stub time-to-first-prompt baseline measurement`

---

## Task 2: Test the percentile function and the bucketing logic

**Files:**
- Create: `scripts/measure-time-to-first-prompt.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/measure-time-to-first-prompt.test.ts
import {
  percentile,
  aggregate,
  REACHED_CAP_SECONDS,
  MIN_COHORT_FOR_P50,
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
      row({ isLanguage: false, sessionStartSeconds: 5, aiResponseSeconds: null }),
      // noSession
      row({ isLanguage: false, sessionStartSeconds: null, aiResponseSeconds: null }),
    ]);
    expect(result.totalFirstSubjects).toBe(4);
    expect(result.reachedFirstPrompt).toBe(1); // only reachedWithinCap counts
    expect(result.buckets.reachedWithinCap).toBe(1);
    expect(result.buckets.delayedStart).toBe(1);
    expect(result.buckets.noAiAfterSessionStart).toBe(1);
    expect(result.buckets.noSession).toBe(1);
  });

  it('splits language vs non-language cohorts (only reachedWithinCap rows)', () => {
    // Need >= MIN_COHORT_FOR_P50 reached rows per split for percentiles to
    // be non-null; this test uses a smaller fixture and asserts null instead.
    const result = aggregate([
      row({ isLanguage: true, sessionStartSeconds: 1, aiResponseSeconds: 100 }),
      row({ isLanguage: true, sessionStartSeconds: 1, aiResponseSeconds: 200 }),
      row({ isLanguage: false, sessionStartSeconds: 1, aiResponseSeconds: 50 }),
      row({ isLanguage: false, sessionStartSeconds: 1, aiResponseSeconds: 150 }),
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
        row({ isLanguage: false, sessionStartSeconds: 1, aiResponseSeconds: i * 10 })
      );
    }
    const result = aggregate(reached);
    expect(result.nonLanguage.count).toBe(MIN_COHORT_FOR_P50);
    expect(result.nonLanguage.p50Seconds).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run:
```bash
cd apps/api && pnpm exec jest scripts/measure-time-to-first-prompt --no-coverage
```

(If the script lives at the repo root, run jest from the repo root via `pnpm exec jest scripts/measure-time-to-first-prompt --no-coverage`. Use whichever location actually finds the file.)

Expected: tests fail with "not implemented" thrown from `aggregate`.

- [ ] **Step 3: Implement `aggregate`**

In `scripts/measure-time-to-first-prompt.ts`, replace the `throw new Error('not implemented');` body of `aggregate` with:

```typescript
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
    nonLanguage: statsFor(buckets.reachedWithinCap.filter((r) => !r.isLanguage)),
  };
}
```

- [ ] **Step 4: Re-run the tests, expect PASS**

```bash
cd apps/api && pnpm exec jest scripts/measure-time-to-first-prompt --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
# use /commit skill
```

Commit message draft: `test(scripts): cover percentile and cohort bucketing for time-to-first-prompt`

---

## Task 3: Implement the SQL query and CLI wiring

**Files:**
- Modify: `scripts/measure-time-to-first-prompt.ts`

- [ ] **Step 1: Add the SQL + CLI to `main()`**

Replace `main()` with:

```typescript
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

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
  return { from: new Date(`${fromStr}T00:00:00Z`), to: new Date(`${toStr}T00:00:00Z`) };
}

async function main(): Promise<void> {
  const { from, to } = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set — run via `doppler run -c stg --`');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

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

  const rows: RawRow[] = (result.rows as Array<Record<string, unknown>>).map(
    (r) => ({
      subjectId: r.subject_id as string,
      profileId: r.profile_id as string,
      isLanguage: r.is_language as boolean,
      subjectCreatedAt: new Date(r.subject_created_at as string),
      firstSessionStartedAt:
        r.first_session_started_at == null
          ? null
          : new Date(r.first_session_started_at as string),
      firstAiResponseAt:
        r.first_ai_at == null ? null : new Date(r.first_ai_at as string),
    })
  );

  const bundle = aggregate(rows);
  bundle.windowStart = from.toISOString();
  bundle.windowEnd = to.toISOString();
  console.log(JSON.stringify(bundle, null, 2));

  await pool.end();
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` (repo root), under `"scripts"`, add:

```json
"measure:t2fp": "tsx scripts/measure-time-to-first-prompt.ts"
```

Place it near the other measurement/eval entries (e.g., next to `eval:llm`). The existing scripts block is grouped by topic, not alphabetical — match the local style rather than sorting.

- [ ] **Step 3: Type-check**

```bash
cd apps/api && pnpm exec tsc --noEmit
```

If `tsc` complains about `@neondatabase/serverless` or `ws` resolution from `scripts/`, follow the import patterns used in `apps/api/src/inngest/client.ts` (already uses neon-serverless) — those types are already available in the workspace.

Expected: PASS.

- [ ] **Step 4: Re-run unit tests** (the SQL change should not break them)

```bash
cd apps/api && pnpm exec jest scripts/measure-time-to-first-prompt --no-coverage
```

Expected: all tests still pass.

- [ ] **Step 5: Commit**

Commit message draft: `feat(scripts): query baseline time-to-first-prompt against staging`

---

## Task 4: Run against staging, capture numbers

This task produces data, not code. It does not change files in the repo until Task 5.

- [ ] **Step 1: Run the script against staging**

From repo root:
```bash
C:/Tools/doppler/doppler.exe run -c stg -- pnpm measure:t2fp --from 2026-04-01 --to 2026-05-06
```

Doppler config `stg` is required (per CLAUDE.md "Handy Commands"). The window is the last ~5 weeks; if `buckets.reachedWithinCap` is below `MIN_COHORT_FOR_P75_P90` (20) overall, widen to `--from 2026-03-01` for statistical power. Note that even with a wider window, the language vs non-language split may still be too small for percentile reporting — that's expected and surfaced as `null` in the output.

Expected: JSON output to stdout, structured per `ResultBundle`. Save the output verbatim — Task 5 pastes it into the audit doc.

- [ ] **Step 2: Sanity-check the numbers**

Eyeball the output against three expectations:

1. **Hard correctness check (must pass).** `buckets.reachedWithinCap + buckets.delayedStart + buckets.noAiAfterSessionStart + buckets.noSession === totalFirstSubjects`. If not, the bucketing logic has a bug — stop and investigate.
2. **Soft expectation (informational, do not block).** `language.p50Seconds ≥ nonLanguage.p50Seconds` because language onboarding has the extra `language-setup` step. If reversed at large N (≥30 each cohort), note it in the appendix as a surprise but continue — it could indicate non-language onboarding is slower than expected, which is itself a useful finding. At small N this is variance; do not act.
3. **Soft expectation (informational, do not block).** `overall.p50Seconds` is in the tens-to-low-hundreds of seconds range. If it's <5s or >600s, double-check the SQL CTE for the obvious failure modes (window applied before DISTINCT ON, wrong event_type filter) before recording the baseline. If the SQL is right, the number is the number.

Only check #1 is a stop-the-line gate. Checks #2 and #3 are observations to record alongside the numbers.

- [ ] **Step 3: Capture the raw output to a temp note**

Save the JSON to a scratch file (e.g. `~/baseline-output.json` outside the repo) so Task 5 can paste from it without re-running the query.

---

## Task 5: Append the baseline to the audit doc

**Files:**
- Modify: `docs/plans/app evolution plan/2026-05-06-learning-product-evolution-audit.md`

- [ ] **Step 1: Add a "Baseline" appendix at the end of the audit**

Append (after the existing last section) the following block, replacing the bracketed values with the JSON captured in Task 4:

```markdown
---

## Appendix — Baseline Captured 2026-05-06

Captured by `pnpm measure:t2fp --from <FROM> --to <TO>` against staging on 2026-05-06.

> **What this measures:** Time from `subjects.created_at` to the first `session_events.ai_response` in the first `learning_sessions` row for that subject — i.e., interview duration + curriculum generation + first-session boot. Interview AI replies (stored in `onboarding_drafts.exchange_history`) are NOT counted. Rows where the gap exceeded 60 minutes are bucketed as `delayedStart` and excluded from percentile reporting (return-after-N-days behavior dominates p90 otherwise).

**Window:** [windowStart] to [windowEnd]
**Cohort:** profiles whose ALL-TIME-FIRST subject was created in the window.

| Cohort | Count (within cap) | P50 sec | P75 sec | P90 sec |
| --- | --- | --- | --- | --- |
| All | [overall.count] | [overall.p50Seconds] | [overall.p75Seconds] | [overall.p90Seconds] |
| Language | [language.count] | [language.p50Seconds] | [language.p75Seconds] | [language.p90Seconds] |
| Non-language | [nonLanguage.count] | [nonLanguage.p50Seconds] | [nonLanguage.p75Seconds] | [nonLanguage.p90Seconds] |

Bucket breakdown of `totalFirstSubjects` = [totalFirstSubjects]:

| Bucket | Count | Meaning |
| --- | --- | --- |
| reachedWithinCap | [buckets.reachedWithinCap] | Got first session AI reply within 60 min of subject creation. The cohort the percentiles describe. |
| delayedStart | [buckets.delayedStart] | Got first session AI reply, but >60 min after subject creation. Return-after-N-days; 5d cannot move this. |
| noAiAfterSessionStart | [buckets.noAiAfterSessionStart] | First session started but no `ai_response` event ever observed. Likely a bug — investigate before next baseline. |
| noSession | [buckets.noSession] | Subject created, no `learning_session` ever started. Onboarding abandoned during interview or before session UX loaded. |

**Slice 1 success criterion (was: "P50 drops by ≥40%"):**
- Non-language P50 must drop from [nonLanguage.p50Seconds]s to ≤ [round(nonLanguage.p50Seconds * 0.6)]s.
- Language P50 must drop from [language.p50Seconds]s to ≤ [round(language.p50Seconds * 0.6)]s.

Apply the success criterion only on cohorts where `count >= MIN_COHORT_FOR_P50` (10). If a cohort is below that, defer the comparison to a wider re-run window after 5d ships.

**Re-run cadence:** Re-run the script after each Wave 1 PR merges and after Slice 1 ships. Append a new dated row to this table; do not overwrite — comparisons need history.
```

- [ ] **Step 2: Verify the appendix renders correctly**

Run a quick markdown preview (VS Code preview, or `glow` if installed). Expected: table aligns, no broken markdown from substitution.

- [ ] **Step 3: Commit**

Commit message draft: `docs(plans): record time-to-first-prompt baseline appendix to evolution audit`

---

## Self-Review Checklist

Before marking this plan complete, the executing engineer should confirm:

- [ ] All 5 tasks committed independently (5 commits, not 1).
- [ ] Tests in Task 2 still pass after Task 3's SQL wiring.
- [ ] Staging run in Task 4 produced sane numbers (sanity-check #1 passes; #2 and #3 noted if surprising).
- [ ] Bucket sums equal `totalFirstSubjects` (Task 4 sanity-check #1).
- [ ] Audit appendix in Task 5 is filled with real values, not placeholders, and includes both the cohort table and the bucket table.
- [ ] The script runs cleanly from a clean clone via `doppler run -c stg -- pnpm measure:t2fp --from X --to Y`.

## What this plan does NOT do

- It does not change onboarding latency. That's PR 5d, which needs its own brainstorm + plan.
- It does not add ongoing analytics events. The script is re-runnable; that's enough for now.
- It does not measure session-2 return rate, completion, or any other product-feel metric. Time-to-first-prompt is the one number 5d's success depends on.
- It does not measure interview duration in isolation. Interview turns live in `onboarding_drafts.exchange_history`, not `session_events`; if the post-5d numbers don't move, the next plan should split out interview-only timing as its own metric.

## Recommended next step after this plan ships

Open a brainstorming session for PR 5d using `superpowers:brainstorming`. Anchor it on what's already shipped:

- `apps/api/src/services/session/session-crud.ts:292-324` already implements a polling fast-path: `startFirstCurriculumSession` waits up to `FIRST_CURRICULUM_SESSION_WAIT_MS` for both `topicId` (curriculum generated) and `extractedSignals` (interview persisted) to be ready, then starts the session. The architectural question for 5d is therefore not "build a fast path" but "**what would let us shorten this wait**?"
- The blocker is that `generateCurriculum()` (`apps/api/src/services/curriculum.ts:61`) consumes interview-derived `goals`, `experienceLevel`, and `interviewSummary`. Three approaches to consider — pre-warm a generic curriculum from `subjectName` only and refine post-interview; eagerly create `curricula` + default `curriculum_books` rows at subject-create time and defer topic generation; or decouple `startFirstCurriculumSession` from `extractedSignals` so signals stream in as best-effort enrichment. Each has different LLM-cost, fallback, and data-shape implications.

The baseline this plan captures tells you which segment of latency (interview duration vs curriculum gen vs first-session boot) actually dominates — pick the architecture that targets that segment, not all three.

---

## Adversarial Review Notes (2026-05-06)

This plan went through one round of adversarial review before execution. The originating draft sized 5d as M-only and had two correctness bugs (audit-doc path, SQL cohort contamination). Capturing the changes here so the reasoning isn't lost on re-read.

- **CRITICAL-1:** Audit doc path corrected — it lives under `docs/plans/app evolution plan/`, not directly under `docs/plans/`. Verified via `Glob`.
- **CRITICAL-2:** SQL restructured. Cohort is now "first-ever subject for the profile, falling inside the window" — not "earliest subject inside the window," which silently included returning users whose 2nd/3rd subjects happened to land in the window.
- **HIGH-1:** 60-minute cap (`REACHED_CAP_SECONDS`). Rows where the first session AI reply landed >60 min after subject creation are bucketed as `delayedStart`, not folded into percentiles. Prevents return-after-N-days behavior from dominating p90.
- **HIGH-2:** Naming caveat added at the top. The metric is post-interview, post-curriculum first reply — not the user's first-ever AI message. Interview AI turns live in `onboarding_drafts.exchangeHistory`.
- **HIGH-3:** Sanity-check #2 (language ≥ non-language) demoted from blocker to informational. Min-N gate suppresses percentile reporting at small cohort sizes.
- **MEDIUM-1:** Explicit dependency-resolution probe in Task 1 so deps not hoisted to root surface before the SQL is written. `tsx` transpiles via esbuild — it does not type-check, so missing deps would only surface at staging-run time without this probe.
- **MEDIUM-2:** Documented that `percentile()` is **lower nearest-rank with floor** (non-standard); even-length test pins the choice. Diverges from PG `percentile_cont`; revisit if a future plan needs reproducibility from raw SQL.
- **MEDIUM-3:** `aggregate` distinguishes `noSession`, `noAiAfterSessionStart`, and `delayedStart` from genuine onboarding abandonment.
- **MEDIUM-4:** `MIN_COHORT_FOR_P50 = 10`, `MIN_COHORT_FOR_P75_P90 = 20`. Below those thresholds the relevant percentiles report `null`.
- **LOW-1:** Brainstorm anchor cites `session-crud.ts:292-324` (existing `startFirstCurriculumSession` polling) so the next session starts from "what would shorten this wait" rather than abstract architecture options.
- **LOW-2:** Removed the misleading "tsx type-checks at runtime" escape hatch in Task 1 Step 2.
- **NIT-1:** Dropped the "insert alphabetically" instruction in Task 3 Step 2 (existing `package.json` is grouped by topic).
