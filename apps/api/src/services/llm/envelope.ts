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
// Scope: ONLY three common whitespace-escape sequences (`\n`, `\r\n`, `\t`).
// We intentionally do NOT touch a standalone `\r`, `\u`, `\\`, `\"`, `\/`, or
// unknown `\X` sequences — those are either legitimate text (a coding lesson
// that mentions the `\r` escape) or already-decoded JSON.
// ---------------------------------------------------------------------------

/**
 * True when `text` contains a literal whitespace-escape sequence (`\n`, `\r`,
 * or `\t`) — the double-escape leak signal. Note: a standalone `\r` is detected
 * here but, per the scope comment above, is deliberately left intact by
 * `normalizeReplyText`; only `\n`, `\r\n`, and `\t` are rewritten. [#899]
 */
export function replyHasLiteralEscape(text: string): boolean {
  return /\\[nrt]/.test(text);
}

/**
 * Replace literal `\r\n`, `\n`, `\t` sequences (backslash + letter, two
 * characters in the JS string) with the corresponding real whitespace.
 *
 * Order matters: `\r\n` is matched before `\n` so a CRLF pair becomes a single
 * newline, not two.
 *
 * [#899] A *standalone* literal `\r` is deliberately NOT rewritten. Models that
 * leak escapes emit `\n` (or the `\r\n` pair handled above), never a lone `\r`
 * meant as a newline — so collapsing `\r` only corrupted coding prose that
 * legitimately discusses the carriage-return escape.
 */
export function normalizeReplyText(text: string): string {
  return text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

const EMBEDDED_ENVELOPE_TAIL_RE =
  /["\u201c\u201d]\s*,\s*["\u201c\u201d](?:signals|ui_hints|private_sources|confidence)["\u201c\u201d]\s*:/;
const EMBEDDED_ENVELOPE_CONFIRM_RE =
  /["\u201c\u201d](?:partial_progress|needs_deepening|understanding_check|ready_to_finish|retrieval_score|note_prompt|post_session|fluency_drill|private_sources|relied_on|insufficient|confidence)["\u201c\u201d]\s*:/;

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

function nextNonWhitespaceChar(
  value: string,
  startIndex: number,
): string | null {
  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char && !/\s/.test(char)) return char;
  }
  return null;
}

function repairBareQuotesInsideJsonStrings(jsonStr: string): string | null {
  let repaired = '';
  let inString = false;
  let escaped = false;
  let changed = false;

  for (let index = 0; index < jsonStr.length; index += 1) {
    const char = jsonStr.charAt(index);

    if (!inString) {
      repaired += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      repaired += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      repaired += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      const next = nextNonWhitespaceChar(jsonStr, index + 1);
      if (
        next === null ||
        next === ':' ||
        next === ',' ||
        next === '}' ||
        next === ']'
      ) {
        repaired += char;
        inString = false;
      } else {
        repaired += '\\"';
        changed = true;
      }
      continue;
    }

    repaired += char;
  }

  return changed && !inString ? repaired : null;
}

export interface ParseEnvelopeOptions {
  /**
   * Removes only `signals.answer_evaluation` from syntactically valid JSON
   * before shared-envelope schema validation. Excluded/disabled exchange
   * paths use this so an unsolicited malformed optional signal cannot discard
   * an otherwise valid reply or unrelated signals. Every other field remains
   * strict, and enabled ordinary exchanges leave this false.
   */
  ignoreAnswerEvaluation?: boolean;
  /**
   * When `true`, suppresses the per-call `llm.envelope.parse_failed` warn.
   * Use this on batch/loop call sites (e.g. transcript hydration) where
   * the caller aggregates failures itself and emits a single summary log.
   * Other callers must NOT set this — per-call logging is required by [BUG-847].
   */
  silent?: boolean;
}

function parseEnvelopeRaw(
  response: string,
  options: ParseEnvelopeOptions,
): ParseEnvelopeResult {
  const jsonStr = extractFirstJsonObject(response);
  if (!jsonStr) {
    return { ok: false, reason: 'no_json_found', raw: response };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    const repairedJsonStr = repairBareQuotesInsideJsonStrings(jsonStr);
    if (!repairedJsonStr) {
      return { ok: false, reason: 'invalid_json', raw: response, error };
    }
    try {
      parsed = JSON.parse(repairedJsonStr);
    } catch {
      return { ok: false, reason: 'invalid_json', raw: response, error };
    }
  }

  if (
    options.ignoreAnswerEvaluation === true &&
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed)
  ) {
    const envelope = parsed as Record<string, unknown>;
    const rawSignals = envelope['signals'];
    if (
      typeof rawSignals === 'object' &&
      rawSignals !== null &&
      !Array.isArray(rawSignals)
    ) {
      const signals = { ...(rawSignals as Record<string, unknown>) };
      delete signals['answer_evaluation'];
      parsed = { ...envelope, signals };
    }
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

export function parseEnvelope(
  response: string,
  surface: EnvelopeSurface = 'unknown',
  options: ParseEnvelopeOptions = {},
): ParseEnvelopeResult {
  const result = parseEnvelopeRaw(response, options);
  if (!result.ok && !options.silent) {
    logger.warn('llm.envelope.parse_failed', {
      surface,
      reason: result.reason,
      // Response bodies can contain learner text. Length preserves a useful
      // format-drift signal without shipping content to log aggregation.
      responseLength: response.length,
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
