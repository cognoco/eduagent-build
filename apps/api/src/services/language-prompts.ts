import { getLanguageByCode } from '../data/languages';
import { sanitizeXmlValue } from './llm/sanitize';
import type { ExchangeContext } from './exchanges';

function formatKnownVocabulary(knownVocabulary: string[] | undefined): string {
  if (!knownVocabulary || knownVocabulary.length === 0) {
    // BUG-937: previous wording ("not available yet … introduce gently") let the
    // model assume the learner already knew universal greetings like "ciao" /
    // "grazie". Empty vocabulary now reads as a hard zero-knowledge signal so
    // the opening exchange teaches every word from scratch.
    return (
      'Known vocabulary: NONE — treat the learner as a complete beginner with ' +
      'zero target-language vocabulary. Do NOT assume they already know any ' +
      'words, including greetings ("hello", "thank you"), numbers, or other ' +
      'basics. Introduce and translate each new word the first time you use it.'
    );
  }

  // [PROMPT-INJECT-6] Vocabulary entries are stored LLM output. Sanitize each
  // before joining so a crafted word cannot inject newlines/directives into
  // the prompt.
  const safe = knownVocabulary
    .slice(0, 60)
    .map((v) => sanitizeXmlValue(v, 80))
    .filter((v) => v.length > 0)
    .join(', ');
  return `Known vocabulary examples: ${safe}. Prefer these when creating input passages and drills.`;
}

export function buildFourStrandsPrompt(context: ExchangeContext): string[] {
  const language =
    context.languageCode != null
      ? getLanguageByCode(context.languageCode)
      : null;
  // [PROMPT-INJECT-6] targetLanguageName falls back to subjectName (learner-
  // owned) when the language registry has no hit. Sanitize so a crafted
  // subject name cannot inject directives into this section.
  const safeTargetLanguageName = sanitizeXmlValue(
    language?.names[0] ?? context.subjectName,
    120
  );
  const safeNativeLanguage = context.nativeLanguage
    ? sanitizeXmlValue(context.nativeLanguage, 80)
    : '';

  return [
    `Role: You are a direct language teacher for ${safeTargetLanguageName}. Do not use the default Socratic ladder for this session.`,
    [
      'Language pedagogy: Nation Four Strands.',
      '- Balance meaning-focused input, meaning-focused output, language-focused learning, and fluency development.',
      '- Teach directly. Correct errors clearly and immediately.',
      `- Explain grammar using the learner's native language when helpful${
        safeNativeLanguage
          ? ` (native language: <native_language>${safeNativeLanguage}</native_language>)`
          : ''
      }.`,
      '- Keep examples in the target language, but make explanations comprehensible.',
      '- Prefer short, high-frequency chunks and collocations, not only isolated words.',
    ].join('\n'),
    [
      'Direct correction rules:',
      '- If the learner says or writes something incorrect, show the corrected form.',
      '- Briefly explain why it changes.',
      '- Ask for a quick retry after correcting.',
      '- Do not frame corrections as "Not yet" or use Socratic withholding.',
    ].join('\n'),
    [
      'Vocabulary tracking:',
      '- When introducing a useful new word or chunk, make it explicit.',
      '- Recycle previously learned vocabulary before adding more.',
      '- Prefer 95-98% known language for reading/listening input.',
      `- ${formatKnownVocabulary(context.knownVocabulary)}`,
    ].join('\n'),
    [
      'Voice and fluency:',
      '- Speaking practice is encouraged whenever appropriate.',
      '- Use short timed prompts for fluency drills.',
      '- Keep the pace brisk in fluency work and slower in grammar explanations.',
      language
        ? `- Target STT/TTS locale: ${language.sttLocale}.`
        : '- Use the target language locale when speaking/listening features are available.',
      '- When you start a fluency drill, set `ui_hints.fluency_drill.active` to true and `duration_s` to 30–90 in the envelope (see response format). Score the drill via `ui_hints.fluency_drill.score` when evaluating — do NOT embed JSON in the reply text.',
    ].join('\n'),
  ];
}
