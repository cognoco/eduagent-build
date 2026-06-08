import type { ConversationLanguage } from '@eduagent/schemas';
import { parseEnvelope } from '../envelope';

// ---------------------------------------------------------------------------
// Model-refusal → safe-envelope normalization.
//
// Most providers honor our structured-envelope contract, but ~1% of the time
// a model (observed on gpt-oss via Cerebras) returns its OWN native refusal
// shape instead of our envelope — either OpenAI's structured refusal
// (`{"type":"refusal", ...}`) or a bare top-level `refusal` string with no
// `reply`. Those strings fail `parseEnvelope` (no `reply` field), so without
// this normalization the learner would hit the generic parse-failure fallback
// — a worse experience than a polite, localized decline that redirects back
// to the topic.
//
// `normalizeModelRefusal` is a PURE helper: given the raw model content and
// the learner's tutor-prose language, it returns either
//   - `null`  — the content is already a valid envelope OR is not a recognized
//               refusal shape (leave it for the normal downstream path); or
//   - a valid `llmResponseEnvelopeSchema` JSON string whose `reply` is a
//     localized polite decline + redirect and `signals.crisis_redirect: false`.
//
// It NEVER fabricates a decline for arbitrary non-envelope garbage — only for
// the two recognized refusal shapes — so genuine parse failures still surface
// to the existing fallback for triage rather than being masked by a decline.
// ---------------------------------------------------------------------------

// One-line polite decline + "let's get back to your topic", per conversation
// language. Keys are the 10 `conversationLanguageSchema` codes; English is the
// fallback for any unmapped code. Kept deliberately generic (no topic name) so
// the same string is safe for every refusal context.
const DECLINE_BY_LANGUAGE: Record<ConversationLanguage, string> = {
  en: "I can't help with that one — let's get back to what you're learning. What would you like to work on?",
  cs: 'S tímhle ti bohužel nepomůžu — vraťme se k tomu, co se učíš. Na čem chceš pracovat?',
  es: 'Con eso no puedo ayudarte — volvamos a lo que estás aprendiendo. ¿En qué te gustaría trabajar?',
  fr: "Je ne peux pas t'aider là-dessus — revenons à ce que tu apprends. Sur quoi veux-tu travailler ?",
  de: 'Dabei kann ich leider nicht helfen — lass uns zu deinem Lernthema zurückkehren. Woran möchtest du arbeiten?',
  it: 'Su questo non posso aiutarti — torniamo a ciò che stai imparando. Su cosa vuoi lavorare?',
  pt: 'Nisso não posso ajudar — vamos voltar ao que estás a aprender. No que gostarias de trabalhar?',
  pl: 'Z tym nie mogę pomóc — wróćmy do tego, czego się uczysz. Nad czym chcesz popracować?',
  ja: 'それについてはお手伝いできません。学んでいる内容に戻りましょう。何に取り組みたいですか？',
  nb: 'Det kan jeg dessverre ikke hjelpe med — la oss gå tilbake til det du lærer. Hva vil du jobbe med?',
};

/** True when `rawContent` is one of the two recognized bare-refusal shapes. */
function isBareRefusal(rawContent: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent.trim());
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const obj = parsed as Record<string, unknown>;
  // An object carrying a usable reply is not a bare refusal — leave it.
  if (typeof obj.reply === 'string' && obj.reply.trim().length > 0) {
    return false;
  }
  // OpenAI structured refusal: {"type":"refusal", ...}
  if (obj.type === 'refusal') return true;
  // Bare top-level refusal string with no reply: {"refusal":"..."}
  if (typeof obj.refusal === 'string') return true;
  return false;
}

export function normalizeModelRefusal(
  rawContent: string,
  language: ConversationLanguage,
): string | null {
  // Already a valid envelope → no rewrite. `silent` because a non-envelope
  // here is the expected case we handle below, not a triage-worthy failure.
  if (parseEnvelope(rawContent, 'unknown', { silent: true }).ok) {
    return null;
  }

  if (!isBareRefusal(rawContent)) return null;

  const decline = DECLINE_BY_LANGUAGE[language] ?? DECLINE_BY_LANGUAGE.en;
  return JSON.stringify({
    reply: decline,
    signals: { crisis_redirect: false },
  });
}
