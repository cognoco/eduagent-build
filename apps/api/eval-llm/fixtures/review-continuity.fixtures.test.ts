import { reviewContinuityContextSchema } from '../../src/services/review-continuity/opener-context';
import { reviewContinuityContexts } from './review-continuity';

describe('reviewContinuityContexts', () => {
  it('is non-empty', () => {
    expect(reviewContinuityContexts.length).toBeGreaterThan(0);
  });

  it('every fixture id is unique', () => {
    const ids = reviewContinuityContexts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(reviewContinuityContexts)(
    'schema validates fixture $id',
    ({ context }) => {
      const result = reviewContinuityContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    },
  );

  it('every fixture with priorRetrieval has a non-empty fixed learnerAnswerVerbatim', () => {
    for (const fixture of reviewContinuityContexts) {
      if (fixture.context.priorRetrieval !== undefined) {
        expect(
          fixture.context.priorRetrieval.learnerAnswerVerbatim.trim().length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('all required high-signal fixture ids are present', () => {
    const ids = new Set(reviewContinuityContexts.map((f) => f.id));
    const required = [
      'verbatim-solid',
      'verbatim-missing-blank',
      'consent-declined',
      'no-material',
      'long-gap',
      'recency-stumble',
      'injection-verbatim',
      'messy-multilingual',
    ];
    for (const id of required) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('injection-verbatim verbatim contains prompt-injection markers', () => {
    const fixture = reviewContinuityContexts.find(
      (f) => f.id === 'injection-verbatim',
    );
    const verbatim =
      fixture?.context.priorRetrieval?.learnerAnswerVerbatim ?? '';
    expect(verbatim).toContain('ignore');
    expect(verbatim.includes('<') || verbatim.includes('\n')).toBe(true);
  });
});
