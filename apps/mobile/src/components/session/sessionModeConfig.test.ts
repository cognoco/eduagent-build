import { getOpeningMessage, getModeConfig } from './sessionModeConfig';

describe('getOpeningMessage', () => {
  const modes = ['homework', 'learning', 'practice', 'freeform'];

  it('returns problem-text override regardless of experience', () => {
    const msg = getOpeningMessage('homework', 0, 'Solve 2+2');
    expect(msg).toBe(
      "Got it. Let's work through this together. I'll keep it brief and clear."
    );
  });

  it('returns problem-text override for experienced users too', () => {
    const msg = getOpeningMessage('learning', 10, 'Help with this');
    expect(msg).toBe(
      "Got it. Let's work through this together. I'll keep it brief and clear."
    );
  });

  describe('first session (experience 0)', () => {
    it.each(modes)('returns welcoming message for %s mode', (mode) => {
      const msg = getOpeningMessage(mode, 0);
      expect(
        msg.includes('Welcome') ||
          msg.includes('Hey there') ||
          msg.includes('Hi!')
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
      // Should differ from early tier
      expect(msg3).not.toBe(getOpeningMessage(mode, 1));
    });
  });

  describe('experienced sessions (experience >= 5)', () => {
    it.each(modes)(
      'falls back to standard config message for %s mode',
      (mode) => {
        const msg = getOpeningMessage(mode, 5);
        const config = getModeConfig(mode);
        expect(msg).toBe(config.openingMessage);
      }
    );

    it('uses standard message for very high experience', () => {
      const msg = getOpeningMessage('homework', 100);
      const config = getModeConfig('homework');
      expect(msg).toBe(config.openingMessage);
    });
  });

  describe('topic-aware opening (topicName provided)', () => {
    it('includes topic name for first session', () => {
      const msg = getOpeningMessage('learning', 0, undefined, 'The Nile River');
      expect(msg).toContain('The Nile River');
      expect(msg).toContain("I'll explain the key ideas");
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
        'The Nile River'
      );
      expect(msg).toContain('The Nile River');
    });

    it('problemText takes priority over topicName', () => {
      const msg = getOpeningMessage(
        'homework',
        0,
        'Solve 2+2',
        'The Nile River'
      );
      expect(msg).not.toContain('The Nile River');
      expect(msg).toContain('work through this together');
    });
  });

  describe('subject-aware opening (subjectName provided, no topicName)', () => {
    it('includes subject name for first session', () => {
      const msg = getOpeningMessage(
        'freeform',
        0,
        undefined,
        undefined,
        'Biology — Botany'
      );
      expect(msg).toContain('Biology — Botany');
    });

    it('includes subject name for early session', () => {
      const msg = getOpeningMessage(
        'freeform',
        1,
        undefined,
        undefined,
        'Biology — Botany'
      );
      expect(msg).toContain('Biology — Botany');
    });

    it('includes subject name for experienced session', () => {
      const msg = getOpeningMessage(
        'freeform',
        10,
        undefined,
        undefined,
        'Biology — Botany'
      );
      expect(msg).toContain('Biology — Botany');
    });

    it('topicName takes priority over subjectName', () => {
      const msg = getOpeningMessage(
        'learning',
        0,
        undefined,
        'Photosynthesis',
        'Biology — Botany'
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
        'Biology — Botany'
      );
      expect(msg).not.toContain('Biology — Botany');
      expect(msg).toContain('work through this together');
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
        'tea'
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
        'tea'
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
        'help with homework'
      );
      expect(msg).not.toContain('homework');
      expect(msg).toContain('work through');
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
