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
  /** The exact scenario ids that over-credited (gate `verified`, ground truth
   *  not). Feeds the hard ceiling: a non-empty list means a breach to name. */
  overCreditScenarioIds: string[];
  /** Gate said `partial`/`reteach` but the scenario's ground truth was `verified`. */
  underCreditRate: number;
  /** Share of rounds whose GRADER emitted a usable evaluation signal, overall… */
  signalEmissionRate: number;
  /** …and per grader model (the gpt-oss-drop indicator, now measured on the
   *  grader since the grader-ON pipeline owns the evaluation signal). The field
   *  name is retained for baseline continuity. */
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
  const overCreditScenarioIds: string[] = [];
  let underCredit = 0;
  let signalEmittedTotal = 0;
  const graderTotals: Record<string, { emitted: number; total: number }> = {};

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
      overCreditScenarioIds.push(r.scenarioId);
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
    const m = (graderTotals[r.graderModel] ??= { emitted: 0, total: 0 });
    m.total += 1;
    if (r.signalEmitted) m.emitted += 1;
  }

  const rate = (n: number): number => (total === 0 ? 0 : n / total);

  const outcomeRates = {} as Record<MasteryOutcome, number>;
  for (const o of ALL_OUTCOMES) outcomeRates[o] = rate(outcomeCounts[o]);

  const signalEmissionRateByMentor: Record<string, number> = {};
  for (const [model, { emitted, total: t }] of Object.entries(graderTotals)) {
    signalEmissionRateByMentor[model] = t === 0 ? 0 : emitted / t;
  }

  return {
    totalRounds: total,
    outcomeCounts,
    outcomeRates,
    conceptResultCounts,
    masteryVerifiedRate: rate(masteryVerified),
    overCreditRate: rate(overCredit),
    overCreditScenarioIds,
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

// ---------------------------------------------------------------------------
// Committed-baseline machinery (the tracked gate). All pure — no LLM, no I/O.
// `simulation-baseline.json` is the committed seed; the CLI verbs in
// `simulate.ts` read/write it through `toBaseline` / `validateBaselineStructure`
// and gate a live run with `compareSimulationBaseline`.
// ---------------------------------------------------------------------------

export interface SimulationBaseline {
  version: 1;
  /** ISO timestamp; stamped by the caller (simulate.ts is a plain tsx entry —
   *  `Date` is available there; the Date.* ban is Workflow-script-only). */
  updatedAt: string;
  /** Provenance stamp. Only `--update-baseline` writes it, so a hand-authored
   *  structurally-valid stub (which lacks it) fails `validateBaselineStructure`
   *  → the per-PR gate stays red until a real baseline is seeded (T12). */
  provenance: 'update-baseline';
  learnerModel: string;
  /** The tutor routing label (`production-routing` for the committed gate). */
  mentorModel: string;
  /** The resolved `capability:'judge'` slug at seed time. The per-PR
   *  `--validate-baseline` judge-drift check reds when this ≠ the live judge,
   *  so a judge reselection (T10 bake-off) forces a re-seed. */
  graderModel: string;
  scenarioCount: number;
  rates: {
    outcome: Record<MasteryOutcome, number>;
    masteryVerified: number;
    underCredit: number;
    signalEmissionByMentor: Record<string, number>;
  };
}

export interface SimulationGateResult {
  /** HARD ceiling input — `pass` is exactly `overCreditCount === 0`. */
  overCreditCount: number;
  overCreditScenarioIds: string[];
  drift: Array<{
    metric: string;
    baseline: number;
    current: number;
    delta: number;
  }>;
  pass: boolean;
}

/**
 * Compare a live run's metrics against the committed baseline. The over-credit
 * ceiling is the ONLY pass/fail input (hard `=== 0`); drift is advisory.
 * Tolerance widens for small N (few rounds) where the soft rates are noisy.
 */
export function compareSimulationBaseline(
  current: SimMetrics,
  baseline: SimulationBaseline,
  tolerancePp: number,
): SimulationGateResult {
  const widened = current.totalRounds < 10 ? tolerancePp * 2 : tolerancePp;
  const drift: SimulationGateResult['drift'] = [];
  const cmp = (metric: string, base: number, cur: number): void => {
    const delta = +(cur - base).toFixed(3);
    if (Math.abs(delta) > widened) {
      drift.push({ metric, baseline: base, current: cur, delta });
    }
  };

  cmp(
    'masteryVerified',
    baseline.rates.masteryVerified,
    current.masteryVerifiedRate,
  );
  cmp('underCredit', baseline.rates.underCredit, current.underCreditRate);

  // Per-grader-model fail-open health (the gpt-oss-drop indicator, now measured
  // on the grader). Diff every model in either set; a model present on only one
  // side reads as 0 on the other.
  const graderKeys = new Set([
    ...Object.keys(baseline.rates.signalEmissionByMentor),
    ...Object.keys(current.signalEmissionRateByMentor),
  ]);
  for (const k of graderKeys) {
    cmp(
      `signalEmissionByMentor.${k}`,
      baseline.rates.signalEmissionByMentor[k] ?? 0,
      current.signalEmissionRateByMentor[k] ?? 0,
    );
  }

  for (const o of Object.keys(baseline.rates.outcome) as MasteryOutcome[]) {
    cmp(
      `outcome.${o}`,
      baseline.rates.outcome[o],
      current.outcomeRates[o] ?? 0,
    );
  }

  return {
    overCreditCount: current.overCreditScenarioIds.length,
    overCreditScenarioIds: current.overCreditScenarioIds,
    drift,
    pass: current.overCreditScenarioIds.length === 0,
  };
}

/** Build a committed baseline payload from a seed run's metrics. */
export function toBaseline(
  metrics: SimMetrics,
  opts: {
    learnerModel: string;
    mentorModel: string;
    graderModel: string;
    updatedAt: string;
    provenance: 'update-baseline';
  },
): SimulationBaseline {
  return {
    version: 1,
    updatedAt: opts.updatedAt,
    provenance: opts.provenance,
    learnerModel: opts.learnerModel,
    mentorModel: opts.mentorModel,
    graderModel: opts.graderModel,
    scenarioCount: metrics.totalRounds,
    rates: {
      outcome: metrics.outcomeRates,
      masteryVerified: metrics.masteryVerifiedRate,
      underCredit: metrics.underCreditRate,
      signalEmissionByMentor: metrics.signalEmissionRateByMentor,
    },
  };
}

/**
 * Structural validation for the per-PR `--validate-baseline` gate (no LLM).
 * Rejects: empty/null, wrong version, `scenarioCount:0`, a missing `graderModel`
 * or `provenance` stamp (so a hand-written stub fails — the feature stays
 * visibly inert until T12 seeds a real baseline), and a payload shaped like the
 * main-harness `baseline.json` (it lacks these sim-specific fields).
 */
export function validateBaselineStructure(raw: unknown): {
  ok: boolean;
  reason?: string;
} {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, reason: 'baseline is empty or not an object' };
  }
  const b = raw as Record<string, unknown>;
  if (b.version !== 1) {
    return { ok: false, reason: `unexpected version ${String(b.version)}` };
  }
  if (typeof b.learnerModel !== 'string' || b.learnerModel.length === 0) {
    return { ok: false, reason: 'missing learnerModel' };
  }
  if (typeof b.graderModel !== 'string' || b.graderModel.length === 0) {
    return {
      ok: false,
      reason: 'missing graderModel — re-seed via --update-baseline (T12)',
    };
  }
  if (b.provenance !== 'update-baseline') {
    return {
      ok: false,
      reason:
        'missing provenance:"update-baseline" stamp — a hand-written stub is not a seeded baseline (T12)',
    };
  }
  if (typeof b.scenarioCount !== 'number' || b.scenarioCount <= 0) {
    return { ok: false, reason: 'scenarioCount must be > 0' };
  }
  const rates = b.rates;
  if (rates === null || typeof rates !== 'object') {
    return { ok: false, reason: 'missing rates block' };
  }
  const r = rates as Record<string, unknown>;
  // Cross-baseline shape guard (F10): the main-harness baseline lacks these.
  if (typeof r.underCredit !== 'number') {
    return {
      ok: false,
      reason:
        'missing rates.underCredit (looks like a non-simulation baseline)',
    };
  }
  if (typeof r.masteryVerified !== 'number') {
    return {
      ok: false,
      reason:
        'missing rates.masteryVerified (looks like a non-simulation baseline)',
    };
  }
  if (
    r.signalEmissionByMentor === null ||
    typeof r.signalEmissionByMentor !== 'object'
  ) {
    return {
      ok: false,
      reason:
        'missing rates.signalEmissionByMentor (looks like a non-simulation baseline)',
    };
  }
  if (r.outcome === null || typeof r.outcome !== 'object') {
    return { ok: false, reason: 'missing rates.outcome' };
  }
  return { ok: true };
}
