// ---------------------------------------------------------------------------
// Eval-LLM — Signal-distribution regression guard (Self-improvement Layer 1).
//
// Goal: catch envelope regressions (model silently stops emitting valid JSON,
// tone prompt drift shifts `partial_progress` from 20% to 2%, a ui_hint goes
// missing) BEFORE a production deploy. Runs on top of the existing harness —
// same flows, same fixtures, just computes histograms over the accumulated
// live responses and compares to a checked-in baseline.
//
// The module does three things:
//   1. Extract metrics from a live envelope response (parse or fail).
//   2. Aggregate per-flow histograms across all (scenario × profile) samples.
//   3. Compare a current aggregation to a baseline and flag shifts that exceed
//      a percentage-point threshold.
//
// Why percentage points? With ~30 samples per flow (see `docs/plans/
// 2026-04-20-prelaunch-llm-tuning.md`), 1 sample = ~3.3pp. Default threshold
// (5pp) tolerates the odd LLM flake while still catching any systemic drop.
// Callers can tighten via `--baseline-tolerance`.
//
// Complementary to `FlowDefinition.expectedResponseSchema`:
//   - expectedResponseSchema catches "envelope shape is invalid" (hard fail
//     per sample, surfaced in the snapshot).
//   - metrics.ts catches "envelope shape is fine but signal *distribution*
//     has drifted" (soft aggregate fail across the run).
// ---------------------------------------------------------------------------

import { llmResponseEnvelopeSchema } from '@eduagent/schemas';

/** Per-sample outcome extracted from one live LLM response. */
export interface SampleMetrics {
  /** Envelope parsed cleanly (JSON + schema ok). */
  envelopeOk: boolean;
  /** Reply field present and non-empty. */
  hasReply: boolean;
  /** Signals observed in the envelope (all false when envelope parse failed). */
  signals: {
    partialProgress: boolean;
    needsDeepening: boolean;
    understandingCheck: boolean;
    readyToFinish: boolean;
  };
  /** UI hints observed (all false when envelope parse failed). */
  uiHints: {
    notePromptShow: boolean;
    fluencyDrillActive: boolean;
  };
  /** Model self-reported confidence, when present. */
  confidence?: 'low' | 'medium' | 'high';
}

/** Aggregated rates for one flow (0..1, not percentages). */
export interface FlowAggregate {
  /** Number of samples contributing to these rates. */
  n: number;
  rates: {
    envelopeOk: number;
    hasReply: number;
    partialProgress: number;
    needsDeepening: number;
    understandingCheck: number;
    readyToFinish: number;
    notePromptShow: number;
    fluencyDrillActive: number;
    /** Share of samples where confidence === 'low'. */
    confidenceLow: number;
  };
}

/** Shape persisted in `baseline.json`. */
export interface Baseline {
  /** Schema version — bump when the rates shape changes. */
  version: 1;
  /** When the baseline was last updated. */
  updatedAt: string;
  /** Git SHA or commit ref, if the caller supplied one. */
  ref?: string;
  /** Per-flow aggregates, keyed by flow id. */
  flows: Record<string, FlowAggregate>;
}

/** One detected drift between current run and baseline. */
export interface BaselineDrift {
  flowId: string;
  metric: keyof FlowAggregate['rates'];
  baselineRate: number;
  currentRate: number;
  /** Absolute percentage-point delta as a fraction — 0.12 means 12pp. */
  deltaPp: number;
}

/**
 * Extract sample metrics from a raw live LLM response. Uses the shared
 * envelope schema — anything that fails JSON or Zod validation counts as
 * `envelopeOk: false`. Non-envelope flows (dictation prose, quiz JSON
 * payloads) should NOT be fed into this function; the caller filters by
 * flow id via `emitsEnvelope`.
 */
export function extractSampleMetrics(rawResponse: string): SampleMetrics {
  const empty: SampleMetrics = {
    envelopeOk: false,
    hasReply: false,
    signals: {
      partialProgress: false,
      needsDeepening: false,
      understandingCheck: false,
      readyToFinish: false,
    },
    uiHints: {
      notePromptShow: false,
      fluencyDrillActive: false,
    },
  };

  const match = rawResponse.match(/\{[\s\S]*\}/);
  if (!match) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return empty;
  }

  const result = llmResponseEnvelopeSchema.safeParse(parsed);
  if (!result.success) return empty;

  const env = result.data;
  const signals = env.signals ?? {};
  const hints = env.ui_hints ?? {};

  return {
    envelopeOk: true,
    hasReply: env.reply.trim().length > 0,
    signals: {
      partialProgress: signals.partial_progress === true,
      needsDeepening: signals.needs_deepening === true,
      understandingCheck: signals.understanding_check === true,
      readyToFinish: signals.ready_to_finish === true,
    },
    uiHints: {
      notePromptShow: hints.note_prompt?.show === true,
      fluencyDrillActive: hints.fluency_drill?.active === true,
    },
    confidence: env.confidence,
  };
}

