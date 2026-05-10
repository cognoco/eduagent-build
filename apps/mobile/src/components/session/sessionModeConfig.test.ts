import {
  getOpeningMessage,
  getModeConfig,
  SESSION_MODE_CONFIGS,
  EARLY_SESSIONS,
  FAMILIAR_SESSIONS,
} from './sessionModeConfig';

describe('getOpeningMessage', () => {
  const modes = ['homework', 'learning', 'review', 'freeform'];

  it('uses recap-specific opening copy for relearn sessions', () => {
    const msg = getOpeningMessage(
      'relearn',
      2,
      undefined,
      'Fractions',
      undefined,
      undefined,
      'We covered numerators and denominators.',
    );

    expect(msg).toContain('Last time you learned about Fractions');
    expect(msg).toContain('We covered numerators and denominators.');
    expect(msg).toContain('Want to do a quick quiz');
  });

  it('falls back to generic relearn opening when no recap is available', () => {
    const msg = getOpeningMessage('relearn', 2, undefined, 'Fractions');

    expect(msg).toBe(
      "Let's approach Fractions from a fresh angle. What do you remember about it?",
    );
  });

  it('returns problem-text override regardless of experience', () => {
    const msg = getOpeningMessage('homework', 0, 'Solve 2+2');
    expect(msg).toBe(
      "Got it — I can see your problem. Want me to walk you through how to solve it, or have you got an answer you'd like me to check?",
    );
  });

  it('returns problem-text override for experienced users too', () => {
    const msg = getOpeningMessage('learning', 10, 'Help with this');
    expect(msg).toBe(
      "Got it — I can see your problem. Want me to walk you through how to solve it, or have you got an answer you'd like me to check?",
    );
  });

  describe('first session (experience 0)', () => {
    it.each(modes)('returns welcoming message for %s mode', (mode) => {
      const msg = getOpeningMessage(mode, 0);
      expect(
        msg.includes('Welcome') ||
          msg.includes('Hey there') ||
          msg.includes('Hi!'),
      ).toBe(true);
    });

    it('returns freeform fallback for unknown mode', () => {
      const msg = getOpeningMessage('unknown', 0);
      expect(msg).toContain("I'm your learning mate");
    });

    it('uses teach-first tone for learning first session', () => {
      const msg = getOpeningMessage('learning', 0);
      expect(msg).toContain("I'll teach you stuff and check if it sticks");
      expect(msg).not.toContain('What topic would you like to explore');
    });
  });

  describe('early sessions (experience 1-2)', () => {
    it.each(modes)('returns familiar-but-warm message for %s mode', (mode) => {
      const msg1 = getOpeningMessage(mode, 1);
      const msg2 = getOpeningMessage(mode, 2);
      // Should be the same tier for experience 1 and 2
      expect(msg1).toBe(msg2);
      // Should differ from first-session message
      expect(msg1).not.toBe(getOpeningMessage(mode, 0));
    });
  });

  describe('familiar sessions (experience 3-4)', () => {
    it.each(modes)('returns casual message for %s mode', (mode) => {
      const msg3 = getOpeningMessage(mode, 3);
      const msg4 = getOpeningMessage(mode, 4);
      expect(msg3).toBe(msg4);
      // Should differ from early tier (except freeform — intentionally consolidated)
      if (mode !== 'freeform') {
        expect(msg3).not.toBe(getOpeningMessage(mode, 1));
      }
    });
  });

  describe('experienced sessions (experience >= 5)', () => {
    it.each(modes)(
      'falls back to standard config message for %s mode',
      (mode) => {
        const msg = getOpeningMessage(mode, 5);
        const config = getModeConfig(mode);
        expect(msg).toBe(config.openingMessage);
      },
    );

    it('uses standard message for very high experience', () => {
      const msg = getOpeningMessage('homework', 100);
      const config = getModeConfig('homework');
      expect(msg).toBe(config.openingMessage);
    });
  });

  describe('deprecated practice mode compatibility', () => {
    it('maps practice config reads to review config for persisted sessions', () => {
      expect(getModeConfig('practice')).toBe(getModeConfig('review'));
    });

    it('maps practice opening copy to review opening copy for persisted sessions', () => {
      expect(getOpeningMessage('practice', 5)).toBe(
        getOpeningMessage('review', 5),
      );
    });
  });

  describe('topic-aware opening (topicName provided)', () => {
    it('includes topic name for first session', () => {
      const msg = getOpeningMessage('learning', 0, undefined, 'The Nile River');
      expect(msg).toContain('The Nile River');
      expect(msg).toContain("I'll explain the key ideas");
    });

    it('uses a calibration opener for review sessions with a topic', () => {
      const msg = getOpeningMessage('review', 0, undefined, 'The Nile River');
      expect(msg).toBe(
        'Let\'s review "The Nile River". What do you remember about it in your own words?',
      );
    });

    it('uses the review calibration opener for legacy practice sessions with a topic', () => {
      const msg = getOpeningMessage('practice', 0, undefined, 'The Nile River');
      expect(msg).toBe(
        getOpeningMessage('review', 0, undefined, 'The Nile River'),
      );
    });

    it('includes topic name for early session', () => {
      const msg = getOpeningMessage('learning', 1, undefined, 'The Nile River');
      expect(msg).toContain('The Nile River');
    });

    it('includes topic name for experienced session', () => {
      const msg = getOpeningMessage(
        'learning',
        10,
        undefined,
        'The Nile River',
      );
      expect(msg).toContain('The Nile River');
    });

    it('problemText takes priority over topicName', () => {
      const msg = getOpeningMessage(
        'homework',
        0,
        'Solve 2+2',
        'The Nile River',
      );
      expect(msg).not.toContain('The Nile River');
      expect(msg).toContain('walk you through');
    });
  });

  describe('subject-aware opening (subjectName provided, no topicName)', () => {
    it('includes subject name for first session', () => {
      const msg = getOpeningMessage(
        'freeform',
        0,
        undefined,
        undefined,
        'Biology — Botany',
      );
      expect(msg).toContain('Biology — Botany');
    });

    it('includes subject name for early session', () => {
      const msg = getOpeningMessage(
        'freeform',
        1,
        undefined,
        undefined,
        'Biology — Botany',
      );
      expect(msg).toContain('Biology — Botany');
    });

    it('includes subject name for experienced session', () => {
      const msg = getOpeningMessage(
        'freeform',
        10,
        undefined,
        undefined,
        'Biology — Botany',
      );
      expect(msg).toContain('Biology — Botany');
    });

    it('topicName takes priority over subjectName', () => {
      const msg = getOpeningMessage(
        'learning',
        0,
        undefined,
        'Photosynthesis',
        'Biology — Botany',
      );
      expect(msg).toContain('Photosynthesis');
      expect(msg).not.toContain('Biology — Botany');
    });

    it('problemText takes priority over subjectName', () => {
      const msg = getOpeningMessage(
        'homework',
        0,
        'Solve 2+2',
        undefined,
        'Biology — Botany',
      );
      expect(msg).not.toContain('Biology — Botany');
      expect(msg).toContain('walk you through');
    });
  });

  describe('rawInput-aware opening messages', () => {
    it('uses rawInput with topicName for exploration message', () => {
      const msg = getOpeningMessage(
        'learning',
        3,
        undefined,
        'Tea & caffeine',
        'Botany',
        'tea',
      );
      expect(msg).toContain('tea');
    });

    it('uses rawInput without topicName for curiosity message', () => {
      const msg = getOpeningMessage(
        'learning',
        3,
        undefined,
        undefined,
        undefined,
        'tea',
      );
      expect(msg).toContain('tea');
    });

    it('prioritizes problemText over rawInput', () => {
      const msg = getOpeningMessage(
        'homework',
        3,
        'solve x+2=5',
        'Algebra',
        'Math',
        'help with homework',
      );
      expect(msg).not.toContain('homework');
      expect(msg).toContain('walk you through');
    });
  });

  it('produces distinct messages across all tiers for each mode', () => {
    for (const mode of modes) {
      const tiers = [
        getOpeningMessage(mode, 0),
        getOpeningMessage(mode, 1),
        getOpeningMessage(mode, 3),
        getOpeningMessage(mode, 5),
      ];
      const unique = new Set(tiers);
      // At least 3 distinct messages per mode (familiar and experienced may overlap for freeform)
      expect(unique.size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('freeform greeting revert guards (copy sweep 2026-04-19)', () => {
  it('C1: freeform placeholder is the short action-verb invitation', () => {
    expect(SESSION_MODE_CONFIGS.freeform?.placeholder).toBe('Ask me something');
  });

  it('C2: freeform base openingMessage leverages entry-card context', () => {
    expect(SESSION_MODE_CONFIGS.freeform?.openingMessage).toBe(
      'Hi! Ask me anything.',
    );
  });

  it('C3: EARLY_SESSIONS freeform greeting is the curiosity phrasing', () => {
    expect(EARLY_SESSIONS.freeform).toBe(
      'Hey again — what are you curious about?',
    );
  });

  it('C4: FAMILIAR_SESSIONS freeform greeting matches C3 (consolidated)', () => {
    expect(FAMILIAR_SESSIONS.freeform).toBe(
      'Hey again — what are you curious about?',
    );
  });

  it('does not fall back to the old passive phrasings', () => {
    expect(SESSION_MODE_CONFIGS.freeform?.placeholder).not.toBe(
      "What's on your mind?",
    );
    expect(EARLY_SESSIONS.freeform).not.toBe(
      "Hey again! What's on your mind today?",
    );
    expect(FAMILIAR_SESSIONS.freeform).not.toBe(
      "What's on your mind? I'm ready when you are.",
    );
  });
});
