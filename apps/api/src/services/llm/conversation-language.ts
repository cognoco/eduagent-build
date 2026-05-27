import {
  conversationLanguageSchema,
  type ConversationLanguage,
} from '@eduagent/schemas';

/**
 * Validate-and-narrow a Drizzle-loaded conversation_language value.
 *
 * Drizzle returns `profiles.conversationLanguage` as `string | null`. The DB
 * CHECK constraint and the Zod schema at the write boundary together keep
 * production rows inside the supported set, but unsound `as ConversationLanguage`
 * casts at every read site break the type contract: a stale row from before a
 * locale was added (or a backfill from another system) would surface as a
 * "valid" code with no runtime check, silently flow into prompts, and produce
 * undefined behavior in the model.
 *
 * Call this at every site that reads from the DB and forwards into the LLM
 * router. Unknown codes — including `null` and `undefined` — collapse to
 * `undefined`, which the router treats as "no language directive" (the DB
 * default `en` already covers post-migration rows; clients re-sync via
 * `useMentorLanguageSync` on next load).
 */
export function parseConversationLanguage(
  raw: string | null | undefined,
): ConversationLanguage | undefined {
  if (raw == null) return undefined;
  const parsed = conversationLanguageSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
