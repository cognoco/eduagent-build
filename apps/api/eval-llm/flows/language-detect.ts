import { z } from 'zod';

import { buildLanguageDetectionMessages } from '../../src/services/language-detect';
import { routeAndCall, extractFirstJsonObject } from '../../src/services/llm';
import type { EvalProfile } from '../fixtures/profiles';
import { bootstrapLlmProviders } from '../runner/llm-bootstrap';
import type { FlowDefinition, PromptMessages, Scenario } from '../runner/types';

// ---------------------------------------------------------------------------
// Language-detection live-eval flow (WI-1755 launch guard).
//
// Closes the eval-coverage gap behind the launch-blocking guardrail: freeform
// subject-creation text that merely MENTIONS a supported language name (a
// history, politics, or culture topic) must not be classified as
// language-LEARNING intent, while genuine target-language practice requests
// still route into four_strands. The deterministic unit tests
// (language-detect.test.ts) mock the LLM and prove the fallback/parsing
// logic; this flow exercises the EXACT production prompt
// (buildLanguageDetectionMessages) against the real model so future prompt
// drift that flips a classification is caught here instead of at launch.
// ---------------------------------------------------------------------------

interface LanguageDetectInput {
  rawInput: string;
  expectedIsLanguageLearning: boolean;
}

const languageDetectEvalResponseSchema = z.object({
  isLanguageLearning: z.boolean(),
  languageCode: z.string().nullable(),
});

const FIXTURES: Array<{ scenarioId: string; input: LanguageDetectInput }> = [
  // --- Genuine target-language practice — must NOT be over-blocked --------
  {
    scenarioId: 'spanish-target-language-practice',
    input: {
      rawInput: 'I want to practice Spanish conversation',
      expectedIsLanguageLearning: true,
    },
  },
  // --- Ambiguous topics that mention a language name but aren't learning --
  {
    // AC regression example: French history must not enter four_strands.
    scenarioId: 'french-history-ambiguous',
    input: {
      rawInput: 'French Revolution',
      expectedIsLanguageLearning: false,
    },
  },
  {
    // AC regression example: Spanish politics must not enter four_strands.
    scenarioId: 'spanish-politics-ambiguous',
    input: {
      rawInput: 'Spanish politics',
      expectedIsLanguageLearning: false,
    },
  },
];

export const languageDetectFlow: FlowDefinition<LanguageDetectInput> = {
  id: 'language-detect',
  name: 'Language-learning intent detection (subject creation)',
  sourceFile: 'apps/api/src/services/language-detect.ts:detectLanguageSubject',

  buildPromptInput(_profile: EvalProfile): LanguageDetectInput | null {
    return null;
  },

  enumerateScenarios(
    profile: EvalProfile,
  ): Array<Scenario<LanguageDetectInput>> | null {
    // Run once, under a single profile, like subject-classify / topic-intent-matcher.
    if (profile.id !== '11yo-czech-animals') return null;
    return FIXTURES;
  },

  buildPrompt(input: LanguageDetectInput): PromptMessages {
    const [system, user] = buildLanguageDetectionMessages(input.rawInput);
    return {
      system: typeof system?.content === 'string' ? system.content : '',
      user: typeof user?.content === 'string' ? user.content : '',
      notes: [
        `Expected isLanguageLearning: ${input.expectedIsLanguageLearning}`,
      ],
    };
  },

  expectedResponseSchema: languageDetectEvalResponseSchema,

  async runLive(
    input: LanguageDetectInput,
    messages: PromptMessages,
  ): Promise<string> {
    bootstrapLlmProviders();
    const result = await routeAndCall(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      1, // Rung 1 = Gemini Flash (fast/cheap) — matches detectLanguageSubject
      { flow: 'language-detect', llmTier: 'flash' },
    );

    const jsonStr = extractFirstJsonObject(result.response);
    const parsed = languageDetectEvalResponseSchema.safeParse(
      JSON.parse(jsonStr ?? '{}'),
    );
    if (!parsed.success) {
      throw new Error('language-detect response failed schema validation');
    }

    if (parsed.data.isLanguageLearning !== input.expectedIsLanguageLearning) {
      throw new Error(
        `Expected isLanguageLearning=${input.expectedIsLanguageLearning} but got ${parsed.data.isLanguageLearning} for "${input.rawInput}"`,
      );
    }

    return result.response;
  },
};