/** Fold a list of per-sample observations into one FlowAggregate. */
export function aggregateFlowSamples(samples: SampleMetrics[]): FlowAggregate {
  const n = samples.length;
  if (n === 0) {
    return {
      n: 0,
      rates: {
        envelopeOk: 0,
        hasReply: 0,
        partialProgress: 0,
        needsDeepening: 0,
        understandingCheck: 0,
        readyToFinish: 0,
        notePromptShow: 0,
        fluencyDrillActive: 0,
        confidenceLow: 0,
      },
    };
  }

  let envelopeOk = 0;
  let hasReply = 0;
  let partialProgress = 0;
  let needsDeepening = 0;
  let understandingCheck = 0;
  let readyToFinish = 0;
  let notePromptShow = 0;
  let fluencyDrillActive = 0;
  let confidenceLow = 0;

  for (const s of samples) {
    if (s.envelopeOk) envelopeOk++;
    if (s.hasReply) hasReply++;
    if (s.signals.partialProgress) partialProgress++;
    if (s.signals.needsDeepening) needsDeepening++;
    if (s.signals.understandingCheck) understandingCheck++;
    if (s.signals.readyToFinish) readyToFinish++;
    if (s.uiHints.notePromptShow) notePromptShow++;
    if (s.uiHints.fluencyDrillActive) fluencyDrillActive++;
    if (s.confidence === 'low') confidenceLow++;
  }

  return {
    n,
    rates: {
      envelopeOk: envelopeOk / n,
      hasReply: hasReply / n,
      partialProgress: partialProgress / n,
      needsDeepening: needsDeepening / n,
      understandingCheck: understandingCheck / n,
      readyToFinish: readyToFinish / n,
      notePromptShow: notePromptShow / n,
      fluencyDrillActive: fluencyDrillActive / n,
      confidenceLow: confidenceLow / n,
    },
  };
}

/**
 * Compare the current run's flow aggregates to a baseline. Emits a drift entry
 * for every (flow, metric) pair whose absolute percentage-point delta exceeds
 * `tolerancePp` (expressed as a fraction — 0.05 = 5pp). Flows that are in one
 * map but not the other are reported as full-magnitude shifts against zero,
 * so new/removed flows can't silently bypass the guard.
 */
export function compareAgainstBaseline(
  current: Record<string, FlowAggregate>,
  baseline: Baseline,
  tolerancePp: number
): BaselineDrift[] {
  const drifts: BaselineDrift[] = [];
  const flowIds = new Set<string>([
    ...Object.keys(current),
    ...Object.keys(baseline.flows),
  ]);

  for (const flowId of flowIds) {
    const cur = current[flowId];
    const base = baseline.flows[flowId];

    if (!cur || cur.n === 0) {
      if (base && base.n > 0) {
        // Flow disappeared from the run — treat each non-trivial metric as
        // a full drop to 0 so it's impossible to miss.
        for (const metric of Object.keys(base.rates) as Array<
          keyof FlowAggregate['rates']
        >) {
          if (base.rates[metric] > tolerancePp) {
            drifts.push({
              flowId,
              metric,
              baselineRate: base.rates[metric],
              currentRate: 0,
              deltaPp: base.rates[metric],
            });
          }
        }
      }
      continue;
    }

    if (!base) {
      // New flow — everything is a delta-from-zero. Caller can
      // `--update-baseline` to accept.
      for (const metric of Object.keys(cur.rates) as Array<
        keyof FlowAggregate['rates']
      >) {
        const rate = cur.rates[metric];
        if (rate > tolerancePp) {
          drifts.push({
            flowId,
            metric,
            baselineRate: 0,
            currentRate: rate,
            deltaPp: rate,
          });
        }
      }
      continue;
    }

    for (const metric of Object.keys(cur.rates) as Array<
      keyof FlowAggregate['rates']
    >) {
      const curRate = cur.rates[metric];
      const baseRate = base.rates[metric];
      const delta = Math.abs(curRate - baseRate);
      if (delta > tolerancePp) {
        drifts.push({
          flowId,
          metric,
          baselineRate: baseRate,
          currentRate: curRate,
          deltaPp: delta,
        });
      }
    }
  }

  return drifts.sort(
    (a, b) =>
      b.deltaPp - a.deltaPp ||
      a.flowId.localeCompare(b.flowId) ||
      a.metric.localeCompare(b.metric)
  );
}

/**
 * Build a Baseline document from the current run's envelope metrics.
 * Callers write this to `baseline.json` when `--update-baseline` is set.
 */
export function buildBaseline(
  flows: Record<string, FlowAggregate>,
  meta?: { ref?: string }
): Baseline {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    ref: meta?.ref,
    flows,
  };
}

/** Safely parse a Baseline from raw file content. Returns null on any error. */
export function parseBaseline(raw: string): Baseline | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1 ||
      typeof (parsed as { flows?: unknown }).flows !== 'object' ||
      (parsed as { flows?: unknown }).flows === null
    ) {
      return null;
    }
    return parsed as Baseline;
  } catch {
    return null;
  }
}

/**
 * Render a short human-readable drift report. Returns an empty string when
 * `drifts` is empty so CI logs stay quiet in the happy path.
 */
export function formatDriftReport(drifts: BaselineDrift[]): string {
  if (drifts.length === 0) return '';
  const lines: string[] = [
    `Signal drift detected in ${drifts.length} (flow, metric) pairs:`,
    '',
  ];
  for (const d of drifts) {
    const delta = (d.deltaPp * 100).toFixed(1);
    const before = (d.baselineRate * 100).toFixed(1);
    const after = (d.currentRate * 100).toFixed(1);
    lines.push(
      `  [${d.flowId}] ${d.metric}: ${before}% → ${after}% (Δ${delta}pp)`
    );
  }
  return lines.join('\n');
}
