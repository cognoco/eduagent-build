import { getOpeningMessage, getModeConfig } from './sessionModeConfig';

describe('getOpeningMessage', () => {
  const modes = ['homework', 'learning', 'practice', 'freeform'];

  it('returns problem-text override regardless of experience', () => {
    const msg = getOpeningMessage('homework', 0, 'Solve 2+2');
    expect(msg).toBe("Got it. Let's work through this together.");
  });

  it('returns problem-text override for experienced users too', () => {
    const msg = getOpeningMessage('learning', 10, 'Help with this');
    expect(msg).toBe("Got it. Let's work through this together.");
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
      expect(msg).toContain("I'm your learning coach");
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
