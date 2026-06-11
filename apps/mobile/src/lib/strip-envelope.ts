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
// JSON-shaped text with a `reply` field as part of prose: a confirmed
// envelope must carry `reply` PLUS at least one structural envelope sibling.
//
// Fail-open hardening (2026-06-11): the original heuristic ALSO required every top-level key to
// belong to a hardcoded allowlist mirroring `llmResponseEnvelopeSchema` —
// which failed OPEN: the moment the schema gained a new top-level field not
// mirrored here, every leaked envelope rendered its raw internals (including
// `private_sources`, documented as "never rendered to the learner") into the
// chat bubble. Two changes close that:
//   1. The sibling set is DERIVED from `llmResponseEnvelopeSchema.keyof()`
//      so it can never drift from the schema.
//   2. An unknown extra key no longer flips the guard open — when `reply` is
//      a non-empty string and a structural sibling is present, we project to
//      `.reply` (an unknown key is far more likely a future envelope field
//      than user prose). Arbitrary JSON without an envelope sibling still
//      passes through untouched.
// ---------------------------------------------------------------------------

import { llmResponseEnvelopeSchema } from '@eduagent/schemas';

/**
 * A confirmed envelope must contain `reply` PLUS at least one structural
 * sibling key from the envelope schema's own top-level vocabulary. A lone
 * `{"reply":"x"}` object is ambiguous — it could be arbitrary JSON — so it
 * is treated as prose. Derived from the schema so it can never drift.
 */
const REQUIRED_ENVELOPE_SIBLINGS: ReadonlySet<string> = new Set(
  llmResponseEnvelopeSchema.keyof().options.filter((key) => key !== 'reply'),
);

const EMBEDDED_ENVELOPE_TAIL_RE =
  /["\u201c\u201d]\s*,\s*["\u201c\u201d](?:signals|ui_hints|private_sources|confidence)["\u201c\u201d]\s*:/;
const EMBEDDED_ENVELOPE_CONFIRM_RE =
  /["\u201c\u201d](?:partial_progress|needs_deepening|understanding_check|ready_to_finish|retrieval_score|note_prompt|post_session|fluency_drill|confidence)["\u201c\u201d]\s*:/;

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
    // CR-PR129-M7 + fail-open hardening: at least one schema-derived structural
    // sibling must be present alongside `reply`. A bare {"reply":"x"} object
    // is ambiguous and is returned verbatim rather than silently rewritten.
    // Unknown extra keys do NOT disqualify the envelope — requiring every
    // key to be recognised made the guard fail open on schema drift.
    Object.keys(parsed as object).some((k) => REQUIRED_ENVELOPE_SIBLINGS.has(k))
  ) {
    return stripEmbeddedEnvelopeTail((parsed as { reply: string }).reply);
  }

  return rawContent;
}
