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
  | 'exchange.session'
  | 'exchange.silent_classify'
  | 'filing'
  | 'transcript.hydration'
  | 'unknown';

// ---------------------------------------------------------------------------
// Reply text normalization — defensive guard against double-escape leak.
//
// Some LLMs (especially smaller models or fallback tiers) emit `\\n` inside the
// envelope's JSON `reply` string when they meant a real newline. Once
// JSON.parse runs, that becomes literal backslash + `n` characters, which the
// markdown renderer prints verbatim ("That's it!\n\nNow…"). The prompt has
// been tightened to ask for real line breaks, but the LLM still slips ~1% of
// the time, so we sanitize on the way out.
//
// Scope: ONLY four common whitespace-escape sequences. We intentionally do NOT
// touch `\u`, `\\`, `\"`, `\/`, or unknown `\X` sequences — those are either
// legitimate text (a backslash teaching code) or already-decoded JSON.
// ---------------------------------------------------------------------------

/** True when `text` contains the bug pattern (literal `\n`, `\r`, or `\t`). */
export function replyHasLiteralEscape(text: string): boolean {
  return /\\[nrt]/.test(text);
}

/**
 * Replace literal `\n`, `\r\n`, `\r`, `\t` sequences (backslash + letter, two
 * characters in the JS string) with the corresponding real whitespace.
 *
 * Order matters: `\r\n` is matched before `\n` and `\r` so a CRLF pair becomes
 * a single newline, not two.
 */
export function normalizeReplyText(text: string): string {
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t');
}

const EMBEDDED_ENVELOPE_TAIL_RE =
  /["\u201c\u201d]\s*,\s*["\u201c\u201d](?:signals|ui_hints|confidence)["\u201c\u201d]\s*:/;
const EMBEDDED_ENVELOPE_CONFIRM_RE =
  /["\u201c\u201d](?:partial_progress|needs_deepening|understanding_check|ready_to_finish|retrieval_score|note_prompt|post_session|fluency_drill|confidence)["\u201c\u201d]\s*:/;

/**
 * Some live models occasionally copy the envelope side-channel back into the
 * learner-visible `reply` string, yielding text like:
 *
 *   Nice work.","signals":{"partial_progress":false,...}
 *
 * The outer envelope can still be valid JSON, so schema parsing alone cannot
 * catch it. Strip the embedded side-channel tail while preserving plain prose.
 */
export function stripEmbeddedEnvelopeTail(text: string): string {
  const match = EMBEDDED_ENVELOPE_TAIL_RE.exec(text);
  if (!match) return text;

  const tail = text.slice(match.index);
  if (!EMBEDDED_ENVELOPE_CONFIRM_RE.test(tail)) return text;

  return text.slice(0, match.index).replace(/[ \t]+$/g, '');
}

export function findEmbeddedEnvelopeTailStart(text: string): number {
  return EMBEDDED_ENVELOPE_TAIL_RE.exec(text)?.index ?? -1;
}

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

  // Sanitize literal-escape leaks (`\\n` etc.) before any caller renders or
  // persists the reply. Idempotent for well-behaved LLM output.
  const envelope: LlmResponseEnvelope = {
    ...result.data,
    reply: stripEmbeddedEnvelopeTail(normalizeReplyText(result.data.reply)),
  };

  return { ok: true, envelope };
}

export interface ParseEnvelopeOptions {
  /**
   * When `true`, suppresses the per-call `llm.envelope.parse_failed` warn.
   * Use this on batch/loop call sites (e.g. transcript hydration) where
   * the caller aggregates failures itself and emits a single summary log.
   * Other callers must NOT set this — per-call logging is required by [BUG-847].
   */
  silent?: boolean;
}

export function parseEnvelope(
  response: string,
  surface: EnvelopeSurface = 'unknown',
  options: ParseEnvelopeOptions = {},
): ParseEnvelopeResult {
  const result = parseEnvelopeRaw(response);
  if (!result.ok && !options.silent) {
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

// ---------------------------------------------------------------------------
// extractReplyCandidate — best-effort raw `reply` reader for fallback paths.
//
// When `parseEnvelope` fails (schema violation, missing field), callers still
// need to surface *something* to the learner instead of raw envelope JSON
// (see [BUG-934]). This pulls the `reply` string directly out of the first
// JSON object without going through Zod, so flow-specific fallbacks can
// distinguish "schema violation due to empty reply" from "schema violation
// due to missing reply field" without each flow re-implementing the
// extraction. Returns undefined when no `reply` key is present or the JSON
// can't be extracted — callers should fall back to `rawResponse.trim()`.
// ---------------------------------------------------------------------------

export function extractReplyCandidate(response: string): string | undefined {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) return undefined;
  try {
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      typeof (parsed as { reply?: unknown }).reply === 'string'
    ) {
      return (parsed as { reply: string }).reply;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

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
