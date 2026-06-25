import * as fs from 'fs';
import * as path from 'path';

import { INNGEST_PLAN_CONCURRENCY_CAP } from './client';

// ---------------------------------------------------------------------------
// Forward-only guard: no Inngest function may declare a per-function
// `concurrency.limit` above the hosted-plan cap.
//
// WHY THIS EXISTS: the Inngest hosted plan REJECTS app sync if ANY function
// declares a concurrency limit above the plan's ceiling — and because one
// rejected function blocks the WHOLE app from registering, a single over-cap
// value silently takes every cron + background job offline with no error in
// app logs. Staging ran this way for ~7 weeks (2026-05 → 06) after a single
// `concurrency: { limit: 25 }` slipped past review.
//
// The fix is to route every function's concurrency limit through
// INNGEST_PLAN_CONCURRENCY_CAP (which is bounded by the plan and changes in
// one place when the plan is upgraded). This test fails CI if a function
// hardcodes a raw numeric concurrency limit above the cap. Constant-based
// limits are exempt by construction.
// ---------------------------------------------------------------------------

describe('Inngest per-function concurrency cap', () => {
  const functionsDir = path.join(__dirname, 'functions');
  const files = fs
    .readdirSync(functionsDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('keeps the constant at or below the current hosted-plan limit (Free = 5)', () => {
    // Raise this expectation IN LOCKSTEP with INNGEST_PLAN_CONCURRENCY_CAP only
    // after the Inngest plan is actually upgraded — otherwise app sync breaks.
    expect(INNGEST_PLAN_CONCURRENCY_CAP).toBeLessThanOrEqual(5);
  });

  it.each(files)(
    '%s declares no raw concurrency limit above the cap',
    (file) => {
      const source = fs.readFileSync(path.join(functionsDir, file), 'utf8');
      // Match a `concurrency: { ... limit: <number> ... }` block capturing a
      // RAW numeric literal. `[^}]*` (which spans newlines in a negated class)
      // keeps the match inside the single concurrency object, so unrelated
      // `{ limit: N }` configs (e.g. embedding batches) and `.limit(N)` query
      // calls are not matched. Limits written as INNGEST_PLAN_CONCURRENCY_CAP
      // have no digit after `limit:` and are correctly exempt.
      const re = /concurrency:\s*\{[^}]*\blimit:\s*(\d+)/g;
      const offenders: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(source)) !== null) {
        const value = Number(m[1]);
        if (value > INNGEST_PLAN_CONCURRENCY_CAP) offenders.push(value);
      }
      expect({ file, offenders }).toEqual({ file, offenders: [] });
    },
  );
});
