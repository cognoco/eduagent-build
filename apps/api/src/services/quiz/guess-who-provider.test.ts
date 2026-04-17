import {
  buildGuessWhoDiscoveryQuestions,
  buildGuessWhoPrompt,
  clueMentionsGuessWhoName,
  validateGuessWhoRound,
} from './guess-who-provider';

describe('buildGuessWhoPrompt', () => {
  it('includes topic hints and exclusions when provided', () => {
    const prompt = buildGuessWhoPrompt({
      discoveryCount: 4,
      ageBracket: 'adolescent',
      recentAnswers: ['Isaac Newton', 'Marie Curie'],
      topicTitles: ['Classical mechanics', 'French Revolution'],
      themePreference: 'History and science',
    });

    expect(prompt).toContain('4');
    expect(prompt).toContain('10-13');
    expect(prompt).toContain('Isaac Newton');
    expect(prompt).toContain('Classical mechanics');
    expect(prompt).toContain('History and science');
  });

  it('uses generic fallback when no topics are available', () => {
    const prompt = buildGuessWhoPrompt({
      discoveryCount: 4,
      ageBracket: 'adult',
      recentAnswers: [],
      topicTitles: [],
    });

    expect(prompt).toContain('age-appropriate');
    expect(prompt).not.toContain('curriculum');
  });

  it('limits topic titles to 30', () => {
    const topics = Array.from({ length: 40 }, (_, i) => `Topic ${i}`);
    const prompt = buildGuessWhoPrompt({
      discoveryCount: 4,
      ageBracket: 'adolescent',
      recentAnswers: [],
      topicTitles: topics,
    });

    expect(prompt).toContain('Topic 29');
    expect(prompt).not.toContain('Topic 30');
  });

  it('includes theme preference when provided', () => {
    const prompt = buildGuessWhoPrompt({
      discoveryCount: 4,
      ageBracket: 'child',
      recentAnswers: [],
      topicTitles: [],
      themePreference: 'Famous Artists',
    });

    expect(prompt).toContain('Famous Artists');
  });
});

describe('clueMentionsGuessWhoName', () => {
  it('detects canonical or alias mentions in clues', () => {
    expect(
      clueMentionsGuessWhoName('Newton wrote about gravity.', [
        'Isaac Newton',
        'Newton',
      ])
    ).toBe(true);
  });

  it('ignores unrelated clues', () => {
    expect(
      clueMentionsGuessWhoName('He developed laws of motion.', [
        'Isaac Newton',
        'Newton',
      ])
    ).toBe(false);
  });
});

describe('validateGuessWhoRound', () => {
  it('filters questions that leak the answer in clues', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Isaac Newton',
          acceptedAliases: ['Newton'],
          clues: [
            'He studied motion.',
            'Newton wrote Principia.',
            'He worked at the Royal Mint.',
            'He is linked to an apple story.',
            'He helped explain gravity.',
          ],
          mcFallbackOptions: [
            'Isaac Newton',
            'Albert Einstein',
            'Galileo Galilei',
            'Nikola Tesla',
          ],
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toEqual([]);
  });

  it('ensures the canonical answer appears in fallback options', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Isaac Newton',
          acceptedAliases: ['Newton'],
          clues: [
            'He studied motion.',
            'He wrote a famous scientific book.',
            'He worked at the Royal Mint.',
            'He is linked to an apple story.',
            'He helped explain gravity.',
          ],
          mcFallbackOptions: [
            'Albert Einstein',
            'Galileo Galilei',
            'Nikola Tesla',
            'Marie Curie',
          ],
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toHaveLength(1);
    expect(validated.questions[0]?.mcFallbackOptions).toHaveLength(4);
    expect(validated.questions[0]?.mcFallbackOptions).toContain('Isaac Newton');
  });

  it('rejects person whose clue contains an alias', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Isaac Newton',
          acceptedAliases: ['Newton'],
          clues: [
            'He studied motion.',
            'Newton published Principia.',
            'He worked at the Royal Mint.',
            'He is linked to an apple story.',
            'He helped explain gravity.',
          ],
          mcFallbackOptions: [
            'Isaac Newton',
            'Albert Einstein',
            'Galileo Galilei',
            'Nikola Tesla',
          ],
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toEqual([]);
  });

  it('name-in-clue check is case-insensitive', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Isaac Newton',
          acceptedAliases: ['Newton'],
          clues: [
            'He studied motion.',
            'He wrote a famous scientific book.',
            'He worked at the Royal Mint.',
            'Also known as NEWTON.',
            'He helped explain gravity.',
          ],
          mcFallbackOptions: [
            'Isaac Newton',
            'Albert Einstein',
            'Galileo Galilei',
            'Nikola Tesla',
          ],
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toEqual([]);
  });

  it('rejects questions with wrong clue count', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Isaac Newton',
          acceptedAliases: ['Newton'],
          clues: ['He studied motion.', 'He worked at the Royal Mint.'],
          mcFallbackOptions: [
            'Isaac Newton',
            'Albert Einstein',
            'Galileo Galilei',
            'Nikola Tesla',
          ],
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toEqual([]);
  });

  it('keeps valid persons through validation', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Marie Curie',
          acceptedAliases: ['Curie'],
          clues: [
            'Born in Warsaw.',
            'Won two Nobel Prizes.',
            'Pioneered research on radioactivity.',
            'Discovered polonium.',
            'First woman to win a Nobel Prize.',
          ],
          mcFallbackOptions: [
            'Marie Curie',
            'Rosalind Franklin',
            'Ada Lovelace',
            'Emmy Noether',
          ],
          funFact: 'Her notebooks are still radioactive.',
        },
      ],
    });

    expect(validated.questions).toHaveLength(1);
    expect(validated.questions[0]?.canonicalName).toBe('Marie Curie');
  });
});

describe('buildGuessWhoDiscoveryQuestions', () => {
  it('maps validated questions into quiz questions', () => {
    expect(
      buildGuessWhoDiscoveryQuestions({
        questions: [
          {
            canonicalName: 'Isaac Newton',
            acceptedAliases: ['Newton'],
            clues: ['C1', 'C2', 'C3', 'C4', 'C5'],
            mcFallbackOptions: [
              'Isaac Newton',
              'Albert Einstein',
              'Galileo Galilei',
              'Nikola Tesla',
            ],
            funFact: 'Fact.',
          },
        ],
      })
    ).toEqual([
      {
        type: 'guess_who',
        canonicalName: 'Isaac Newton',
        correctAnswer: 'Isaac Newton',
        acceptedAliases: ['Newton'],
        clues: ['C1', 'C2', 'C3', 'C4', 'C5'],
        mcFallbackOptions: [
          'Isaac Newton',
          'Albert Einstein',
          'Galileo Galilei',
          'Nikola Tesla',
        ],
        funFact: 'Fact.',
        isLibraryItem: false,
      },
    ]);
  });
});
