import type { EmbeddingResult } from '../embeddings';
import { generateEmbedding } from '../embeddings';

export type EmbeddingFn = (text: string) => Promise<EmbeddingResult>;

export type EmbedFactOutcome =
  | { ok: true; vector: number[] }
  | { ok: false; reason: string };

export type FactEmbedder = (text: string) => Promise<EmbedFactOutcome>;

export async function embedFactText(
  text: string,
  fn: EmbeddingFn
): Promise<EmbedFactOutcome> {
  if (text.trim().length === 0) {
    return { ok: false, reason: 'empty_text' };
  }

  try {
    const result = await fn(text);
    return { ok: true, vector: result.vector };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export const makeEmbedderFromEnv =
  (apiKey?: string): FactEmbedder =>
  async (text) => {
    if (!apiKey) return { ok: false, reason: 'no_voyage_key' };
    return embedFactText(text, (value) => generateEmbedding(value, apiKey));
  };
