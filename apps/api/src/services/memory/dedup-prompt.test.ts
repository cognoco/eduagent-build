import { buildDedupPrompt, dedupResponseSchema } from './dedup-prompt';

describe('buildDedupPrompt', () => {
  it('includes both fact texts verbatim', () => {
    const prompt = buildDedupPrompt({
      candidate: { text: 'struggles with fractions', category: 'struggle' },
      neighbour: {
        text: 'has trouble with fraction arithmetic',
        category: 'struggle',
      },
    });
    expect(prompt).toContain('struggles with fractions');
    expect(prompt).toContain('has trouble with fraction arithmetic');
  });

  it('forbids new content in merged_text', () => {
    const prompt = buildDedupPrompt({
      candidate: { text: 'a', category: 'struggle' },
      neighbour: { text: 'b', category: 'struggle' },
    }).toLowerCase();
    expect(prompt).toContain('do not add');
    expect(prompt).toContain(
      'only semantic content present in at least one input'
    );
  });

  it('prefers supersede over merge on disagreement', () => {
    const prompt = buildDedupPrompt({
      candidate: { text: 'a', category: 'struggle' },
      neighbour: { text: 'b', category: 'struggle' },
    }).toLowerCase();
    expect(prompt).toContain('prefer the more recent');
    expect(prompt).toContain('supersede');
  });
});

describe('dedupResponseSchema', () => {
  it('accepts valid actions', () => {
    expect(
      dedupResponseSchema.parse({
        action: 'merge',
        merged_text: 'struggles with fractions',
      })
    ).toEqual({ action: 'merge', merged_text: 'struggles with fractions' });
    expect(dedupResponseSchema.parse({ action: 'supersede' })).toEqual({
      action: 'supersede',
    });
    expect(dedupResponseSchema.parse({ action: 'keep_both' })).toEqual({
      action: 'keep_both',
    });
    expect(dedupResponseSchema.parse({ action: 'discard_new' })).toEqual({
      action: 'discard_new',
    });
  });

  it('rejects invalid merge responses', () => {
    expect(() => dedupResponseSchema.parse({ action: 'merge' })).toThrow();
    expect(() =>
      dedupResponseSchema.parse({
        action: 'merge',
        merged_text: 'x'.repeat(513),
      })
    ).toThrow();
  });
});
