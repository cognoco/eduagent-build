// ---------------------------------------------------------------------------
// language-session-summary.ts — unit tests
// ---------------------------------------------------------------------------
// Pure-function tests, no DB/LLM boundary — computeLanguageSessionSummary
// derives everything from a session_events fixture plus a few pre-computed
// inputs (vocabulary classification, fluency totals, the WI-1552 pointer).
// Rule: no jest.mock (GC1/GC6) — none needed here, this module has no
// external dependencies besides the sibling pure helper it imports.
// ---------------------------------------------------------------------------

import {
  computeLanguageSessionSummary,
  type LanguageSummaryEvent,
} from './language-session-summary';

function aiResponse(
  content: string,
  languageLearning: Record<string, unknown>,
): LanguageSummaryEvent {
  return { eventType: 'ai_response', content, metadata: { languageLearning } };
}

function userMessage(content: string): LanguageSummaryEvent {
  return { eventType: 'user_message', content, metadata: {} };
}

function quickAction(): LanguageSummaryEvent {
  return { eventType: 'quick_action', content: '', metadata: {} };
}

describe('computeLanguageSessionSummary', () => {
  it('rich-data: populates every field when the session has full activity', () => {
    const events: LanguageSummaryEvent[] = [
      aiResponse('Order at the cafe. What would you like?', {
        strand: 'meaning_output',
        activityType: 'free_response',
        modality: 'voice',
        targetWords: ['coffee'],
        targetGrammar: ['polite requests: je voudrais'],
        meaningOutput: {
          type: 'meaning_output',
          taskType: 'role_play',
          communicativeGoal: 'order food at a cafe',
          prompt: 'What would you like to order?',
          responseMode: 'dialogue_turn',
          targetWords: ['coffee'],
          targetGrammar: ['polite requests: je voudrais'],
          retryExpectation: 'retry_after_feedback',
          correctionExpectation: 'meaning_first_then_form',
        },
      }),
      userMessage('Je voudrais un cafe'),
      aiResponse('Read this passage and answer.', {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: ['pain', 'eau'],
        targetGrammar: ['articles: le/la'],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A2',
          knownWordRatioTarget: 0.9,
          knownWordEstimate: 0.85,
          targetWords: ['pain', 'eau'],
          text: 'Ana wants bread and water.',
          comprehensionQuestions: [
            {
              id: 'q1',
              prompt: 'What does Ana want?',
              answerHint: 'bread water',
            },
          ],
          audioEnabled: false,
        },
      }),
      userMessage('bread and water'),
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: 'Cafe Ordering',
      newWords: [{ term: 'croissant', type: 'word' }],
      strengthenedWords: [{ term: 'bonjour', type: 'word' }],
      fluencyDrillTotals: { correct: 4, total: 5 },
      nextRecommendationStrand: 'fluency',
    });

    expect(result.practicedScenario).toBe('order food at a cafe');
    expect(result.newWords).toEqual([{ term: 'croissant', type: 'word' }]);
    expect(result.strengthenedWords).toEqual([
      { term: 'bonjour', type: 'word' },
    ]);
    expect(result.grammarPatterns).toEqual([
      'polite requests: je voudrais',
      'articles: le/la',
    ]);
    expect(result.comprehension).toEqual({ correct: 1, total: 1 });
    expect(result.speakingAttempts).toBe(1);
    expect(result.fluency).toEqual({ correct: 4, total: 5 });
    expect(result.nextRecommendationStrand).toBe('fluency');
  });

  it('sparse-data: omits (nulls/empties) fields with no supporting activity', () => {
    const events: LanguageSummaryEvent[] = [
      aiResponse('Listen to this and repeat.', {
        strand: 'meaning_input',
        activityType: 'free_response',
        modality: 'listening',
        targetWords: [],
        targetGrammar: [],
      }),
      userMessage('ok'),
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: null,
      newWords: [],
      strengthenedWords: [],
      fluencyDrillTotals: null,
      nextRecommendationStrand: 'meaning_output',
    });

    expect(result.practicedScenario).toBeNull();
    expect(result.newWords).toEqual([]);
    expect(result.strengthenedWords).toEqual([]);
    expect(result.grammarPatterns).toEqual([]);
    expect(result.comprehension).toBeNull();
    expect(result.speakingAttempts).toBe(0);
    expect(result.fluency).toBeNull();
    // Strand activity happened this session, so a recommendation still
    // surfaces even though every other field is sparse.
    expect(result.nextRecommendationStrand).toBe('meaning_output');
  });

  it('falls back to the topic title when no meaning-output scenario was presented', () => {
    const events: LanguageSummaryEvent[] = [
      aiResponse('Read this passage.', {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: [],
        targetGrammar: [],
      }),
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: 'Everyday Greetings',
      newWords: [],
      strengthenedWords: [],
      fluencyDrillTotals: null,
      nextRecommendationStrand: null,
    });

    expect(result.practicedScenario).toBe('Everyday Greetings');
  });

  it('zero-strand-activity edge: no recommendation when no languageLearning metadata exists at all', () => {
    const events: LanguageSummaryEvent[] = [
      { eventType: 'ai_response', content: 'Hello!', metadata: {} },
      userMessage('Hi'),
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: null,
      newWords: [],
      strengthenedWords: [],
      fluencyDrillTotals: null,
      nextRecommendationStrand: null,
    });

    expect(result.practicedScenario).toBeNull();
    expect(result.grammarPatterns).toEqual([]);
    expect(result.comprehension).toBeNull();
    expect(result.speakingAttempts).toBe(0);
    expect(result.nextRecommendationStrand).toBeNull();
  });

  it('does not count a graded-input question the learner never answered', () => {
    const events: LanguageSummaryEvent[] = [
      aiResponse('Read this passage and answer.', {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: [],
        targetGrammar: [],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A2',
          knownWordRatioTarget: 0.9,
          knownWordEstimate: 0.85,
          targetWords: [],
          text: 'Ana wants bread and water.',
          comprehensionQuestions: [
            {
              id: 'q1',
              prompt: 'What does Ana want?',
              answerHint: 'bread water',
            },
          ],
          audioEnabled: false,
        },
      }),
      // Session ends right after the question — no following user_message.
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: null,
      newWords: [],
      strengthenedWords: [],
      fluencyDrillTotals: null,
      nextRecommendationStrand: null,
    });

    expect(result.comprehension).toBeNull();
  });

  // [F2 — Phase-4 review] A non-turn event (quick_action, system_prompt,
  // flag, escalation) landing between the question and the learner's reply
  // must not drop the turn — only a strict i+1 adjacency check would miss it.
  it('still counts a comprehension answer and a speaking attempt when a quick_action event interleaves', () => {
    const events: LanguageSummaryEvent[] = [
      aiResponse('Read this passage and answer.', {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'voice',
        targetWords: [],
        targetGrammar: [],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A2',
          knownWordRatioTarget: 0.9,
          knownWordEstimate: 0.85,
          targetWords: [],
          text: 'Ana wants bread and water.',
          comprehensionQuestions: [
            {
              id: 'q1',
              prompt: 'What does Ana want?',
              answerHint: 'bread water',
            },
          ],
          audioEnabled: false,
        },
      }),
      quickAction(),
      userMessage('bread and water'),
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: null,
      newWords: [],
      strengthenedWords: [],
      fluencyDrillTotals: null,
      nextRecommendationStrand: null,
    });

    expect(result.comprehension).toEqual({ correct: 1, total: 1 });
    expect(result.speakingAttempts).toBe(1);
  });

  // A later ai_response before any reply supersedes the pending question —
  // pairing it with a much-later, unrelated reply would be a stale match.
  it('does not pair a graded-input question with a reply after the tutor has moved on', () => {
    const events: LanguageSummaryEvent[] = [
      aiResponse('Read this passage and answer.', {
        strand: 'meaning_input',
        activityType: 'graded_input',
        modality: 'text',
        targetWords: [],
        targetGrammar: [],
        gradedInput: {
          type: 'graded_input',
          modality: 'reading',
          cefrLevel: 'A2',
          knownWordRatioTarget: 0.9,
          knownWordEstimate: 0.85,
          targetWords: [],
          text: 'Ana wants bread and water.',
          comprehensionQuestions: [
            {
              id: 'q1',
              prompt: 'What does Ana want?',
              answerHint: 'bread water',
            },
          ],
          audioEnabled: false,
        },
      }),
      // Tutor moves on to a different strand before the learner answers.
      aiResponse('Let’s try a fluency drill instead.', {
        strand: 'fluency',
        activityType: 'timed_drill',
        modality: 'voice',
        targetWords: [],
        targetGrammar: [],
      }),
      userMessage('bread and water'),
    ];

    const result = computeLanguageSessionSummary({
      events,
      topicTitle: null,
      newWords: [],
      strengthenedWords: [],
      fluencyDrillTotals: null,
      nextRecommendationStrand: null,
    });

    expect(result.comprehension).toBeNull();
    // The fluency-strand ai_response is voice-modality, so the reply still
    // counts as a speaking attempt against *that* turn.
    expect(result.speakingAttempts).toBe(1);
  });
});
