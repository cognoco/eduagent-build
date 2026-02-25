// ---------------------------------------------------------------------------
// LLM Middleware — lazy provider registration from env bindings
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { registerProvider } from '../services/llm';
import { createGeminiProvider } from '../services/llm/providers/gemini';

type LLMEnv = {
  Bindings: { GEMINI_API_KEY?: string; ENVIRONMENT?: string };
};

let initialized = false;

export const llmMiddleware = createMiddleware<LLMEnv>(async (c, next) => {
  if (!initialized) {
    const key = c.env?.GEMINI_API_KEY;
    if (key) {
      registerProvider(createGeminiProvider(key));
    } else if (process.env['NODE_ENV'] === 'test') {
      console.warn(
        '[llm] GEMINI_API_KEY not set — skipping provider registration (test environment)'
      );
    } else {
      const env = c.env?.ENVIRONMENT ?? 'development';
      throw new Error(`GEMINI_API_KEY is required (environment: ${env})`);
    }
    initialized = true;
  }
  await next();
});

/** Reset initialization state — only for testing */
export function resetLlmMiddleware(): void {
  initialized = false;
}
