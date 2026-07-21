/**
 * [WI-2396] Forward-only ratchet: weekly-self-reports.ts stays LLM-dispatch-free.
 *
 * WI-2396 switched the ~8 other background/Inngest callers of
 * isGdprProcessingAllowedV2 (parental-basis-only) to isLlmExchangeConsentAllowed
 * (also honors an adult's independently-withdrawable self-consent, art6_1_a) —
 * EXCEPT weekly-self-reports.ts, which the PM-ratified WI-2396 ruling sanctioned
 * as an exclusion: its report is built entirely from deterministic data
 * aggregation (generateWeeklyReportData, getPracticeActivitySummary, and their
 * own dependencies) with zero LLM/AI-processor dispatch anywhere in the traced
 * chain — see the comment on the `isGdprProcessingAllowedV2` call site in
 * weekly-self-reports.ts for the full traced call graph and the PM's
 * compliance rationale (gating a non-LLM flow on LLM-disclosure consent would
 * wrongly block legitimate non-LLM reports).
 *
 * That exclusion is only correct AS LONG AS none of the traced files ever
 * gains an LLM dispatch. This guard is the mechanical enforcement: it scans
 * weekly-self-reports.ts and its traced direct dependencies for a
 * routeAndCall/routeAndStream call or an import from an `.../llm` module, and
 * fails if one appears — the same instant an LLM dispatch is (re)introduced,
 * before anyone has to remember to also flip the consent gate.
 *
 * If this guard fails: the correct fix is almost certainly switching
 * weekly-self-reports.ts's `isGdprProcessingAllowedV2` call to
 * `isLlmExchangeConsentAllowed` (see progress-summary.ts / monthly-report-cron.ts
 * for the established pattern) — not silencing this guard.
 */

import * as path from 'path';
import * as fs from 'fs';

// __dirname = apps/api/src/inngest/functions → repoRoot is 5 levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const API_SRC = path.join(REPO_ROOT, 'apps/api/src');

if (!fs.existsSync(path.join(REPO_ROOT, 'apps/api'))) {
  throw new Error(
    `REPO_ROOT (${REPO_ROOT}) does not contain apps/api. Path resolution is wrong.`,
  );
}

// The traced call chain from the weekly-self-reports.ts comment (entrypoint +
// every direct import it uses to build the report). Keep this list in sync
// with that comment — both must name the same files.
const TRACED_FILES = [
  'inngest/functions/weekly-self-reports.ts',
  'services/weekly-report.ts',
  'services/practice-activity-summary.ts',
  'services/snapshot-aggregation.ts',
  'services/identity-v2/solo-progress-reports-v2.ts',
  'services/identity-v2/guardianship.ts',
];

// Matches a direct call (routeAndCall(...) / routeAndStream(...)) or an
// import whose source path ends in `/llm` (the LLM service barrel/module —
// e.g. `from '../../services/llm'`, `from './llm'`). Deliberately narrow
// (exact known symbol names / path suffix) to keep false positives low; this
// is a name search, not general control-flow analysis.
const LLM_DISPATCH_PATTERN =
  /\broute(AndCall|AndStream)\s*\(|from\s+['"][^'"]*\/llm['"]/;

describe('[WI-2396] weekly-self-reports LLM-dispatch ratchet', () => {
  it.each(TRACED_FILES)(
    '%s has no LLM dispatch (routeAndCall/routeAndStream/llm import)',
    (relativePath) => {
      const absPath = path.join(API_SRC, relativePath);
      expect(fs.existsSync(absPath)).toBe(true);
      const content = fs.readFileSync(absPath, 'utf8');

      const match = content.match(LLM_DISPATCH_PATTERN);
      if (match) {
        throw new Error(
          `${relativePath} now contains an LLM dispatch (matched: "${match[0]}"). ` +
            "weekly-self-reports.ts's consent gate is deliberately left on the " +
            'parental-only isGdprProcessingAllowedV2 because this traced call ' +
            'chain was LLM-dispatch-free (WI-2396, PM-ratified). That premise no ' +
            'longer holds — switch weekly-self-reports.ts to ' +
            'isLlmExchangeConsentAllowed (see progress-summary.ts / ' +
            "monthly-report-cron.ts for the pattern) so an adult's withdrawn " +
            "self-consent (art6_1_a) is honored before this file's next LLM call.",
        );
      }
    },
  );

  it('weekly-self-reports.ts still reads the parental-only gate (sanity check — this guard is testing the right premise)', () => {
    const absPath = path.join(
      API_SRC,
      'inngest/functions/weekly-self-reports.ts',
    );
    const content = fs.readFileSync(absPath, 'utf8');
    // If this ever fails because the file was switched to
    // isLlmExchangeConsentAllowed, the exclusion no longer applies — delete
    // this guard file (and its cross-reference in the weekly-self-reports.ts
    // comment) rather than updating this assertion.
    expect(content).toMatch(/isGdprProcessingAllowedV2\(db, profileId\)/);
  });
});
