import type { VocabularyLlmOutput } from '@eduagent/schemas';
import {
  CEFR_ORDER,
  buildVocabularyMasteryQuestion,
  buildVocabularyPrompt,
  detectCefrCeilingMasteryWeighted,
  getCefrCeilingForDiscovery,
  getLanguageDisplayName,
  nextCefrLevel,
  pickDistractors,
  validateVocabularyRound,
} from './vocabulary-provider';

describe('CEFR helpers', () => {
  it('exposes the expected CEFR order', () => {
    expect(CEFR_ORDER).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('nextCefrLevel advances one step', () => {
    expect(nextCefrLevel('A1')).toBe('A2');
    expect(nextCefrLevel('B2')).toBe('C1');
  });

  it('nextCefrLevel trims whitespace and caps at C2', () => {
    expect(nextCefrLevel('A1 ')).toBe('A2');
    expect(nextCefrLevel('C2')).toBe('C2');
  });

  it('nextCefrLevel throws on invalid input', () => {
    expect(() => nextCefrLevel('X9')).toThrow(/Invalid CEFR level/);
    expect(() => nextCefrLevel('')).toThrow(/Invalid CEFR level/);
  });

  it('detectCefrCeilingMasteryWeighted returns A1 for empty and unmastered banks', () => {
    expect(detectCefrCeilingMasteryWeighted([])).toBe('A1');
    expect(
      detectCefrCeilingMasteryWeighted([
        { cefrLevel: 'B1', repetitions: 0 },
        { cefrLevel: 'A2', repetitions: 2 },
      ])
    ).toBe('A1');
  });

  it('ignores outliers that are not yet mastered', () => {
    expect(
      detectCefrCeilingMasteryWeighted([
        { cefrLevel: 'A1', repetitions: 4 },
        { cefrLevel: 'A2', repetitions: 4 },
        { cefrLevel: 'C1', repetitions: 1 },
      ])
    ).toBe('A2');
  });

  it('returns a beginner-safe discovery ceiling for new learners', () => {
    expect(getCefrCeilingForDiscovery([])).toBe('A1');
    expect(
      getCefrCeilingForDiscovery([{ cefrLevel: 'A1', repetitions: 3 }])
    ).toBe('A2');
  });
});

describe('getLanguageDisplayName', () => {
  it('returns the display name for valid language codes', () => {
    expect(getLanguageDisplayName('de')).toBe('German');
  });

  it('throws for unknown language codes', () => {
    expect(() => getLanguageDisplayName('zz')).toThrow(/Unknown language code/);
  });
});

describe('buildVocabularyPrompt', () => {
  it('includes language, CEFR ceiling, discovery count, and exclusions', () => {
    const prompt = buildVocabularyPrompt({
      discoveryCount: 4,
      ageBracket: 'adolescent',
      recentAnswers: ['dog', 'cat'],
      bankEntries: [{ term: 'der Hund', translation: 'dog' }],
      languageCode: 'de',
      cefrCeiling: 'A2',
      themePreference: 'Animals',
    });

    expect(prompt).toContain('German');
    expect(prompt).toContain('A2');
    expect(prompt).toContain('4');
    expect(prompt).toContain('dog');
    expect(prompt).toContain('der Hund = dog');
    expect(prompt).toContain('Animals');
  });

  it('works without a theme preference', () => {
    const prompt = buildVocabularyPrompt({
      discoveryCount: 6,
      ageBracket: 'child',
      recentAnswers: [],
      languageCode: 'fr',
      cefrCeiling: 'A1',
    });

    expect(prompt).toContain('French');
    expect(prompt).toContain('Choose an age-appropriate theme');
  });
});

describe('validateVocabularyRound', () => {
  const validOutput: VocabularyLlmOutput = {
    theme: 'German Animals',
    targetLanguage: 'German',
    questions: [
      {
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat', 'the cat'],
        distractors: ['dog', 'bird', 'fish'],
        funFact: 'A fun fact.',
        cefrLevel: 'A1',
      },
      {
        term: 'der Vogel',
        correctAnswer: 'bird',
        acceptedAnswers: ['bird', 'the bird'],
        distractors: ['cat', 'dog', 'fish'],
        funFact: 'Another fact.',
        cefrLevel: 'A1',
      },
    ],
  };

  it('passes through valid questions', () => {
    const result = validateVocabularyRound(validOutput, 'A2');

    expect(result.questions).toHaveLength(2);
    expect(result.theme).toBe('German Animals');
  });

  it('drops questions exceeding the CEFR ceiling', () => {
    const output: VocabularyLlmOutput = {
      ...validOutput,
      questions: [
        { ...validOutput.questions[0], cefrLevel: 'A1' },
        { ...validOutput.questions[1], cefrLevel: 'C2' },
      ],
    };

    const result = validateVocabularyRound(output, 'A2');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.term).toBe('die Katze');
  });

  it('removes distractors that match accepted answers and drops malformed questions', () => {
    const output: VocabularyLlmOutput = {
      ...validOutput,
      questions: [
        {
          term: 'die Katze',
          correctAnswer: 'cat',
          acceptedAnswers: ['cat'],
          distractors: ['cat', 'dog', 'fish'],
          funFact: 'Fact.',
          cefrLevel: 'A1',
        },
      ],
    };

    const result = validateVocabularyRound(output, 'A2');

    expect(result.questions).toEqual([]);
  });
});

describe('pickDistractors', () => {
  const vocabPool = [
    { translation: 'dog' },
    { translation: 'Dog' },
    { translation: 'cat' },
    { translation: 'bird' },
    { translation: 'fish' },
    { translation: 'horse' },
  ];

  it('picks 3 distractors excluding the correct answer', () => {
    const result = pickDistractors('dog', vocabPool);

    expect(result).toHaveLength(3);
    expect(result.map((value) => value.toLowerCase())).not.toContain('dog');
  });

  it('returns fewer distractors when the pool is too small', () => {
    const result = pickDistractors('dog', [
      { translation: 'dog' },
      { translation: 'cat' },
    ]);

    expect(result).toEqual(['cat']);
  });
});

describe('buildVocabularyMasteryQuestion', () => {
  const allVocabulary = [
    { translation: 'dog' },
    { translation: 'cat' },
    { translation: 'bird' },
    { translation: 'fish' },
  ];

  it('builds a valid vocabulary mastery question', () => {
    const result = buildVocabularyMasteryQuestion(
      {
        id: 'v1',
        question: 'der Hund',
        answer: 'dog',
        vocabularyId: 'v1',
        cefrLevel: 'A1',
      },
      allVocabulary,
      'A2'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.question.type).toBe('vocabulary');
    expect(result.question.term).toBe('der Hund');
    expect(result.question.correctAnswer).toBe('dog');
    expect(result.question.isLibraryItem).toBe(true);
    expect(result.question.vocabularyId).toBe('v1');
    expect(result.question.distractors).toHaveLength(3);
    expect(result.question.distractors).not.toContain('dog');
  });

  it('returns an explicit failure reason and logs when distractors are insufficient', () => {
    const warnSpy = jest
      .spyOn(console, 'warn')
      .mockImplementation((..._args: unknown[]) => undefined);

    const result = buildVocabularyMasteryQuestion(
      {
        id: 'v1',
        question: 'der Hund',
        answer: 'dog',
        vocabularyId: 'v1',
        cefrLevel: 'A1',
      },
      [{ translation: 'dog' }],
      'A2'
    );

    expect(result).toEqual({
      ok: false,
      reason: 'insufficient_distractors',
      distractorsFound: 0,
    });
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
