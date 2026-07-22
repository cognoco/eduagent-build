import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MasteryOutcome } from '../../src/services/challenge-round/evaluation';
import type { SimulatedRoundResult } from './simulated-conversation';

// ---------------------------------------------------------------------------
// Calibration metrics for the simulated Challenge-Round corpus.
//
// Feeds the MASTERY-BAR half of RR-6 (outcome distribution + over/under-credit
// against ground truth) and the RR-12 gpt-oss de-risk (signalEmissionRate per
// GRADER model — the production judge is what now owns the signal). It
// deliberately does NOT compute a note-overlap histogram — that needs a drafting
// step + DB-verified learner content this DB-free harness does not produce.
//
// Every headline rate ships a Wilson 95% CI and a denominator so a low-N rate
// can never be read as a calibration result. Below MIN_ROUNDS_FOR_CALIBRATION
// the corpus is flagged `sufficientForCalibration: false` — a 6-scenario ×
// 1-run grid moves a rate ~17pp on a single flip and is NOT a calibration basis.
// ---------------------------------------------------------------------------

/**
 * Minimum total rounds before the over/under-credit + signal rates should be
 * treated as a calibration input rather than a smoke-test. A real RR-6 decision
 * wants ≥5 runs/scenario (≥30 rounds at 6 scenarios) so the Wilson CI tightens.
 */
export const MIN_ROUNDS_FOR_CALIBRATION = 30;

const ALL_OUTCOMES: MasteryOutcome[] = [
  'verified',
  'partial',
  'reteach',
  'invalid',
];
type ConceptResult = 'solid' | 'partial' | 'missing' | 'misconception';

/** Wilson score 95% confidence interval for a binomial proportion. */
export interface RateCI {
  /** numerator (successes) */
  n: number;
  /** denominator (rounds) */
  total: number;
  rate: number;
  low: number;
  high: number;
}

