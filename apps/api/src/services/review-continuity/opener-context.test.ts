import {
  MAX_RECAP_BULLETS,
  MAX_VERBATIM_CHARS,
  reviewContinuityContextSchema,
  type ReviewContinuityContext,
} from './opener-context';

describe('reviewContinuityContextSchema', () => {
  it('MAX_VERBATIM_CHARS is the documented 240-char cap', () => {
    expect(MAX_VERBATIM_CHARS).toBe(240);
  });

  it('parses a full continuity context (verbatim + recap + streak)', () => {
    const valid = {
      topicTitle: 'Photosynthesis',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'solid' as const,
        daysSince: 6,
      },
      priorSolidCount: 2,
      recapBullets: ['light reactions', 'the Calvin cycle'],
    };
    const parsed = reviewContinuityContextSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('defaults priorSolidCount to 0 when omitted', () => {
    const parsed = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
      consentGranted: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.priorSolidCount).toBe(0);
    }
  });

  it('rejects a missing consent flag (EU-2 gate must be explicit)', () => {
    const parsed = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an out-of-enum verdict', () => {
    const parsed = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'something',
        verdict: 'unsure',
        daysSince: 3,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an empty topicTitle (F6: never review an unnamed topic)', () => {
    const parsed = reviewContinuityContextSchema.safeParse({
      topicTitle: '',
      consentGranted: true,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects negative or fractional daysSince (F5: nonsensical recency clause)', () => {
    const negative = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'x',
        verdict: 'solid' as const,
        daysSince: -3,
      },
    });
    const fractional = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'x',
        verdict: 'solid' as const,
        daysSince: 3.7,
      },
    });
    expect(negative.success).toBe(false);
    expect(fractional.success).toBe(false);
  });

  it('rejects more than MAX_RECAP_BULLETS recap bullets (F4: uncapped prompt growth)', () => {
    const tooMany = Array.from(
      { length: MAX_RECAP_BULLETS + 1 },
      (_, i) => `bullet ${i}`,
    );
    const parsed = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
      consentGranted: true,
      recapBullets: tooMany,
    });
    expect(parsed.success).toBe(false);
    // The cap itself allows exactly MAX_RECAP_BULLETS.
    const atCap = reviewContinuityContextSchema.safeParse({
      topicTitle: 'Fractions',
      consentGranted: true,
      recapBullets: tooMany.slice(0, MAX_RECAP_BULLETS),
    });
    expect(atCap.success).toBe(true);
  });

  it('inferred type lines up with a hand-written literal', () => {
    const ctx: ReviewContinuityContext = {
      topicTitle: 'Verbs',
      consentGranted: true,
      priorSolidCount: 0,
    };
    expect(reviewContinuityContextSchema.safeParse(ctx).success).toBe(true);
  });
});
