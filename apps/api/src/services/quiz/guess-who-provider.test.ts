import {
  appendSurnameAlias,
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
    // AgeBracket 'adolescent' now describes 11-13 after the <11 dead-code cleanup.
    expect(prompt).toContain('11-13');
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
      ageBracket: 'adolescent',
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
      ]),
    ).toBe(true);
  });

  it('ignores unrelated clues', () => {
    expect(
      clueMentionsGuessWhoName('He developed laws of motion.', [
        'Isaac Newton',
        'Newton',
      ]),
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

  it('auto-aliases the surname so a learner typing only the last name is accepted [BUG-541]', () => {
    // Repro: LLM emits a multi-word canonicalName but omits the surname from
    // acceptedAliases. Without the auto-alias guard, a learner typing only
    // "Bell" cannot match "Alexander Graham Bell" via Levenshtein.
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Alexander Graham Bell',
          acceptedAliases: ['Mr. Bell'],
          clues: [
            'He was born in Edinburgh.',
            'He emigrated to the United States.',
            'He worked with the deaf community.',
            'He patented an invention that changed long-distance communication.',
            'You probably hold the descendant of his invention every day.',
          ],
          mcFallbackOptions: [
            'Alexander Graham Bell',
            'Thomas Edison',
            'Nikola Tesla',
            'Guglielmo Marconi',
          ],
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toHaveLength(1);
    const aliases = validated.questions[0]?.acceptedAliases ?? [];
    // Bare surname "Bell" must be present even though the LLM omitted it.
    expect(
      aliases.some((alias: string) => alias.trim().toLowerCase() === 'bell'),
    ).toBe(true);
  });

  it('does not duplicate the surname when LLM already supplied it [BUG-541]', () => {
    const validated = validateGuessWhoRound({
      theme: 'Scientists',
      questions: [
        {
          canonicalName: 'Marie Curie',
          acceptedAliases: ['Curie', 'Madame Curie'],
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
          funFact: 'Fact.',
        },
      ],
    });

    expect(validated.questions).toHaveLength(1);
    const aliases = validated.questions[0]?.acceptedAliases ?? [];
    const curieCount = aliases.filter(
      (alias: string) => alias.trim().toLowerCase() === 'curie',
    ).length;
    expect(curieCount).toBe(1);
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

describe('appendSurnameAlias [BUG-541]', () => {
  it('appends surname when canonical name is multi-word and surname missing', () => {
    expect(
      appendSurnameAlias('Alexander Graham Bell', ['inventor of the phone']),
    ).toEqual(['inventor of the phone', 'Bell']);
  });

  it('does not duplicate surname when already present (case-insensitive)', () => {
    expect(
      appendSurnameAlias('Marie Curie', ['curie', 'Madame Curie']),
    ).toEqual(['curie', 'Madame Curie']);
  });

  it('is a no-op for single-word names', () => {
    expect(appendSurnameAlias('Plato', ['the philosopher'])).toEqual([
      'the philosopher',
    ]);
  });

  it('handles extra whitespace in canonical name', () => {
    expect(appendSurnameAlias('  Isaac   Newton  ', [])).toEqual(['Newton']);
  });

  it('returns a fresh array (does not mutate the input)', () => {
    const input = ['Newton'];
    const result = appendSurnameAlias('Isaac Newton', input);
    expect(input).toEqual(['Newton']);
    expect(result).not.toBe(input);
  });
});

describe('validateGuessWhoRound — surname inclusion [BUG-541]', () => {
  it('appends surname to acceptedAliases when LLM omits it (discovery path)', () => {
    const validated = validateGuessWhoRound({
      theme: 'Inventors',
      questions: [
        {
          canonicalName: 'Alexander Graham Bell',
          acceptedAliases: ['inventor of the telephone'],
          clues: [
            'He was born in Scotland.',
            'He worked with the deaf community.',
            'He patented an iconic communication device.',
            'His invention transformed long-distance talking.',
            'He moved to Canada and the US.',
          ],
          mcFallbackOptions: [
            'Alexander Graham Bell',
            'Thomas Edison',
            'Nikola Tesla',
            'Guglielmo Marconi',
          ],
          funFact: 'He never called his mother on his invention.',
        },
      ],
    });

    expect(validated.questions).toHaveLength(1);
    expect(validated.questions[0]?.acceptedAliases).toEqual(
      expect.arrayContaining(['inventor of the telephone', 'Bell']),
    );
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
      }),
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
