import {
  languageComprehensionEvaluationSchema,
  streamDoneFrameSchema,
  streamErrorFrameSchema,
  streamFallbackFrameSchema,
} from './stream-fallback.js';

describe('streamErrorFrameSchema', () => {
  it('parses error frame with code', () => {
    const result = streamErrorFrameSchema.parse({
      type: 'error',
      code: 'quota_exhausted',
      message:
        'Something went wrong while generating a reply. Please try again.',
    });
    expect(result).toEqual({
      type: 'error',
      code: 'quota_exhausted',
      message:
        'Something went wrong while generating a reply. Please try again.',
    });
  });

  it('parses error frame without code', () => {
    const result = streamErrorFrameSchema.parse({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });
    expect(result).toEqual({
      type: 'error',
      message: 'Failed to save session progress. Please try again.',
    });
  });

  it('rejects frame with wrong type literal', () => {
    expect(() =>
      streamErrorFrameSchema.parse({
        type: 'fallback',
        message: 'some message',
      }),
    ).toThrow();
  });

  it('rejects frame missing message', () => {
    expect(() =>
      streamErrorFrameSchema.parse({
        type: 'error',
      }),
    ).toThrow();
  });
});

describe('streamFallbackFrameSchema', () => {
  it('parses valid fallback frame', () => {
    const result = streamFallbackFrameSchema.parse({
      type: 'fallback',
      reason: 'empty_reply',
      fallbackText: 'Let me try again.',
    });
    expect(result.type).toBe('fallback');
    expect(result.reason).toBe('empty_reply');
  });
});

describe('languageComprehensionEvaluationSchema', () => {
  it('parses deterministic language comprehension feedback', () => {
    const result = languageComprehensionEvaluationSchema.parse({
      questionId: 'q1',
      prompt: 'What is on the table?',
      answerHint: 'agua',
      learnerAnswer: 'Water is on the table.',
      verdict: 'understood',
      matchedTerms: ['water'],
      missingTerms: [],
    });

    expect(result.verdict).toBe('understood');
    expect(result.matchedTerms).toEqual(['water']);
  });

  it('rejects unknown comprehension verdicts', () => {
    expect(() =>
      languageComprehensionEvaluationSchema.parse({
        questionId: 'q1',
        prompt: 'What is on the table?',
        answerHint: 'agua',
        learnerAnswer: 'Water is on the table.',
        verdict: 'close',
        matchedTerms: ['water'],
        missingTerms: [],
      }),
    ).toThrow();
  });

  it('rejects empty required prompt fields', () => {
    for (const field of ['questionId', 'prompt', 'answerHint'] as const) {
      expect(() =>
        languageComprehensionEvaluationSchema.parse({
          questionId: 'q1',
          prompt: 'What is on the table?',
          answerHint: 'agua',
          learnerAnswer: 'Water is on the table.',
          verdict: 'understood',
          matchedTerms: ['water'],
          missingTerms: [],
          [field]: '',
        }),
      ).toThrow();
    }
  });
});

