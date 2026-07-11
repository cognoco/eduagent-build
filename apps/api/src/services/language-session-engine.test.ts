import {
  buildLanguageActivityTelemetry,
  buildLanguageSessionState,
  chooseNextLanguageStrand,
  evaluatePendingGradedInputAnswer,
  getLanguageStrandCounts,
  isLikelyLanguageLearningIntent,
} from './language-session-engine';
import {
  registerLlmProviderFixture,
  llmStructuredJson,
} from '../test-utils/llm-provider-fixtures';

describe('isLikelyLanguageLearningIntent', () => {
  it.each([
    'What happened in French history?',
    'What is the boiling point in Celsius?',
    'Tell me about Spanish politics.',
    'German cars vs Japanese cars',
  ])(
    'does not activate language mode for non-practice prompt: %s',
    (message) => {
      expect(isLikelyLanguageLearningIntent(message)).toBe(false);
    },
  );

  it.each([
    'How do I say good morning in French?',
    'Translate I would like coffee into Spanish',
    'Help me practice speaking German',
    'Teach me beginner Italian',
  ])('activates language mode for real language practice: %s', (message) => {
    expect(isLikelyLanguageLearningIntent(message)).toBe(true);
  });
});

describe('chooseNextLanguageStrand', () => {
  it('starts a language session with meaning-focused input', () => {
    expect(
      chooseNextLanguageStrand({ exchangeCount: 0, priorCounts: {} }),
    ).toBe('meaning_input');
  });

  it('rotates toward the least-used strand using the four-strands loop order', () => {
    expect(
      chooseNextLanguageStrand({
        exchangeCount: 4,
        priorCounts: {
          meaning_input: 2,
          meaning_output: 1,
          language_focus: 1,
          fluency: 1,
        },
      }),
    ).toBe('meaning_output');
  });

  it('chooses fluency after the other three strands have led the session', () => {
    expect(
      chooseNextLanguageStrand({
        exchangeCount: 3,
        priorCounts: {
          meaning_input: 1,
          meaning_output: 1,
          language_focus: 1,
          fluency: 0,
        },
      }),
    ).toBe('fluency');
  });
});

describe('getLanguageStrandCounts', () => {
  it('counts only persisted language-learning strand metadata', () => {
    const counts = getLanguageStrandCounts([
      {
        eventType: 'ai_response',
        metadata: {
          languageLearning: { strand: 'meaning_input' },
        },
      },
      {
        eventType: 'ai_response',
        metadata: {
          languageLearning: { strand: 'fluency' },
        },
      },
      {
        eventType: 'ai_response',
        metadata: {
          languageLearning: { strand: 'fluency' },
        },
      },
      {
        eventType: 'user_message',
        metadata: {
          languageLearning: { strand: 'language_focus' },
        },
      },
      {
        eventType: 'ai_response',
        metadata: { languageLearning: { strand: 'culture_chat' } },
      },
    ]);

    expect(counts).toEqual({
      meaning_input: 1,
      meaning_output: 0,
      language_focus: 0,
      fluency: 2,
    });
  });
});

