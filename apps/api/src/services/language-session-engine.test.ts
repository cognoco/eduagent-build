import {
  buildLanguageActivityTelemetry,
  buildLanguageSessionState,
  chooseNextLanguageStrand,
  evaluatePendingGradedInputAnswer,
  getLanguageStrandCounts,
  isLikelyLanguageLearningIntent,
} from './language-session-engine';

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
  it('maps fluency strands to timed drill telemetry', () => {
    expect(
      buildLanguageActivityTelemetry({
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

  it('attaches a graded input artifact to meaning-focused input turns', () => {
    const telemetry = buildLanguageActivityTelemetry({
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
  });

  it('does not attach graded input artifacts to non-input strands', () => {
    const telemetry = buildLanguageActivityTelemetry({
      strand: 'meaning_output',
      targetWords: ['pain'],
      knownWords: ['bonjour'],
    });

    expect(telemetry.gradedInput).toBeUndefined();
  });
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
  it('threads graded input context through the server-selected next activity', () => {
    const state = buildLanguageSessionState({
      exchangeCount: 0,
      events: [],
      inputMode: 'text',
      languageCode: 'es',
      cefrLevel: 'A1',
      knownWords: ['hola', 'gracias'],
      targetWords: ['agua'],
    });

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

  it('routes a missed graded-input answer into language-focused repair', () => {
    const state = buildLanguageSessionState({
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
