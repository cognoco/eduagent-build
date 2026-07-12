import { getLanguageByCode } from '../data/languages';
import { sanitizeXmlValue } from './llm/sanitize';
import type { ExchangeContext } from './exchange-types';

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

function formatLanguageSessionState(context: ExchangeContext): string {
  const state = context.languageSessionState;
  if (!state) {
    return [
      'Server-selected language activity:',
      '- Active strand: meaning_input',
      '- Activity type: graded_input',
      '- Modality: text',
      '- Session strand counts: not available yet.',
    ].join('\n');
  }

  const counts = state.sessionStrandCounts;
  const activity = state.nextActivity;
  const targetWords =
    activity.targetWords.length > 0
      ? activity.targetWords
          .map((word) => sanitizeXmlValue(word, 80))
          .join(', ')
      : 'none selected';
  const targetGrammar =
    activity.targetGrammar.length > 0
      ? activity.targetGrammar
          .map((pattern) => sanitizeXmlValue(pattern, 120))
          .join(', ')
      : 'none selected';
  const gradedInput = activity.gradedInput;
  const gradedInputLines = gradedInput
    ? [
        'Graded input artifact:',
        `- Modality: ${gradedInput.modality}`,
        `- CEFR level: ${gradedInput.cefrLevel}`,
        `- Known-word target: ${Math.round(
          gradedInput.knownWordRatioTarget * 100,
        )}%`,
        `- Known-word estimate: ${Math.round(
          gradedInput.knownWordEstimate * 100,
        )}%`,
        `- Passage: ${sanitizeXmlValue(gradedInput.text, 700)}`,
        `- Comprehension question: ${sanitizeXmlValue(
          gradedInput.comprehensionQuestions[0]?.prompt ??
            'What is the main thing happening in this passage?',
          240,
        )}`,
        `- Answer hint: ${sanitizeXmlValue(
          gradedInput.comprehensionQuestions[0]?.answerHint ?? '',
          300,
        )}`,
        `- Audio enabled: ${gradedInput.audioEnabled ? 'yes' : 'no'}`,
        '- Use this exact passage as the input seed. You may lightly smooth grammar, but do not add unrelated vocabulary.',
      ]
    : [];
  const meaningOutput = activity.meaningOutput;
  const meaningOutputLines = meaningOutput
    ? [
        'Meaning-output task:',
        `- Task type: ${meaningOutput.taskType}`,
        `- Communicative goal: ${sanitizeXmlValue(
          meaningOutput.communicativeGoal,
          200,
        )}`,
        `- Task prompt given to the learner: ${sanitizeXmlValue(
          meaningOutput.prompt,
          300,
        )}`,
        `- Expected response mode: ${meaningOutput.responseMode}`,
        "- Judge the learner's reply against this specific task. If it is incomplete, off-task, or malformed, give the corrected/model form, briefly explain why, and ask for a retry on the same task before moving on.",
      ]
    : [];
  // WI-1777: repeat-after-me/shadowing. Deterministic client-side
  // transcript-comparison feedback is computed server-side and shown to the
  // learner by the mobile app — the LLM never grades this turn.
  const speakingPractice = activity.speakingPractice;
  const speakingPracticeLines = speakingPractice
    ? [
        'Speaking practice artifact:',
        `- Mode: ${speakingPractice.type}`,
        `- Target sentence (already shown to the learner, do not invent a new one): ${sanitizeXmlValue(
          speakingPractice.targetText,
          200,
        )}`,
        `- Locale: ${speakingPractice.locale}`,
        '- The learner will repeat this sentence aloud. Transcript-comparison feedback is computed server-side and shown to the learner by the mobile app — you do not need to grade it. Encourage a retry on the same target if they ask for help.',
      ]
    : [];
  const previousMeaningOutputTask = state.previousMeaningOutputTask;
  const previousMeaningOutputLines = previousMeaningOutputTask
    ? [
        'Previous meaning-output task (the learner is answering it now):',
        `- Task type: ${previousMeaningOutputTask.taskType}`,
        `- Task prompt given to the learner: ${sanitizeXmlValue(
          previousMeaningOutputTask.prompt,
          300,
        )}`,
        `- Expected response mode: ${previousMeaningOutputTask.responseMode}`,
        "- The learner's last message is their attempt at this task. Judge it against this specific task. If it is incomplete, off-task, or malformed, give the corrected/model form, briefly explain why, and ask for a retry on the same task before moving on.",
      ]
    : [];
  const previousComprehension = state.previousComprehension;
  const previousComprehensionLines = previousComprehension
    ? [
        'Previous graded-input answer:',
        `- Question: ${sanitizeXmlValue(previousComprehension.prompt, 240)}`,
        `- Learner answer: ${sanitizeXmlValue(
          previousComprehension.learnerAnswer,
          240,
        )}`,
        `- Verdict: ${previousComprehension.verdict}`,
        `- Expected terms still missing: ${
          previousComprehension.missingTerms.length > 0
            ? previousComprehension.missingTerms
                .map((term) => sanitizeXmlValue(term, 80))
                .join(', ')
            : 'none'
        }`,
        '- If the verdict is partial or missed, briefly repair the meaning before continuing.',
      ]
    : [];

  return [
    'Server-selected language activity:',
    `- Active strand: ${state.activeStrand}`,
    `- Activity type: ${activity.activityType}`,
    `- Modality: ${activity.modality}`,
    `- Target words/chunks: ${targetWords}`,
    `- Target grammar/patterns: ${targetGrammar}`,
    `- Session strand counts: meaning_input=${counts.meaning_input}, meaning_output=${counts.meaning_output}, language_focus=${counts.language_focus}, fluency=${counts.fluency}.`,
    '- Follow this activity brief for the current turn. Do not switch strands unless the learner asks for something urgent or safety-related.',
    ...gradedInputLines,
    ...meaningOutputLines,
    ...speakingPracticeLines,
    ...previousMeaningOutputLines,
    ...previousComprehensionLines,
  ].join('\n');
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
    120,
  );
  const safeNativeLanguage = context.nativeLanguage
    ? sanitizeXmlValue(context.nativeLanguage, 80)
    : '';

  return [
    `Role: You are a direct language teacher for ${safeTargetLanguageName}. Do not use the default Socratic ladder for this session.`,
    [
      'Language pedagogy: Nation Four Strands.',
      '- The backend, not the LLM, selects the active strand for each turn.',
      '- Balance meaning-focused input, meaning-focused output, language-focused learning, and fluency development over the session.',
      '- Teach directly. Correct errors clearly and immediately.',
      `- Explain grammar using the learner's native language when helpful${
        safeNativeLanguage
          ? ` (native language: <native_language>${safeNativeLanguage}</native_language>)`
          : ''
      }.`,
      '- Keep examples in the target language, but make explanations comprehensible.',
      '- Prefer short, high-frequency chunks and collocations, not only isolated words.',
    ].join('\n'),
    formatLanguageSessionState(context),
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