function wilsonCI(successes: number, total: number): RateCI {
  if (total === 0) {
    return { n: 0, total: 0, rate: 0, low: 0, high: 0 };
  }
  const z = 1.96; // 95%
  const phat = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (phat + (z * z) / (2 * total)) / denom;
  const margin =
    (z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total)) /
    denom;
  return {
    n: successes,
    total,
    rate: phat,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

export interface SimMetrics {
  totalRounds: number;
  /** false until totalRounds >= MIN_ROUNDS_FOR_CALIBRATION — do not tune on this. */
  sufficientForCalibration: boolean;
  outcomeCounts: Record<MasteryOutcome, number>;
  outcomeRates: Record<MasteryOutcome, number>;
  conceptResultCounts: Record<ConceptResult, number>;
  masteryVerifiedRate: number;
  /** Gate said `verified` but the scenario's ground truth was not `verified`. */
  overCreditRate: number;
  /** The exact scenario ids that over-credited (gate `verified`, ground truth
   *  not). Feeds the hard ceiling: a non-empty list means a breach to name. */
  overCreditScenarioIds: string[];
  /** Gate said `partial`/`reteach`/`invalid` but ground truth was `verified`. */
  underCreditRate: number;
  /** Share of rounds whose GRADER emitted a usable evaluation signal, overall… */
  signalEmissionRate: number;
  /** …and per GRADER model (the gpt-oss-drop indicator). */
  signalEmissionRateByGrader: Record<string, number>;
  /** Share of generated tutor turns that failed envelope parsing. */
  tutorParseFailureRate: number;
  /** Exact-repeat rate among model-authored tutor questions only. */
  modelAuthoredQuestionRepeatRate: number;
  /** Exact-repeat rate across seed and model-authored questions; degraded turns excluded. */
  questionRepeatRate: number;
  /** Exact-repeat rate among degraded fallback turns, reported separately. */
  degradedQuestionRepeatRate: number;
  /** Exact distinct labels only; semantic concept equivalence is product-gated. */
  distinctAssessedConceptCount: number;
  /** Wilson 95% CIs + denominators for the four headline rates. */
  ci: {
    masteryVerified: RateCI;
    overCredit: RateCI;
    underCredit: RateCI;
    signalEmission: RateCI;
  };
}

/** Simulator-only diagnostic lines for the deterministic and live CLI reports. */
export function formatSimulatorDiagnosticMetrics(
  metrics: Pick<
    SimMetrics,
    | 'tutorParseFailureRate'
    | 'modelAuthoredQuestionRepeatRate'
    | 'questionRepeatRate'
    | 'degradedQuestionRepeatRate'
    | 'distinctAssessedConceptCount'
  >,
): string[] {
  const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
  return [
    `tutor parse failures: ${pct(metrics.tutorParseFailureRate)}`,
    `model question repeats: ${pct(metrics.modelAuthoredQuestionRepeatRate)}`,
    `measured question repeats: ${pct(metrics.questionRepeatRate)}`,
    `degraded question repeats: ${pct(metrics.degradedQuestionRepeatRate)}`,
    `distinct assessed concepts: ${metrics.distinctAssessedConceptCount}`,
  ];
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
  let tutorTurnTotal = 0;
  let tutorParseFailures = 0;
  let modelAuthoredQuestionTotal = 0;
  let modelAuthoredQuestionRepeats = 0;
  let measuredQuestionTotal = 0;
  let measuredQuestionRepeats = 0;
  let degradedQuestionTotal = 0;
  let degradedQuestionRepeats = 0;
  const assessedConcepts = new Set<string>();
  const graderTotals: Record<string, { emitted: number; total: number }> = {};

  for (const r of results) {
    outcomeCounts[r.decision.outcome] += 1;
    if (r.decision.markMasteryVerified) masteryVerified += 1;

    for (const e of r.evaluations) {
      conceptResultCounts[e.result as ConceptResult] += 1;
      assessedConcepts.add(e.concept);
    }

    for (const turn of r.tutorTurns) {
      tutorTurnTotal += 1;
      if (turn.source === 'degraded') {
        degradedQuestionTotal += 1;
        tutorParseFailures += 1;
      } else {
        modelAuthoredQuestionTotal += 1;
      }
    }
    for (const diagnostic of r.questionDiagnostics) {
      if (diagnostic.source !== 'degraded') {
        measuredQuestionTotal += 1;
        if (diagnostic.repeatsPriorQuestion) measuredQuestionRepeats += 1;
      }
      if (diagnostic.source === 'model') {
        if (diagnostic.repeatsPriorQuestion) modelAuthoredQuestionRepeats += 1;
      } else if (diagnostic.source === 'degraded') {
        if (diagnostic.repeatsPriorQuestion) degradedQuestionRepeats += 1;
      }
    }

    // Over-credit (the dangerous direction): gate said `verified` but ground
    // truth did not warrant it — the grader was too lenient.
    if (r.decision.outcome === 'verified' && r.expectedOutcome !== 'verified') {
      overCredit += 1;
      overCreditScenarioIds.push(r.scenarioId);
    }
    // Under-credit: a learner who DESERVED verification (ground-truth verified)
    // did not get it. Includes `invalid` (the grader dropped all signal so the
    // gate got an empty evaluation set) — from the learner's lived outcome a
    // dropped signal is still "deserved mastery, didn't verify". How much of
    // under-credit is signal-drop vs. genuine harshness is read off
    // `signalEmissionRate`, so the two numbers stay non-redundant.
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

  const signalEmissionRateByGrader: Record<string, number> = {};
  for (const [model, { emitted, total: t }] of Object.entries(graderTotals)) {
    signalEmissionRateByGrader[model] = t === 0 ? 0 : emitted / t;
  }

  return {
    totalRounds: total,
    sufficientForCalibration: total >= MIN_ROUNDS_FOR_CALIBRATION,
    outcomeCounts,
    outcomeRates,
    conceptResultCounts,
    masteryVerifiedRate: rate(masteryVerified),
    overCreditRate: rate(overCredit),
    overCreditScenarioIds,
    underCreditRate: rate(underCredit),
    signalEmissionRate: rate(signalEmittedTotal),
    signalEmissionRateByGrader,
    tutorParseFailureRate:
      tutorTurnTotal === 0 ? 0 : tutorParseFailures / tutorTurnTotal,
    modelAuthoredQuestionRepeatRate:
      modelAuthoredQuestionTotal === 0
        ? 0
        : modelAuthoredQuestionRepeats / modelAuthoredQuestionTotal,
    questionRepeatRate:
      measuredQuestionTotal === 0
        ? 0
        : measuredQuestionRepeats / measuredQuestionTotal,
    degradedQuestionRepeatRate:
      degradedQuestionTotal === 0
        ? 0
        : degradedQuestionRepeats / degradedQuestionTotal,
    distinctAssessedConceptCount: assessedConcepts.size,
    ci: {
      masteryVerified: wilsonCI(masteryVerified, total),
      overCredit: wilsonCI(overCredit, total),
      underCredit: wilsonCI(underCredit, total),
      signalEmission: wilsonCI(signalEmittedTotal, total),
    },
  };
}

export interface WriteCorpusMeta {
  /** Number of runs/scenario requested (stamped so a rate cannot travel without N). */
  runs: number;
  /** Which production path was measured. */
  gradingPath: 'production-grader' | 'legacy-inline';
}

/**
 * Write one transcript JSON per round plus a `metrics.json` summary into `dir`.
 * `dir` is created if missing. Transcripts are bulky + per-run and the corpus
 * dir is gitignored (T6). `metrics.json` is STAMPED with the grading path, N,
 * runs, and `provisional:true` so a screenshotted number can never be misread
 * as "RR-2/RR-12 cleared".
 */
export async function writeCorpus(
  dir: string,
  results: SimulatedRoundResult[],
  metrics: SimMetrics,
  meta: WriteCorpusMeta = { runs: 1, gradingPath: 'production-grader' },
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
        provisional: true,
        gradingPath: meta.gradingPath,
        runsPerScenario: meta.runs,
        n: metrics.totalRounds,
        note:
          'SYNTHETIC pre-screen (RR-2 complement, NOT a substitute). Bar tuned here is ' +
          'PROVISIONAL per spec CH-4; post-launch recalibration against real learner ' +
          'transcripts is required. Grading measures the PRODUCTION JUDGE ' +
          '(challenge-round/grader.ts), the component prod runs with ' +
          'CHALLENGE_ROUND_GRADER_ENABLED on (default). DB-free: validateEvaluationEventIds ' +
          'is skipped, so verified/over-credit here is an UPPER BOUND on production. ' +
          (metrics.sufficientForCalibration
            ? ''
            : `INSUFFICIENT N (${metrics.totalRounds} < ${MIN_ROUNDS_FOR_CALIBRATION}) — smoke run, NOT a calibration basis.`),
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
  /** The pinned tutor model slug (`MENTOR_MODEL`, e.g. `openai/gpt-oss-120b`) —
   *  provenance only; the conversation driver is not the measured component. */
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
    signalEmissionByGrader: Record<string, number>;
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
    ...Object.keys(baseline.rates.signalEmissionByGrader),
    ...Object.keys(current.signalEmissionRateByGrader),
  ]);
  for (const k of graderKeys) {
    cmp(
      `signalEmissionByGrader.${k}`,
      baseline.rates.signalEmissionByGrader[k] ?? 0,
      current.signalEmissionRateByGrader[k] ?? 0,
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
      signalEmissionByGrader: metrics.signalEmissionRateByGrader,
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
  // Each scalar rate must be a FINITE number — `NaN` is `typeof 'number'`, and a
  // NaN baseline silently disables the drift channel downstream
  // (`Math.abs(NaN) > tolerance` is always false), so a corrupted baseline would
  // pass as "valid" and turn drift detection into a no-op. Reject it here.
  if (!Number.isFinite(r.underCredit)) {
    return {
      ok: false,
      reason:
        'rates.underCredit must be a finite number (missing/NaN — non-simulation or corrupted baseline)',
    };
  }
  if (!Number.isFinite(r.masteryVerified)) {
    return {
      ok: false,
      reason:
        'rates.masteryVerified must be a finite number (missing/NaN — non-simulation or corrupted baseline)',
    };
  }
  if (
    r.signalEmissionByGrader === null ||
    typeof r.signalEmissionByGrader !== 'object'
  ) {
    return {
      ok: false,
      reason:
        'missing rates.signalEmissionByGrader (looks like a non-simulation baseline)',
    };
  }
  for (const [k, v] of Object.entries(
    r.signalEmissionByGrader as Record<string, unknown>,
  )) {
    if (!Number.isFinite(v)) {
      return {
        ok: false,
        reason: `rates.signalEmissionByGrader[${k}] must be a finite number (got ${String(v)})`,
      };
    }
  }
  if (r.outcome === null || typeof r.outcome !== 'object') {
    return { ok: false, reason: 'missing rates.outcome' };
  }
  const outcomeEntries = Object.entries(r.outcome as Record<string, unknown>);
  if (outcomeEntries.length === 0) {
    return { ok: false, reason: 'rates.outcome is empty' };
  }
  for (const [k, v] of outcomeEntries) {
    if (!Number.isFinite(v)) {
      return {
        ok: false,
        reason: `rates.outcome[${k}] must be a finite number (got ${String(v)})`,
      };
    }
  }
  return { ok: true };
}
