import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MasteryOutcome } from '../../src/services/challenge-round/evaluation';
import type { SimulatedRoundResult } from './simulated-conversation';

// ---------------------------------------------------------------------------
// Calibration metrics for the simulated Challenge-Round corpus.
//
// Feeds the MASTERY-BAR half of RR-6 (outcome distribution + over/under-credit
// against ground truth) and the RR-12 gpt-oss de-risk (signalEmissionRate per
// mentor model). It deliberately does NOT compute a note-overlap histogram —
// that needs a drafting step + DB-verified learner content this DB-free harness
// does not produce (see the plan's note-overlap scoping bullet).
// ---------------------------------------------------------------------------

const ALL_OUTCOMES: MasteryOutcome[] = [
  'verified',
  'partial',
  'reteach',
  'invalid',
];
type ConceptResult = 'solid' | 'partial' | 'missing' | 'misconception';

export interface SimMetrics {
  totalRounds: number;
  outcomeCounts: Record<MasteryOutcome, number>;
  outcomeRates: Record<MasteryOutcome, number>;
  conceptResultCounts: Record<ConceptResult, number>;
  masteryVerifiedRate: number;
  /** Gate said `verified` but the scenario's ground truth was not `verified`. */
  overCreditRate: number;
  /** Gate said `partial`/`reteach` but the scenario's ground truth was `verified`. */
  underCreditRate: number;
  /** Share of rounds whose mentor emitted a usable evaluation signal, overall… */
  signalEmissionRate: number;
  /** …and per mentor model (the gpt-oss-drop indicator). */
  signalEmissionRateByMentor: Record<string, number>;
}

export function aggregate(results: SimulatedRoundResult[]): SimMetrics {
  const total = results.length;

  const outcomeCounts: Record<MasteryOutcome, number> = {
    verified: 0,
    partial: 0,
    reteach: 0,
    invalid: 0,
  };
  const conceptResultCounts: Record<ConceptResult, number> = {
    solid: 0,
    partial: 0,
    missing: 0,
    misconception: 0,
  };

  let masteryVerified = 0;
  let overCredit = 0;
  let underCredit = 0;
  let signalEmittedTotal = 0;
  const mentorTotals: Record<string, { emitted: number; total: number }> = {};

  for (const r of results) {
    outcomeCounts[r.decision.outcome] += 1;
    if (r.decision.markMasteryVerified) masteryVerified += 1;

    for (const e of r.evaluations) {
      conceptResultCounts[e.result as ConceptResult] += 1;
    }

    // Over-credit (the dangerous direction): gate said `verified` but ground
    // truth did not warrant it — the grader was too lenient.
    if (r.decision.outcome === 'verified' && r.expectedOutcome !== 'verified') {
      overCredit += 1;
    }
    // Under-credit: a learner who DESERVED verification (ground-truth verified)
    // did not get it. Includes `invalid` (the mentor dropped all signal so the
    // gate got an empty evaluation set) — from the learner's lived outcome a
    // dropped signal is still "deserved mastery, didn't verify". How much of
    // under-credit is signal-drop vs. genuine harshness is read off
    // `signalEmissionRate`, so the two numbers stay non-redundant. Both rates
    // use the whole-corpus denominator (`total`), readable side by side.
    if (
      r.expectedOutcome === 'verified' &&
      (r.decision.outcome === 'partial' ||
        r.decision.outcome === 'reteach' ||
        r.decision.outcome === 'invalid')
    ) {
      underCredit += 1;
    }

    if (r.signalEmitted) signalEmittedTotal += 1;
    const m = (mentorTotals[r.mentorModel] ??= { emitted: 0, total: 0 });
    m.total += 1;
    if (r.signalEmitted) m.emitted += 1;
  }

  const rate = (n: number): number => (total === 0 ? 0 : n / total);

  const outcomeRates = {} as Record<MasteryOutcome, number>;
  for (const o of ALL_OUTCOMES) outcomeRates[o] = rate(outcomeCounts[o]);

  const signalEmissionRateByMentor: Record<string, number> = {};
  for (const [model, { emitted, total: t }] of Object.entries(mentorTotals)) {
    signalEmissionRateByMentor[model] = t === 0 ? 0 : emitted / t;
  }

  return {
    totalRounds: total,
    outcomeCounts,
    outcomeRates,
    conceptResultCounts,
    masteryVerifiedRate: rate(masteryVerified),
    overCreditRate: rate(overCredit),
    underCreditRate: rate(underCredit),
    signalEmissionRate: rate(signalEmittedTotal),
    signalEmissionRateByMentor,
  };
}

/**
 * Write one transcript JSON per round plus a `metrics.json` summary into `dir`.
 * `dir` is created if missing. Transcripts are bulky + per-run and the corpus
 * dir is gitignored (T6).
 */
export async function writeCorpus(
  dir: string,
  results: SimulatedRoundResult[],
  metrics: SimMetrics,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await Promise.all(
    results.map((r, i) => {
      const safeId = r.scenarioId.replace(/[^a-z0-9_-]/gi, '_');
      const file = join(dir, `${String(i).padStart(3, '0')}-${safeId}.json`);
      return writeFile(file, JSON.stringify(r, null, 2), 'utf8');
    }),
  );
  await writeFile(
    join(dir, 'metrics.json'),
    JSON.stringify(
      {
        note: 'SYNTHETIC pre-screen (RR-2 complement, NOT a substitute). Bar tuned here is PROVISIONAL per spec CH-4; post-launch recalibration against real learner transcripts is required.',
        ...metrics,
      },
      null,
      2,
    ),
    'utf8',
  );
}
