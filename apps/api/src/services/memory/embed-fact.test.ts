import {
  embedFactText,
  makeEmbedderFromEnv,
  type EmbeddingFn,
} from './embed-fact';

describe('embedFactText', () => {
  it('returns the embedding vector when the fn succeeds', async () => {
    const fn: EmbeddingFn = async () => ({
      vector: new Array(1024).fill(0.5),
      dimensions: 1024,
      model: 'voyage-3.5',
      provider: 'voyage',
    });

    const result = await embedFactText('Fractions are hard', fn);

    expect(result).toEqual({ ok: true, vector: expect.any(Array) });
    expect((result as { vector: number[] }).vector).toHaveLength(1024);
  });

  it('returns ok:false with reason when fn throws', async () => {
    const fn: EmbeddingFn = async () => {
      throw new Error('voyage 503');
    };

    await expect(embedFactText('Fractions are hard', fn)).resolves.toEqual({
      ok: false,
      reason: 'voyage 503',
    });
  });

  it('rejects empty text without calling fn', async () => {
    const fn = jest.fn();

    const result = await embedFactText('   ', fn as unknown as EmbeddingFn);

    expect(result).toEqual({ ok: false, reason: 'empty_text' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns no_voyage_key when no API key is configured', async () => {
    await expect(makeEmbedderFromEnv(undefined)('text')).resolves.toEqual({
      ok: false,
      reason: 'no_voyage_key',
    });
  });
});
