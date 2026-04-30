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
// ---------------------------------------------------------------------------

/**
 * Strip a leading/trailing markdown code fence from `text` if present.
 * Handles: ```json … ```, ```typescript … ```, ``` … ```.
 * Returns the inner content trimmed, or the original string if no fence.
 */
function stripMarkdownFence(text: string): string {
  const match = text.match(/^```(?:[a-z]*)?\s*([\s\S]*?)```\s*$/);
  return match ? match[1]?.trim() ?? text : text;
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
    return rawContent;
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
    (parsed as { reply: string }).reply.length > 0
  ) {
    return (parsed as { reply: string }).reply;
  }

  return rawContent;
}
