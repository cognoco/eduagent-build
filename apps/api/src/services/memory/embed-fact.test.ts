import {
  embedFactText,
  makeEmbedderFromEnv,
  type EmbeddingFn,
} from './embed-fact';
import { EmbeddingDimensionMismatchError } from '../embeddings';

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

  it('returns ok:false with class:transient for a generic error', async () => {
    const fn: EmbeddingFn = async () => {
      throw new Error('voyage 503');
    };

    const result = await embedFactText('Fractions are hard', fn);

    expect(result).toMatchObject({
      ok: false,
      // Generic errors without the Voyage status pattern are transient.
      class: 'transient',
      reason: 'transient',
      message: 'voyage 503',
    });
  });

  it('rejects empty text without calling fn', async () => {
    const fn = jest.fn();

    const result = await embedFactText('   ', fn as unknown as EmbeddingFn);

    expect(result).toMatchObject({
      ok: false,
      class: 'empty_text',
      reason: 'empty_text',
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns no_voyage_key when no API key is configured', async () => {
    const result = await makeEmbedderFromEnv(undefined)('text');

    expect(result).toMatchObject({
      ok: false,
      class: 'no_voyage_key',
      reason: 'no_voyage_key',
    });
  });

  // ---------------------------------------------------------------------------
  // Classified error branches
  // ---------------------------------------------------------------------------

  it('classifies a 429 response as rate_limited', async () => {
    const fn: EmbeddingFn = async () => {
      throw new Error(
        'Voyage AI embedding request failed (429): rate limit exceeded',
      );
    };

    const result = await embedFactText('some fact', fn);

    expect(result).toMatchObject({
      ok: false,
      class: 'rate_limited',
      reason: 'rate_limited',
    });
  });

  it('classifies a 400 response as invalid_input', async () => {
    const fn: EmbeddingFn = async () => {
      throw new Error(
        'Voyage AI embedding request failed (400): bad request - input too long',
      );
    };

    const result = await embedFactText('some fact', fn);

    expect(result).toMatchObject({
      ok: false,
      class: 'invalid_input',
      reason: 'invalid_input',
    });
  });

  it.each([401, 403])(
    'classifies a %i auth response as transient',
    async (status) => {
      const fn: EmbeddingFn = async () => {
        throw new Error(
          `Voyage AI embedding request failed (${status}): auth failed`,
        );
      };

      const result = await embedFactText('some fact', fn);

      expect(result).toMatchObject({
        ok: false,
        class: 'transient',
        reason: 'transient',
      });
    },
  );

  it('classifies a 500 response as transient', async () => {
    const fn: EmbeddingFn = async () => {
      throw new Error(
        'Voyage AI embedding request failed (500): internal server error',
      );
    };

    const result = await embedFactText('some fact', fn);

    expect(result).toMatchObject({
      ok: false,
      class: 'transient',
      reason: 'transient',
    });
  });

  it('classifies an EmbeddingDimensionMismatchError as dimension_mismatch (NOT transient)', async () => {
    // BREAK TEST: ensures dimension drift is NOT misclassified as transient
    // (which would trigger Inngest retries that just keep producing the
    // same wrong-sized vector). Must be its own discrete failure class.
    const fn: EmbeddingFn = async () => {
      throw new EmbeddingDimensionMismatchError({
        expected: 1024,
        actual: 512,
        model: 'voyage-3.5',
        provider: 'voyage',
      });
    };

    const result = await embedFactText('some fact', fn);

    expect(result).toMatchObject({
      ok: false,
      class: 'dimension_mismatch',
      reason: 'dimension_mismatch',
    });
  });

  it('classifies a network error (no status) as transient', async () => {
    const fn: EmbeddingFn = async () => {
      throw new TypeError('Failed to fetch');
    };

    const result = await embedFactText('some fact', fn);

    expect(result).toMatchObject({
      ok: false,
      class: 'transient',
      reason: 'transient',
      message: 'Failed to fetch',
    });
  });
});
