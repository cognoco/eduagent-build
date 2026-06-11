// ---------------------------------------------------------------------------
// TEACH_BACK Service — Feynman Technique (FR138-143)
// Stories 3.16-3.18: Student explains concept, AI plays confused student
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type {
  TeachBackAssessment,
  LlmResponseEnvelope,
} from '@eduagent/schemas';
import { createLogger } from './logger';
import { captureException } from './sentry';
import { parseEnvelope } from './llm/envelope';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Trigger gating
// ---------------------------------------------------------------------------

/**
 * Determines whether a TEACH_BACK session should be triggered.
 * Moderate-to-strong retention: student must know the concept well enough
 * to attempt teaching it to someone else.
 *
 * @param easeFactor - SM-2 ease factor (>= 2.3 = moderate retention)
 * @param repetitions - Number of successful SM-2 repetitions (> 0 = reviewed at least once)
 */
export function shouldTriggerTeachBack(
  easeFactor: number,
  repetitions: number,
): boolean {
  return easeFactor >= 2.3 && repetitions > 0;
}

// ---------------------------------------------------------------------------
// Quality mapping — TEACH_BACK rubric → SM-2
// ---------------------------------------------------------------------------

/**
 * Maps TEACH_BACK rubric scores to SM-2 quality using weighted average.
 *
 * Weights: accuracy 50%, completeness 30%, clarity 20%
 * These weights reflect the relative importance of factual correctness
 * vs breadth vs presentation quality.
 *
 * @param assessment - TEACH_BACK assessment from LLM
 * @returns SM-2 quality rating (0-5)
 */
export function mapTeachBackRubricToSm2(
  assessment: TeachBackAssessment,
): number {
  const weighted =
    assessment.accuracy * 0.5 +
    assessment.completeness * 0.3 +
    assessment.clarity * 0.2;

  return Math.round(Math.max(0, Math.min(5, weighted)));
}

// ---------------------------------------------------------------------------
// Assessment parsing
// ---------------------------------------------------------------------------

/**
 * Maps the envelope's `signals.teach_back_assessment` (snake_case wire shape)
 * to the camelCase `TeachBackAssessment` consumer type. Returns null when both
 * required rubric fields (completeness, accuracy) are missing — the LLM
 * emitted partial data.
 */
export function teachBackAssessmentFromEnvelopeSignal(
  signal: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['teach_back_assessment']
  >,
): TeachBackAssessment | null {
  if (signal.completeness === undefined || signal.accuracy === undefined) {
    return null;
  }

  const clamp = (val: unknown, fallback: number): number => {
    if (typeof val !== 'number') return fallback;
    return Math.max(0, Math.min(5, Math.round(val)));
  };

  const completeness = clamp(signal.completeness, 3);
  const accuracy = clamp(signal.accuracy, 3);
  const clarity = clamp(signal.clarity, 3);
  const overallQuality = clamp(signal.overall_quality, 3);

  const weakestArea =
    signal.weakest_area ?? findWeakest(completeness, accuracy, clarity);

  const gapIdentified =
    typeof signal.gap_identified === 'string' ? signal.gap_identified : null;

  return {
    completeness,
    accuracy,
    clarity,
    overallQuality,
    weakestArea,
    gapIdentified,
  };
}

/**
 * Parses a TEACH_BACK assessment from a session-event-shaped row.
 *
 * Resolution order:
 *   1. `metadata.signals.teach_back_assessment` (canonical post-migration path
 *      — written by the exchange persistence layer when the LLM emitted the
 *      structured envelope).
 *   2. Raw envelope JSON in `content` (transition path: if the event content
 *      still contains the full LLM envelope JSON, parse it via parseEnvelope).
 *   3. Returns null. The legacy "look for a {completeness, accuracy} JSON
 *      blob in free-text prose" path is gone — those events were already
 *      backfilled and the contract (AGENTS.md → LLM Response Envelope) bans
 *      that shape.
 */
export function parseTeachBackAssessment(
  event: { content: string; metadata?: unknown } | string,
): TeachBackAssessment | null {
  const normalised =
    typeof event === 'string' ? { content: event, metadata: null } : event;

  // 1. Canonical: pull from metadata.signals.teach_back_assessment
  const fromMetadata = extractTeachBackSignalFromMetadata(normalised.metadata);
  if (fromMetadata) {
    const mapped = teachBackAssessmentFromEnvelopeSignal(fromMetadata);
    if (mapped) return mapped;
  }

  // 2. Transition: event content is still the raw envelope JSON
  if (
    typeof normalised.content === 'string' &&
    normalised.content.trim().startsWith('{')
  ) {
    const parsed = parseEnvelope(normalised.content, 'unknown', {
      silent: true,
    });
    if (parsed.ok) {
      const signal = parsed.envelope.signals?.teach_back_assessment;
      if (signal) {
        const mapped = teachBackAssessmentFromEnvelopeSignal(signal);
        if (mapped) return mapped;
      }
    } else {
      logger.warn('Failed to parse teach-back assessment via envelope', {
        reason: parsed.reason,
      });
      captureException(new Error('parseTeachBackAssessment envelope failure'), {
        extra: { context: 'parseTeachBackAssessment', reason: parsed.reason },
      });
    }
  }

  return null;
}

/**
 * Pulls `signals.teach_back_assessment` out of a session_events.metadata jsonb
 * blob. Defensive against malformed/legacy rows.
 */
function extractTeachBackSignalFromMetadata(
  metadata: unknown,
): NonNullable<
  NonNullable<LlmResponseEnvelope['signals']>['teach_back_assessment']
> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const meta = metadata as Record<string, unknown>;
  const signals = meta['signals'];
  if (!signals || typeof signals !== 'object' || Array.isArray(signals)) {
    return null;
  }
  const assessment = (signals as Record<string, unknown>)[
    'teach_back_assessment'
  ];
  if (
    !assessment ||
    typeof assessment !== 'object' ||
    Array.isArray(assessment)
  ) {
    return null;
  }
  const obj = assessment as Record<string, unknown>;
  const validAreas = ['completeness', 'accuracy', 'clarity'];
  const weakestArea =
    typeof obj['weakest_area'] === 'string' &&
    validAreas.includes(obj['weakest_area'])
      ? (obj['weakest_area'] as 'completeness' | 'accuracy' | 'clarity')
      : undefined;

  const clamped = (val: unknown): number | undefined => {
    if (typeof val !== 'number') return undefined;
    return Math.max(0, Math.min(5, Math.round(val)));
  };

  // gap_identified: distinguish null (LLM said no gap) from undefined (LLM omitted).
  let gapIdentified: string | null | undefined;
  if (obj['gap_identified'] === null) {
    gapIdentified = null;
  } else if (typeof obj['gap_identified'] === 'string') {
    gapIdentified = obj['gap_identified'];
  } else {
    gapIdentified = undefined;
  }

  return {
    completeness: clamped(obj['completeness']),
    accuracy: clamped(obj['accuracy']),
    clarity: clamped(obj['clarity']),
    overall_quality: clamped(obj['overall_quality']),
    weakest_area: weakestArea,
    gap_identified: gapIdentified,
  };
}

/**
 * Determines the weakest area from rubric scores.
 * Breaks ties in order: accuracy > completeness > clarity
 * (accuracy is most pedagogically important).
 */
function findWeakest(
  completeness: number,
  accuracy: number,
  clarity: number,
): 'completeness' | 'accuracy' | 'clarity' {
  if (accuracy <= completeness && accuracy <= clarity) return 'accuracy';
  if (completeness <= clarity) return 'completeness';
  return 'clarity';
}
