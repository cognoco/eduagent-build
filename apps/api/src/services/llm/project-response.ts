// ---------------------------------------------------------------------------
// projectAiResponseContent — defense-in-depth read projector for
// sessionEvents.ai_response.content rows that may have been written before
// the [BUG-934] write-path fix in services/exchanges.ts:parseExchangeEnvelope.
//
// Why this lives in services/llm/ (not services/session/):
//   This helper is consumed by every read path that surfaces ai_response
//   content to a user, parent, or downstream LLM. Originally it lived inside
//   session/session-crud.ts, but a sweep ([BUG-934 follow-up]) found that
//   bookmarks, GDPR exports, learner-profile inference, homework-summary,
//   recap, vocab extraction, session-insights, buildExchangeHistory, and
//   buildContinueSessionContext all read raw `ai_response.content` and need
//   the same projection. Re-importing from session/session-crud.ts would
//   couple unrelated services to CRUD concerns, so the canonical home is
//   here, alongside parseEnvelope itself.
//
// Strategy on read:
//   1. Fence-strip: some fallback LLMs wrap JSON in markdown fences even
//      when instructed not to. Strip leading/trailing fences before the
//      pre-check so fence-wrapped envelopes are caught rather than leaked.
//   2. Cheap pre-check: only attempt parsing on JSON-shaped content with a
//      `reply` substring. Plain-prose rows pass through untouched and don't
//      trigger logger noise.
//   3. Try strict envelope parse first — when it succeeds, the reply has
//      already been normalized for literal-escape leaks (`\\n` → `\n`).
//      Pass `silent: true` so per-row warn noise is suppressed; loop callers
//      should emit one aggregate log if they need triage signal.
//   4. On schema failure, extract the JSON object and pull `reply` directly
//      via JSON.parse. This is the leak path: the envelope is structurally
//      valid JSON but fails Zod, so we still want to project `.reply`.
//      Apply normalizeReplyText here too so resumed messages match what the
//      live stream would have rendered.
//   5. If even raw extraction fails, return the original content. Never
//      silently drop characters the user already saw render correctly.
// ---------------------------------------------------------------------------

import {
  parseEnvelope,
  normalizeReplyText,
  stripEmbeddedEnvelopeTail,
} from './envelope';
import { extractFirstJsonObject } from './extract-json';

/**
 * Strip a leading/trailing markdown code fence from `text` if present.
 * Handles: ```json … ```, ```typescript … ```, ``` … ```.
 * Returns the inner content trimmed, or the original string if no fence.
 *
 * This is a targeted pre-processor for the projection path — it operates on
 * the full rawContent string (before the `startsWith('{')` check) so
 * fence-wrapped envelopes don't leak through the pre-check.
 */
export function stripMarkdownFence(text: string): string {
  const match = text.match(/^```(?:[a-z]*)?\s*([\s\S]*?)```\s*$/);
  return match ? (match[1]?.trim() ?? text) : text;
}

export function projectAiResponseContent(
  rawContent: string,
  options: { silent?: boolean } = {},
): string {
  // Step 1: strip markdown fence so fence-wrapped envelopes pass the pre-check.
  const trimmed = stripMarkdownFence(rawContent.trim());

  // Step 2: cheap pre-check — avoid JSON work on plain prose.
  if (!trimmed.startsWith('{') || !trimmed.includes('"reply"')) {
    return stripEmbeddedEnvelopeTail(rawContent);
  }

  // Step 3: strict envelope parse.
  const strict = parseEnvelope(trimmed, 'transcript.hydration', {
    silent: options.silent,
  });
  if (strict.ok) {
    return strict.envelope.reply;
  }

  // Step 4: schema-invalid but structurally valid JSON — extract reply directly.
  const jsonStr = extractFirstJsonObject(trimmed);
  if (!jsonStr) return rawContent;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return rawContent;
  }
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    typeof (parsed as { reply?: unknown }).reply === 'string' &&
    (parsed as { reply: string }).reply.length > 0
  ) {
    return stripEmbeddedEnvelopeTail(
      normalizeReplyText((parsed as { reply: string }).reply),
    );
  }
  return rawContent;
}
