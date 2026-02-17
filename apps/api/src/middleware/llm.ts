// ---------------------------------------------------------------------------
// LLM Middleware — lazy provider registration from env bindings
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { registerProvider } from '../services/llm';
import { createMockProvider } from '../services/llm/providers/mock';
import { createGeminiProvider } from '../services/llm/providers/gemini';

type LLMEnv = {
  Bindings: { GEMINI_API_KEY?: string };
};

let initialized = false;

export const llmMiddleware = createMiddleware<LLMEnv>(async (c, next) => {
  if (!initialized) {
    const key = c.env?.GEMINI_API_KEY;
    if (key) {
      registerProvider(createGeminiProvider(key));
    } else {
      registerProvider(createMockProvider('gemini'));
    }
    initialized = true;
  }
  await next();
});

/** Reset initialization state — only for testing */
export function resetLlmMiddleware(): void {
  initialized = false;
}
