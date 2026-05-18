import { buildFourStrandsPrompt } from '../../src/services/language-prompts';
import type { ExchangeContext } from '../../src/services/exchanges';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';

// ---------------------------------------------------------------------------
// Flow adapter — Language-learning Four-Strands prompt addendum.
//
// [BUG-125] Adds snapshot coverage for `buildFourStrandsPrompt` so the
// pre-commit hook can catch unintended drift in the four-strands pedagogy
// guidance (direct correction rules, vocabulary tracking, fluency drill
// hint contract). Without these snapshots a copy/grammar tweak to any of
// the four sections shipped without review evidence.
//
// The builder returns string[] — one section per array entry. We join them
// with blank lines so the snapshot reads naturally and a per-section diff
// in PR review still highlights the changed paragraph.
// ---------------------------------------------------------------------------

interface LanguagePromptsInput {
  context: ExchangeContext;
  /** Short note describing the profile slice this snapshot exercises. */
  scenarioNote: string;
}

function buildContextForProfile(profile: EvalProfile): ExchangeContext {
  // Only the fields buildFourStrandsPrompt reads need to be populated;
  // everything else is harmless. nativeLanguage, languageCode, subjectName,
  // and knownVocabulary are the four inputs that drive the prompt body.
  const targetLanguageName =
    profile.targetLanguage === 'es'
      ? 'Spanish'
      : profile.targetLanguage === 'fr'
        ? 'French'
        : profile.targetLanguage === 'de'
          ? 'German'
          : 'Italian';
  return {
    sessionId: `eval-${profile.id}`,
    profileId: `eval-${profile.id}`,
    subjectName: targetLanguageName,
    sessionType: 'learning',
    escalationRung: 2,
    exchangeHistory: [],
    birthYear: profile.birthYear,
    nativeLanguage: profile.nativeLanguage,
    languageCode: profile.targetLanguage ?? null,
    knownVocabulary: profile.recentQuizAnswers.vocabulary,
  } as ExchangeContext;
}

export const languagePromptsFlow: FlowDefinition<LanguagePromptsInput> = {
  id: 'language-prompts',
  name: 'Language — Four Strands addendum',
  sourceFile:
    'apps/api/src/services/language-prompts.ts:buildFourStrandsPrompt',

  buildPromptInput(profile: EvalProfile): LanguagePromptsInput {
    return {
      context: buildContextForProfile(profile),
      scenarioNote: profile.targetLanguage
        ? `Profile is studying ${profile.targetLanguage}; CEFR ${
            profile.cefrLevel ?? '(unset)'
          }; ${profile.recentQuizAnswers.vocabulary.length} known vocab items.`
        : 'Profile has no targetLanguage set — snapshot exercises the no-language-registry-hit fallback path.',
    };
  },

  buildPrompt(input: LanguagePromptsInput): PromptMessages {
    const sections = buildFourStrandsPrompt(input.context);
    const system = sections.join('\n\n');
    return {
      system,
      user: 'Begin the next exchange following the four-strands rules above.',
      notes: [
        input.scenarioNote,
        'Receives: languageCode, nativeLanguage, knownVocabulary, subjectName.',
        'Returns string[] of 4 sections (role, pedagogy, correction rules, vocab/voice).',
        'Empty knownVocabulary triggers the "complete beginner" branch (BUG-937).',
        'Falls back to subjectName when languageCode misses the registry.',
      ],
    };
  },

  async runLive(
    _input: LanguagePromptsInput,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        {
          role: 'user',
          content: messages.user ?? 'Begin the next exchange.',
        },
      ],
      { flow: 'language-prompts', rung: 2 },
    );
  },
};