describe('buildLanguageActivityTelemetry', () => {
  it('maps fluency strands to timed drill telemetry', async () => {
    expect(
      await buildLanguageActivityTelemetry({
        strand: 'fluency',
        inputMode: 'voice',
        targetWords: ['cafe'],
        targetGrammar: ['je voudrais + noun'],
      }),
    ).toEqual({
      strand: 'fluency',
      activityType: 'timed_drill',
      modality: 'voice',
      targetWords: ['cafe'],
      targetGrammar: ['je voudrais + noun'],
    });
  });

  it('falls back to the deterministic passage when LLM generation fails', async () => {
    // No birthYear given, so ageBracket fails closed to 'child'; the router's
    // under-18 gate routes to `approvedTextFallbackConfig`, which prefers
    // 'cerebras' first. Register the fixture under that id so this test
    // actually exercises a registered provider's chat error, not a
    // "no provider registered" throw that would produce the same fallback
    // result via a different, untested mechanism.
    const fixture = registerLlmProviderFixture({
      id: 'cerebras',
      chatError: new Error('llm unavailable'),
    });
    try {
      const telemetry = await buildLanguageActivityTelemetry({
        strand: 'meaning_input',
        inputMode: 'voice',
        languageCode: 'fr',
        cefrLevel: 'A1',
        knownWords: ['bonjour', 'merci', 'cafe', 'eau'],
        targetWords: ['pain'],
      });

      expect(telemetry.gradedInput).toEqual({
        type: 'graded_input',
        modality: 'listening',
        cefrLevel: 'A1',
        knownWordRatioTarget: 0.96,
        knownWordEstimate: 0.8,
        targetWords: ['pain'],
        text: expect.stringContaining('bonjour'),
        comprehensionQuestions: [
          {
            id: 'gist-1',
            prompt: 'What is the main thing happening in this passage?',
            answerHint: expect.stringContaining('bonjour'),
          },
        ],
        audioEnabled: true,
      });
    } finally {
      fixture.dispose();
    }
  });

  it('uses LLM-generated passage content for a complete beginner with no known vocabulary', async () => {
    const fixture = registerLlmProviderFixture({
      chatResponse: llmStructuredJson({
        text: 'Hola. Me llamo Ana.',
        comprehensionQuestions: [
          { prompt: 'Como se llama ella?', answerHint: 'Se llama Ana.' },
        ],
      }),
    });
    try {
      const telemetry = await buildLanguageActivityTelemetry({
        strand: 'meaning_input',
        inputMode: 'text',
        languageCode: 'es',
        cefrLevel: 'A1',
        knownWords: [],
        targetWords: ['hola'],
        // Adult birth year so the fail-closed age gate doesn't route this
        // call away from the registered fixture provider (an unknown/absent
        // birth year fails closed to 'child', which the router's under-18
        // Gemini exclusion sends down a different, unregistered path).
        birthYear: 1990,
      });

      expect(telemetry.gradedInput).toMatchObject({
        type: 'graded_input',
        modality: 'reading',
        cefrLevel: 'A1',
        knownWordEstimate: 0,
        text: 'Hola. Me llamo Ana.',
        comprehensionQuestions: [
          {
            id: 'gist-1',
            prompt: 'Como se llama ella?',
            answerHint: 'Se llama Ana.',
          },
        ],
        audioEnabled: false,
      });
    } finally {
      fixture.dispose();
    }
  });

  it('uses LLM-generated passage content for a learner with known and target vocabulary', async () => {
    const fixture = registerLlmProviderFixture({
      chatResponse: llmStructuredJson({
        text: 'Ana bebe agua y come pan.',
        comprehensionQuestions: [
          { prompt: 'Que bebe Ana?', answerHint: 'Ana bebe agua.' },
        ],
      }),
    });
    try {
      const telemetry = await buildLanguageActivityTelemetry({
        strand: 'meaning_input',
        inputMode: 'text',
        languageCode: 'es',
        cefrLevel: 'A2',
        knownWords: ['agua', 'pan'],
        targetWords: ['bebe'],
        birthYear: 1990,
      });

      expect(telemetry.gradedInput).toMatchObject({
        type: 'graded_input',
        modality: 'reading',
        cefrLevel: 'A2',
        knownWordEstimate: 0.67,
        targetWords: ['bebe'],
        text: 'Ana bebe agua y come pan.',
        comprehensionQuestions: [
          {
            id: 'gist-1',
            prompt: 'Que bebe Ana?',
            answerHint: 'Ana bebe agua.',
          },
        ],
      });
    } finally {
      fixture.dispose();
    }
  });

  it('uses LLM-generated passage content for a minor via the approved under-18 provider path', async () => {
    // No birthYear given, so ageBracket fails closed to 'child' — MentoMate's
    // primary population. The router's under-18 gate routes this away from
    // Gemini to `approvedTextFallbackConfig`, which prefers 'cerebras' first;
    // register the success fixture under that id so this test proves the LLM
    // path actually works end-to-end for a minor, not just an adult.
    const fixture = registerLlmProviderFixture({
      id: 'cerebras',
      chatResponse: llmStructuredJson({
        text: 'Ich trinke Wasser.',
        comprehensionQuestions: [
          {
            prompt: 'Was trinkt die Person?',
            answerHint: 'Sie trinkt Wasser.',
          },
        ],
      }),
    });
    try {
      const telemetry = await buildLanguageActivityTelemetry({
        strand: 'meaning_input',
        inputMode: 'text',
        languageCode: 'de',
        cefrLevel: 'A1',
        knownWords: ['ich'],
        targetWords: ['trinke', 'wasser'],
      });

      expect(telemetry.gradedInput).toMatchObject({
        type: 'graded_input',
        modality: 'reading',
        cefrLevel: 'A1',
        text: 'Ich trinke Wasser.',
        comprehensionQuestions: [
          {
            id: 'gist-1',
            prompt: 'Was trinkt die Person?',
            answerHint: 'Sie trinkt Wasser.',
          },
        ],
      });
    } finally {
      fixture.dispose();
    }
  });

  it('does not attach graded input artifacts to non-input strands', async () => {
    const telemetry = await buildLanguageActivityTelemetry({
      strand: 'meaning_output',
      targetWords: ['pain'],
      knownWords: ['bonjour'],
    });

    expect(telemetry.gradedInput).toBeUndefined();
  });

  it('attaches structured meaning-output metadata to output turns', async () => {
    const telemetry = await buildLanguageActivityTelemetry({
      strand: 'meaning_output',
      inputMode: 'voice',
      targetWords: ['cafe', 'sugar'],
      targetGrammar: ['I would like + noun'],
    });

    expect(telemetry).toMatchObject({
      strand: 'meaning_output',
      activityType: 'free_response',
      modality: 'voice',
      targetWords: ['cafe', 'sugar'],
      targetGrammar: ['I would like + noun'],
      meaningOutput: {
        type: 'meaning_output',
        taskType: 'role_play',
        communicativeGoal: expect.stringContaining('conversation'),
        prompt: expect.stringContaining('cafe'),
        responseMode: 'dialogue_turn',
        targetWords: ['cafe', 'sugar'],
        targetGrammar: ['I would like + noun'],
        retryExpectation: 'retry_after_feedback',
        correctionExpectation: 'meaning_first_then_form',
      },
    });
    expect(telemetry.gradedInput).toBeUndefined();
  });

  it.each([
    [0, 'role_play', 'dialogue_turn'],
    [1, 'personal_answer', 'short_answer'],
    [2, 'retell', 'short_retell'],
    [3, 'describe', 'short_description'],
    [4, 'ask_question', 'question'],
  ] as const)(
    'selects meaning-output task %s as %s',
    async (meaningOutputTurnIndex, taskType, responseMode) => {
      const telemetry = await buildLanguageActivityTelemetry({
        strand: 'meaning_output',
        meaningOutputTurnIndex,
      });

      expect(telemetry.meaningOutput).toMatchObject({
        taskType,
        responseMode,
      });
    },
  );
});

