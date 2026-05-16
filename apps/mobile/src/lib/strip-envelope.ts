// ---------------------------------------------------------------------------
// stripEnvelopeJson — render-boundary defense [BUG-941]
//
// Mirrors the API-side projectAiResponseContent
// (apps/api/src/services/llm/project-response.ts) on the mobile side. If a
// chat-bubble content string ever arrives shaped like a full LLM envelope
// (e.g. `{"reply":"...","signals":{...},"ui_hints":{...}}`) — which can
// happen when a non-streaming code path bypasses parseEnvelope, or when an
// in-memory message is set from a source that wasn't passed through the
// transcript projector — strip it down to just the `.reply` field before
// rendering.
//
// This is intentionally permissive: it never throws, never mutates anything
// other than the string content, and always returns a string. Plain prose
// passes through untouched (cheap pre-check). Malformed JSON also passes
// through — better to surface the raw text for triage than swallow it.
//
// Why a pre-check instead of always parsing: the mobile bubble re-renders
// on every keystroke during streaming. Cheap-bail on `startsWith('{')` plus
// `includes('"reply"')` keeps the hot path zero-allocation for normal text.
//
// CR-PR129-M7: The detection heuristic was tightened (2026-05-01) to avoid
// silently rewriting legitimate assistant messages that happen to contain
// JSON-shaped text with a `reply` field as part of prose. The parsed object
// must contain ONLY keys from the known envelope vocabulary
// (`reply`, `signals`, `ui_hints`). Any unrecognised key signals that the
// JSON is arbitrary data (e.g. a teaching example), not a leaked envelope.
// ---------------------------------------------------------------------------

/**
 * The exhaustive set of top-level keys produced by the LLM envelope schema
 * (`llmResponseEnvelopeSchema` in `@eduagent/schemas`). Any parsed object
 * whose key-set is not a strict subset of these is not an envelope.
 */
const KNOWN_ENVELOPE_KEYS = new Set(['reply', 'signals', 'ui_hints']);

/**
 * A confirmed envelope must contain `reply` PLUS at least one structural
 * sibling key (`signals` or `ui_hints`). A lone `{"reply":"x"}` object is
 * ambiguous — it could be arbitrary JSON — so it is treated as prose.
 */
const REQUIRED_ENVELOPE_SIBLINGS = new Set(['signals', 'ui_hints']);

const EMBEDDED_ENVELOPE_TAIL_RE =
  /(?:["\u201c\u201d]\s*)?,\s*["\u201c\u201d](?:signals|ui_hints|confidence)["\u201c\u201d]\s*:/;
const EMBEDDED_ENVELOPE_CONFIRM_RE =
  /["\u201c\u201d](?:partial_progress|needs_deepening|understanding_check|ready_to_finish|retrieval_score|note_prompt|post_session|fluency_drill)["\u201c\u201d]\s*:/;

function stripEmbeddedEnvelopeTail(text: string): string {
  const match = EMBEDDED_ENVELOPE_TAIL_RE.exec(text);
  if (!match) return text;

  const tail = text.slice(match.index);
  if (!EMBEDDED_ENVELOPE_CONFIRM_RE.test(tail)) return text;

  return text.slice(0, match.index).replace(/[ \t]+$/g, '');
}

/**
 * Strip a leading/trailing markdown code fence from `text` if present.
 * Handles: ```json … ```, ```typescript … ```, ``` … ```.
 * Returns the inner content trimmed, or the original string if no fence.
 */
function stripMarkdownFence(text: string): string {
  const match = text.match(/^```(?:[a-z]*)?\s*([\s\S]*?)```\s*$/);
  return match ? (match[1]?.trim() ?? text) : text;
}

/**
 * Detect envelope-shaped JSON content and project it down to its `.reply`
 * field. Pass any other input through untouched.
 *
 * Contract:
 * - Plain prose, empty strings, JSON without a `reply` key, malformed JSON,
 *   and envelopes whose `reply` is not a non-empty string all return the
 *   ORIGINAL input verbatim. Surface raw content for triage; don't silently
 *   delete characters the user might still need to read.
 * - Markdown code fences wrapping a valid envelope are unwrapped before the
 *   pre-check so fenced envelopes don't slip through.
 * - Reply-string escape sequences (\n, \t, \\, \", \uXXXX) are decoded by
 *   JSON.parse itself — no separate normalizer needed.
 */
export function stripEnvelopeJson(rawContent: string): string {
  if (typeof rawContent !== 'string' || rawContent.length === 0) {
    return rawContent;
  }

  const trimmed = stripMarkdownFence(rawContent.trim());

  // Cheap pre-check — avoid JSON.parse work on plain prose.
  if (!trimmed.startsWith('{') || !trimmed.includes('"reply"')) {
    return stripEmbeddedEnvelopeTail(rawContent);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Malformed / truncated JSON — surface the raw string so the user can
    // still see whatever did stream through, and triage has the unmodified
    // wire content to inspect.
    return rawContent;
  }

  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof (parsed as { reply?: unknown }).reply === 'string' &&
    (parsed as { reply: string }).reply.length > 0 &&
    // CR-PR129-M7: Two-part strictness check:
    // 1. Every key must belong to the known envelope vocabulary — any
    //    unrecognised key means this is arbitrary JSON, not a leaked envelope.
    // 2. At least one structural sibling (`signals` or `ui_hints`) must be
    //    present alongside `reply`. A bare {"reply":"x"} object is ambiguous
    //    and is returned verbatim rather than silently rewritten.
    Object.keys(parsed as object).every((k) => KNOWN_ENVELOPE_KEYS.has(k)) &&
    Object.keys(parsed as object).some((k) => REQUIRED_ENVELOPE_SIBLINGS.has(k))
  ) {
    return stripEmbeddedEnvelopeTail((parsed as { reply: string }).reply);
  }

  return rawContent;
}
