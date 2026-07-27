// ---------------------------------------------------------------------------
// EVALUATE Service — Devil's Advocate Verification (FR128-133)
// Stories 3.11-3.13: Present flawed reasoning for students to critique
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import type {
  EvaluateAssessment,
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
 * Determines whether an EVALUATE challenge should be triggered.
 * Strong retention gate: student must already know the material well.
 *
 * @param easeFactor - SM-2 ease factor (>= 2.5 = strong retention)
 * @param repetitions - Number of successful SM-2 repetitions (> 0 = reviewed at least once)
 */
export function shouldTriggerEvaluate(
  easeFactor: number,
  repetitions: number,
): boolean {
  return easeFactor >= 2.5 && repetitions > 0;
}

// ---------------------------------------------------------------------------
// Difficulty rung descriptions
// ---------------------------------------------------------------------------

const RUNG_DESCRIPTIONS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Obvious flaw: use a clearly wrong formula, reversed cause-effect, or factual error that contradicts basic definitions.',
  2: 'Moderate flaw: use a common misconception or apply a correct rule to the wrong context.',
  3: 'Subtle flaw: correct reasoning chain with one incorrect premise, or an edge case error that produces a plausible but wrong answer.',
  4: 'Expert flaw: correct at surface level but with a hidden assumption violation, or conflation of two related but distinct concepts.',
};

/**
 * Returns a human-readable description for the given difficulty rung.
 */
export function getEvaluateRungDescription(rung: 1 | 2 | 3 | 4): string {
  return RUNG_DESCRIPTIONS[rung];
}

// ---------------------------------------------------------------------------
// Quality mapping — EVALUATE → SM-2
// ---------------------------------------------------------------------------

/**
 * Maps EVALUATE challenge result to SM-2 quality.
 *
 * Key difference from standard: failure floors at quality 2-3 (not 0-1)
 * to prevent a single EVALUATE failure from devastating retention.
 *
 * @param passed - Whether the student correctly identified the flaw
 * @param rawQuality - LLM-assessed quality (0-5) of the student's critique
 * @returns SM-2 quality rating (0-5)
 */