describe('evaluatePendingGradedInputAnswer', () => {
  const priorInputEvent = {
    eventType: 'ai_response',
    metadata: {
      languageLearning: {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: ['agua'],
        targetGrammar: [],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A1',
          knownWordRatioTarget: 0.96,
          knownWordEstimate: 0.67,
          targetWords: ['agua'],
          text: 'Ana quiere agua.',
          comprehensionQuestions: [
            {
              id: 'gist-1',
              prompt: 'What does Ana want?',
              answerHint: 'Ana wants water',
            },
          ],
          audioEnabled: false,
        },
      },
    },
  };

  it('marks an answer understood when it overlaps the previous graded-input hint', () => {
    expect(
      evaluatePendingGradedInputAnswer({
        events: [priorInputEvent],
        learnerMessage: 'She wants water.',
      }),
    ).toMatchObject({
      questionId: 'gist-1',
      verdict: 'understood',
      matchedTerms: expect.arrayContaining(['wants', 'water']),
    });
  });

  it('marks an answer missed when it does not overlap the previous graded-input hint', () => {
    expect(
      evaluatePendingGradedInputAnswer({
        events: [priorInputEvent],
        learnerMessage: 'She is going home.',
      }),
    ).toMatchObject({
      questionId: 'gist-1',
      verdict: 'missed',
      matchedTerms: [],
    });
  });
});

