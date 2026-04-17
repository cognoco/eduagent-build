import type { CapitalsQuestion, VocabularyQuestion } from '@eduagent/schemas';
import type { LibraryItem } from './content-resolver';
import {
  assembleRound,
  buildVocabularyDiscoveryQuestions,
  buildCapitalsPrompt,
  injectAtRandomPositions,
  injectMasteryQuestions,
} from './generate-round';

describe('buildCapitalsPrompt', () => {
  it('includes discovery count and exclusions', () => {
    const prompt = buildCapitalsPrompt({
      discoveryCount: 6,
      ageBracket: 'adolescent',
      recentAnswers: ['Paris', 'Berlin'],
      themePreference: 'Central Europe',
    });

    expect(prompt).toContain('6');
    expect(prompt).toContain('Paris');
    expect(prompt).toContain('Berlin');
    expect(prompt).toContain('Central Europe');
    expect(prompt).toContain('10-13');
  });

  it('works without a theme preference', () => {
    const prompt = buildCapitalsPrompt({
      discoveryCount: 8,
      ageBracket: 'child',
      recentAnswers: [],
    });

    expect(prompt).toContain('Choose an age-appropriate theme');
  });
});

describe('injectAtRandomPositions', () => {
  it('inserts items without replacing the base array', () => {
    const result = injectAtRandomPositions(['a', 'b', 'c'], ['X', 'Y']);

    expect(result).toHaveLength(5);
    expect(result).toContain('a');
    expect(result).toContain('X');
    expect(result).toContain('Y');
  });

  it('returns the base array when nothing is injected', () => {
    const base = ['a', 'b', 'c'];

    expect(injectAtRandomPositions(base, [])).toEqual(base);
  });
});

describe('injectMasteryQuestions', () => {
  it('injects mastery items into the round', () => {
    const discovery: CapitalsQuestion[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'capitals',
      country: `Discovery ${i}`,
      correctAnswer: `Capital ${i}`,
      acceptedAliases: [`Capital ${i}`],
      distractors: ['A', 'B', 'C'],
      funFact: 'Fact',
      isLibraryItem: false,
    }));

    const mastery: LibraryItem[] = [
      { id: 'lib-1', question: 'France', answer: 'Paris' },
    ];

    const round = injectMasteryQuestions(discovery, mastery, 'capitals');

    expect(round.length).toBe(7);
    const libraryQuestions = round.filter((question) => question.isLibraryItem);
    expect(libraryQuestions).toHaveLength(1);
    expect(libraryQuestions[0]?.country).toBe('France');
    expect(libraryQuestions[0]?.correctAnswer).toBe('Paris');
  });

  it('returns discovery only when no mastery items exist', () => {
    const discovery: CapitalsQuestion[] = [
      {
        type: 'capitals',
        country: 'Germany',
        correctAnswer: 'Berlin',
        acceptedAliases: ['Berlin'],
        distractors: ['Munich', 'Hamburg', 'Frankfurt'],
        funFact: 'Fact',
        isLibraryItem: false,
      },
    ];

    const round = injectMasteryQuestions(discovery, [], 'capitals');

    expect(round).toHaveLength(1);
    expect(round[0]?.isLibraryItem).toBe(false);
  });
});

describe('buildVocabularyDiscoveryQuestions', () => {
  it('converts validated questions into typed vocabulary questions', () => {
    const result: VocabularyQuestion[] = buildVocabularyDiscoveryQuestions({
      questions: [
        {
          term: 'die Katze',
          correctAnswer: 'cat',
          acceptedAnswers: ['cat', 'the cat'],
          distractors: ['dog', 'bird', 'fish'],
          funFact: 'Fact.',
          cefrLevel: 'A1',
        },
      ],
    });

    expect(result).toEqual([
      {
        type: 'vocabulary',
        term: 'die Katze',
        correctAnswer: 'cat',
        acceptedAnswers: ['cat', 'the cat'],
        distractors: ['dog', 'bird', 'fish'],
        funFact: 'Fact.',
        cefrLevel: 'A1',
        isLibraryItem: false,
      },
    ]);
  });
});

describe('assembleRound', () => {
  it('produces a complete round response', () => {
    const questions: CapitalsQuestion[] = [
      {
        type: 'capitals',
        country: 'France',
        correctAnswer: 'Paris',
        acceptedAliases: ['Paris'],
        distractors: ['Berlin', 'Madrid', 'Rome'],
        funFact: 'Fact',
        isLibraryItem: false,
      },
    ];

    const round = assembleRound('Test Theme', questions);

    expect(round.theme).toBe('Test Theme');
    expect(round.questions).toEqual(questions);
    expect(round.total).toBe(1);
    expect(round.libraryQuestionIndices).toEqual([]);
  });

  it('tracks library question indices', () => {
    const questions: CapitalsQuestion[] = [
      {
        type: 'capitals',
        country: 'A',
        correctAnswer: 'A1',
        acceptedAliases: ['A1'],
        distractors: ['B', 'C', 'D'],
        funFact: '',
        isLibraryItem: false,
      },
      {
        type: 'capitals',
        country: 'B',
        correctAnswer: 'B1',
        acceptedAliases: ['B1'],
        distractors: ['A', 'C', 'D'],
        funFact: '',
        isLibraryItem: true,
      },
      {
        type: 'capitals',
        country: 'C',
        correctAnswer: 'C1',
        acceptedAliases: ['C1'],
        distractors: ['A', 'B', 'D'],
        funFact: '',
        isLibraryItem: false,
      },
    ];

    const round = assembleRound('Theme', questions);

    expect(round.libraryQuestionIndices).toEqual([1]);
  });
});
