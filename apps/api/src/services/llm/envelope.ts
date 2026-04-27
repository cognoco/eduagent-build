import {
  llmResponseEnvelopeSchema,
  type LlmResponseEnvelope,
} from '@eduagent/schemas';
import { extractFirstJsonObject } from './extract-json';
import { createLogger } from '../logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// parseEnvelope — shared helper for all LLM flows migrating to the structured
// response envelope.
//
// Contract:
//   - success: returns { ok: true, envelope }
//   - failure: returns { ok: false, reason, raw } — callers decide the fallback
//
// Callers MUST NOT treat a parse failure as "no signals" silently — they
// should either fail the flow, fall back to a safe default, or log the raw
// text for triage. See docs/specs/2026-04-18-llm-response-envelope.md.
//
// [BUG-847] Every parse FAILURE emits a structured `llm.envelope.parse_failed`
// log entry with the call-site `surface` so we can query "how many envelopes
// failed schema validation in the last 24h, on which surface" without relying
// on each caller to remember to log. Successful parses are silent.
// ---------------------------------------------------------------------------

export type ParseEnvelopeSuccess = {
  ok: true;
  envelope: LlmResponseEnvelope;
};

export type ParseEnvelopeFailureReason =
  | 'no_json_found'
  | 'invalid_json'
  | 'schema_violation';

export type ParseEnvelopeFailure = {
  ok: false;
  reason: ParseEnvelopeFailureReason;
  raw: string;
  error?: unknown;
};

export type ParseEnvelopeResult = ParseEnvelopeSuccess | ParseEnvelopeFailure;

/**
 * Identifies the call-site so triage can answer "where is this failure coming
 * from?" without re-reading the stack trace. Add a new value here when a new
 * envelope-consuming flow lands; never pass a free-form string.
 */
export type EnvelopeSurface =
  | 'interview'
  | 'exchange.session'
  | 'exchange.silent_classify'
  | 'filing'
  | 'unknown';

function parseEnvelopeRaw(response: string): ParseEnvelopeResult {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) {
    return { ok: false, reason: 'no_json_found', raw: response };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    return { ok: false, reason: 'invalid_json', raw: response, error };
  }

  const result = llmResponseEnvelopeSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: 'schema_violation',
      raw: response,
      error: result.error,
    };
  }

  return { ok: true, envelope: result.data };
}

export function parseEnvelope(
  response: string,
  surface: EnvelopeSurface = 'unknown'
): ParseEnvelopeResult {
  const result = parseEnvelopeRaw(response);
  if (!result.ok) {
    logger.warn('llm.envelope.parse_failed', {
      surface,
      reason: result.reason,
      // 200-char snippet keeps log volume bounded while still giving a triage
      // hand-hold; full raw response is in `result.raw` for callers that need
      // it but is too noisy to ship to log aggregation by default.
      rawSnippet: response.slice(0, 200),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// isRecognizedMarker — canonical detector for marker-only LLM payloads.
//
// A "marker" is a JSON object with structured signal fields but NO `reply`
// text for the user. Historical examples: `{"notePrompt":true}`. These
// shapes fail full-envelope validation (no `reply`) but are semantically
// valid — callers should route to a dispatch handler if one applies, or
// surface them as `orphan_marker` fallbacks otherwise.
//
// Consolidating detection here removes the dual-source-of-truth between
// server-side envelope parsing and the legacy mobile regex-strip at
// `use-session-streaming.ts:581-593` (scheduled for removal in
// [EMPTY-REPLY-GUARD-3]).
// ---------------------------------------------------------------------------

export const KNOWN_MARKER_KEYS: ReadonlySet<string> = new Set([
  'notePrompt',
  'fluencyDrill',
  'escalationHold',
]);

export function isRecognizedMarker(response: string): boolean {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const obj = parsed as Record<string, unknown>;
  // An envelope (has `reply`) is not a marker even if it also contains
  // marker-like keys — envelopes go through parseEnvelope, not here.
  if ('reply' in obj) return false;
  for (const key of Object.keys(obj)) {
    if (KNOWN_MARKER_KEYS.has(key)) return true;
  }
  return false;
}