// SM-2 algorithm requires quality in [3,5] for pass and [2,3] for fail. The stored quality field allows [0,5] per the schema, but this mapping intentionally narrows the range for the SM-2 algorithm.
export function mapEvaluateQualityToSm2(
  passed: boolean,
  rawQuality: number,
): number {
  if (passed) {
    // Passed: quality 3-5 based on critique depth
    return Math.max(3, Math.min(5, rawQuality));
  }
  // Failed: floor at 2-3 (not 0-1)
  return rawQuality <= 1 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// Three-strike failure handling
// ---------------------------------------------------------------------------

export interface EvaluateFailureAction {
  action: 'reveal_flaw' | 'lower_difficulty' | 'exit_to_standard';
  message: string;
  newDifficultyRung?: 1 | 2 | 3 | 4;
}

/**
 * Determines the appropriate response after an EVALUATE failure.
 *
 * Three-strike escalation:
 * - 1st failure: reveal the flaw and explain the misconception
 * - 2nd failure: retry at a lower difficulty rung
 * - 3rd+ failure: mark for standard review, exit EVALUATE mode
 *
 * @param consecutiveFailures - Number of consecutive EVALUATE failures
 * @param currentRung - Current difficulty rung (1-4)
 */
export function handleEvaluateFailure(
  consecutiveFailures: number,
  currentRung: 1 | 2 | 3 | 4,
): EvaluateFailureAction {
  if (consecutiveFailures <= 1) {
    return {
      action: 'reveal_flaw',
      message:
        'Let me show you where the flaw was. Take a look at the explanation again.',
    };
  }

  if (consecutiveFailures === 2 && currentRung > 1) {
    const newRung = (currentRung - 1) as 1 | 2 | 3 | 4;
    return {
      action: 'lower_difficulty',
      message:
        "Let's try a simpler challenge. This one will have a more obvious flaw.",
      newDifficultyRung: newRung,
    };
  }

  return {
    action: 'exit_to_standard',
    message:
      "That's okay — this was a tough challenge. Let's review this topic in the standard way first.",
  };
}

// ---------------------------------------------------------------------------
// Assessment parsing
// ---------------------------------------------------------------------------

/**
 * Maps the envelope's `signals.evaluate_assessment` (snake_case wire shape) to
 * the camelCase `EvaluateAssessment` consumer type. Returns null when the
 * required `challenge_passed` field is missing — the LLM emitted partial data.
 */
export function evaluateAssessmentFromEnvelopeSignal(
  signal: NonNullable<
    NonNullable<LlmResponseEnvelope['signals']>['evaluate_assessment']
  >,
): EvaluateAssessment | null {
  // challenge_passed can degrade to undefined during field-tolerant envelope
  // parsing; fail closed here so a missing verdict never grants mastery.
  if (typeof signal.challenge_passed !== 'boolean') return null;

  const challengePassed = signal.challenge_passed;
  const quality =
    typeof signal.quality === 'number'
      ? Math.max(0, Math.min(5, Math.round(signal.quality)))
      : challengePassed
        ? 4
        : 2;
  const flawIdentified =
    typeof signal.flaw_identified === 'string'
      ? signal.flaw_identified
      : undefined;

  return { challengePassed, quality, flawIdentified };
}

/**
 * Parses an EVALUATE assessment from a session-event-shaped row.
 *
 * Resolution order:
 *   1. `metadata.signals.evaluate_assessment` (canonical post-migration path —
 *      written by the exchange persistence layer when the LLM emitted the
 *      structured envelope).
 *   2. Raw envelope JSON in `content` (transition path: if the event content
 *      still contains the full LLM envelope JSON, parse it via parseEnvelope).
 *   3. Returns null. The legacy "look for a {challengePassed: ...} JSON blob
 *      in free-text prose" path is gone — those events were already
 *      backfilled and the contract (AGENTS.md → LLM Response Envelope) bans
 *      that shape.
 */
export function parseEvaluateAssessment(
  event: { content: string; metadata?: unknown } | string,
): EvaluateAssessment | null {
  // Legacy callers may still pass a raw string. Treat it as the event content
  // with no metadata, then go through the same resolution pipeline.
  const normalised =
    typeof event === 'string' ? { content: event, metadata: null } : event;

  // 1. Canonical: pull from metadata.signals.evaluate_assessment
  const fromMetadata = extractEvaluateSignalFromMetadata(normalised.metadata);
  if (fromMetadata) {
    const mapped = evaluateAssessmentFromEnvelopeSignal(fromMetadata);
    if (mapped) return mapped;
  }

  // 2. Transition: the event content is still the raw envelope JSON
  // (pre-cleanup). parseEnvelope is the single sanctioned parser.
  if (
    typeof normalised.content === 'string' &&
    normalised.content.trim().startsWith('{')
  ) {
    const parsed = parseEnvelope(normalised.content, 'unknown', {
      silent: true,
    });
    if (parsed.ok) {
      const signal = parsed.envelope.signals?.evaluate_assessment;
      if (signal) {
        const mapped = evaluateAssessmentFromEnvelopeSignal(signal);
        if (mapped) return mapped;
      }
    } else {
      // Only log when the content LOOKED like an envelope (started with `{`)
      // but failed to parse — that's the meaningful failure case. A plain
      // prose reply that doesn't start with `{` is the expected post-cleanup
      // shape and shouldn't generate noise.
      // Shape-only diagnostics — LLM output derived from a
      // learner's session must not ship to logs/Sentry, even truncated.
      logger.warn('Failed to parse evaluate assessment via envelope', {
        reason: parsed.reason,
        contentLength: normalised.content.length,
      });
      captureException(new Error('parseEvaluateAssessment envelope failure'), {
        extra: {
          context: 'parseEvaluateAssessment',
          reason: parsed.reason,
          responseLength: normalised.content.length,
        },
      });
    }
  }

  return null;
}

/**
 * Pulls `signals.evaluate_assessment` out of a session_events.metadata jsonb
 * blob. The exchange-persistence layer will write it at
 * `metadata.signals.evaluate_assessment` (envelope-style nesting). Defensive
 * against malformed/legacy rows.
 */
function extractEvaluateSignalFromMetadata(
  metadata: unknown,
): NonNullable<
  NonNullable<LlmResponseEnvelope['signals']>['evaluate_assessment']
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
    'evaluate_assessment'
  ];
  if (
    !assessment ||
    typeof assessment !== 'object' ||
    Array.isArray(assessment)
  ) {
    return null;
  }
  const obj = assessment as Record<string, unknown>;
  if (typeof obj['challenge_passed'] !== 'boolean') return null;
  return {
    challenge_passed: obj['challenge_passed'],
    flaw_identified:
      typeof obj['flaw_identified'] === 'string'
        ? obj['flaw_identified']
        : undefined,
    quality:
      typeof obj['quality'] === 'number'
        ? Math.max(0, Math.min(5, Math.round(obj['quality'])))
        : undefined,
  };
}
