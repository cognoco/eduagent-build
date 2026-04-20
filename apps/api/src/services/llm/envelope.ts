import {
  llmResponseEnvelopeSchema,
  type LlmResponseEnvelope,
} from '@eduagent/schemas';

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
 * Extract the first balanced JSON object substring from free text.
 * Matches `{ ... }` including nested braces — providers without JSON mode
 * sometimes prefix with prose even when the prompt forbids it.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function parseEnvelope(response: string): ParseEnvelopeResult {
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