describe('buildLanguageSessionState', () => {
  it('threads graded input context through the server-selected next activity', async () => {
    // Same fail-closed-to-'child' + 'cerebras'-first-fallback reasoning as
    // the buildLanguageActivityTelemetry fallback test above.
    const fixture = registerLlmProviderFixture({
      id: 'cerebras',
      chatError: new Error('llm unavailable'),
    });
    let state;
    try {
      state = await buildLanguageSessionState({
        exchangeCount: 0,
        events: [],
        inputMode: 'text',
        languageCode: 'es',
        cefrLevel: 'A1',
        knownWords: ['hola', 'gracias'],
        targetWords: ['agua'],
      });
    } finally {
      fixture.dispose();
    }

    expect(state.activeStrand).toBe('meaning_input');
    expect(state.nextActivity.gradedInput).toMatchObject({
      type: 'graded_input',
      modality: 'reading',
      cefrLevel: 'A1',
      targetWords: ['agua'],
    });
    expect(state.nextActivity.gradedInput?.text).toContain('hola');
    expect(state.nextActivity.gradedInput?.text).toContain('agua');
  });

  it('threads meaning-output context through the strand-selected next activity without graded input', async () => {
    const state = await buildLanguageSessionState({
      exchangeCount: 1,
      events: [
        {
          eventType: 'ai_response',
          metadata: {
            languageLearning: {
              strand: 'meaning_input',
              activityType: 'graded_input',
              modality: 'text',
              targetWords: ['agua'],
              targetGrammar: [],
              gradedInput: {
                type: 'graded_input',
                modality: 'reading',
                cefrLevel: 'A1',
                knownWordRatioTarget: 0.96,
                knownWordEstimate: 0.67,
                targetWords: ['agua'],
                text: 'Ana quiere agua.',
                comprehensionQuestions: [
                  {
                    id: 'gist-1',
                    prompt: 'What does Ana want?',
                    answerHint: 'Ana wants water',
                  },
                ],
                audioEnabled: false,
              },
            },
          },
        },
      ],
      inputMode: 'text',
      languageCode: 'es',
      cefrLevel: 'A1',
      knownWords: ['hola', 'gracias'],
      targetWords: ['agua'],
      targetGrammar: ['querer + noun'],
    });

    expect(state.activeStrand).toBe('meaning_output');
    expect(state.nextActivity.gradedInput).toBeUndefined();
    expect(state.nextActivity.meaningOutput).toMatchObject({
      taskType: 'role_play',
      responseMode: 'dialogue_turn',
      targetWords: ['agua'],
      targetGrammar: ['querer + noun'],
    });
  });

  it('routes a missed graded-input answer into language-focused repair', async () => {
    const state = await buildLanguageSessionState({
      exchangeCount: 1,
      events: [
        {
          eventType: 'ai_response',
          metadata: {
            languageLearning: {
              strand: 'meaning_input',
              activityType: 'graded_input',
              modality: 'text',
              targetWords: ['agua'],
              targetGrammar: [],
              gradedInput: {
                type: 'graded_input',
                modality: 'reading',
                cefrLevel: 'A1',
                knownWordRatioTarget: 0.96,
                knownWordEstimate: 0.67,
                targetWords: ['agua'],
                text: 'Ana quiere agua.',
                comprehensionQuestions: [
                  {
                    id: 'gist-1',
                    prompt: 'What does Ana want?',
                    answerHint: 'Ana wants water',
                  },
                ],
                audioEnabled: false,
              },
            },
          },
        },
      ],
      learnerMessage: 'She is going home.',
      inputMode: 'text',
      languageCode: 'es',
      cefrLevel: 'A1',
      knownWords: ['Ana'],
      targetWords: ['agua'],
    });

    expect(state.previousComprehension).toMatchObject({
      verdict: 'missed',
      questionId: 'gist-1',
    });
    expect(state.activeStrand).toBe('language_focus');
    expect(state.nextActivity).toMatchObject({
      strand: 'language_focus',
      activityType: 'correction_retry',
      targetWords: ['agua'],
    });
  });
});