describe('streamDoneFrameSchema', () => {
  it('parses a minimal done frame (required fields only)', () => {
    const result = streamDoneFrameSchema.parse({
      type: 'done',
      exchangeCount: 3,
      escalationRung: 2,
    });
    expect(result.type).toBe('done');
    expect(result.exchangeCount).toBe(3);
    expect(result.escalationRung).toBe(2);
  });

  it('parses the full done frame with all nested sub-shapes', () => {
    const result = streamDoneFrameSchema.parse({
      type: 'done',
      exchangeCount: 5,
      escalationRung: 4,
      expectedResponseMinutes: 0,
      aiEventId: '11111111-1111-4111-8111-111111111111',
      notePrompt: true,
      notePromptPostSession: true,
      fluencyDrill: {
        active: true,
        durationSeconds: 90,
        score: { correct: 4, total: 5 },
      },
      languageLearning: {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: ['agua'],
        targetGrammar: ['tener + noun'],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A1',
          knownWordRatioTarget: 0.85,
          knownWordEstimate: 0.82,
          targetWords: ['agua'],
          text: 'Tengo agua en la mesa.',
          comprehensionQuestions: [
            {
              id: 'q1',
              prompt: 'What is on the table?',
              answerHint: 'agua',
            },
          ],
          audioEnabled: true,
        },
      },
      confidence: 'low',
      readyToFinish: true,
      challengeRound: {
        state: 'active',
        offerCount: 1,
        questionIndex: 2,
        totalQuestions: 4,
      },
      challengeOffer: { pitch: 'Want a quick challenge?' },
      draftedNote: {
        id: 'note-1',
        body: 'A drafted note',
        sourceAnswerEventIds: ['e1', 'e2'],
        fallbackPrompt: 'Write what you learned.',
      },
    });
    expect(result.fluencyDrill?.score).toEqual({ correct: 4, total: 5 });
    expect(result.languageLearning?.gradedInput?.text).toBe(
      'Tengo agua en la mesa.',
    );
    expect(result.challengeRound?.state).toBe('active');
    expect(result.challengeOffer?.pitch).toBe('Want a quick challenge?');
    expect(result.draftedNote?.body).toBe('A drafted note');
    // expectedResponseMinutes 0 ("no estimate") must be accepted — the builder
    // always emits a number, defaulting to 0.
    expect(result.expectedResponseMinutes).toBe(0);
  });

  it('accepts a null drafted-note body (fallback-prompt path)', () => {
    const result = streamDoneFrameSchema.parse({
      type: 'done',
      exchangeCount: 1,
      escalationRung: 1,
      draftedNote: {
        id: 'note-2',
        body: null,
        sourceAnswerEventIds: [],
        fallbackPrompt: 'Tell me what stuck with you.',
      },
    });
    expect(result.draftedNote?.body).toBeNull();
  });

  it('parses meaning-output activity metadata while preserving legacy payload compatibility', () => {
    const result = streamDoneFrameSchema.parse({
      type: 'done',
      exchangeCount: 2,
      escalationRung: 1,
      languageLearning: {
        strand: 'meaning_output',
        activityType: 'free_response',
        modality: 'voice',
        targetWords: ['coffee'],
        targetGrammar: ['I would like + noun'],
        meaningOutput: {
          type: 'meaning_output',
          taskType: 'ask_question',
          communicativeGoal: 'Ask a useful question in a real conversation.',
          prompt: 'Ask one question about ordering coffee.',
          responseMode: 'question',
          targetWords: ['coffee'],
          targetGrammar: ['I would like + noun'],
          retryExpectation: 'retry_after_feedback',
          correctionExpectation: 'meaning_first_then_form',
        },
      },
    });

    expect(result.languageLearning?.meaningOutput).toMatchObject({
      taskType: 'ask_question',
      responseMode: 'question',
      prompt: 'Ask one question about ordering coffee.',
    });

    const legacy = streamDoneFrameSchema.parse({
      type: 'done',
      exchangeCount: 2,
      escalationRung: 1,
      languageLearning: {
        strand: 'meaning_output',
        activityType: 'free_response',
        modality: 'text',
        targetWords: [],
        targetGrammar: [],
      },
    });
    expect(legacy.languageLearning?.gradedInput).toBeUndefined();
  });

  it('rejects a frame with the wrong type literal', () => {
    expect(() =>
      streamDoneFrameSchema.parse({
        type: 'fallback',
        exchangeCount: 1,
        escalationRung: 1,
      }),
    ).toThrow();
  });

  it('rejects an out-of-range escalationRung (drift guard)', () => {
    expect(() =>
      streamDoneFrameSchema.parse({
        type: 'done',
        exchangeCount: 1,
        escalationRung: 9,
      }),
    ).toThrow();
  });

  it('rejects an unknown confidence value', () => {
    expect(() =>
      streamDoneFrameSchema.parse({
        type: 'done',
        exchangeCount: 1,
        escalationRung: 1,
        confidence: 'very-high',
      }),
    ).toThrow();
  });
});
