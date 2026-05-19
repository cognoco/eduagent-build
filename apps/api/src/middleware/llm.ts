// ---------------------------------------------------------------------------
// LLM Middleware — lazy provider registration from env bindings
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { registerProvider } from '../services/llm';
import { createGeminiProvider } from '../services/llm/providers/gemini';
import { createOpenAIProvider } from '../services/llm/providers/openai';
import { createAnthropicProvider } from '../services/llm/providers/anthropic';
import { createLogger } from '../services/logger';

const logger = createLogger();

type LLMEnv = {
  Bindings: {
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    ENVIRONMENT?: string;
  };
};

let initialized = false;

export const llmMiddleware = createMiddleware<LLMEnv>(async (c, next) => {
  if (!initialized) {
    // [BUG-96 / A1-HIGH] Wrap provider registration in try/finally so
    // `initialized` flips even on partial-registration failure. Previously
    // the flag was set AFTER the registerProvider calls; if one threw, the
    // already-registered providers stayed in the registry but `initialized`
    // remained false, so the next request re-registered them and threw
    // "provider already registered". Setting the flag in `finally` makes
    // failed init terminal per-isolate — the next request short-circuits
    // and any router call surfaces the missing-provider error directly,
    // which is louder and easier to debug than the duplicate-registration
    // symptom that masked the real cause.
    try {
      const geminiKey = c.env?.GEMINI_API_KEY;
      const openaiKey = c.env?.OPENAI_API_KEY;

      if (geminiKey) {
        registerProvider(createGeminiProvider(geminiKey));
      }

      if (openaiKey) {
        registerProvider(createOpenAIProvider(openaiKey));
      }

      const anthropicKey = c.env?.ANTHROPIC_API_KEY;
      if (anthropicKey) {
        registerProvider(createAnthropicProvider(anthropicKey));
      }

      const hasAnyProvider = geminiKey || openaiKey || anthropicKey;

      if (!hasAnyProvider) {
        if (
          c.env?.ENVIRONMENT === 'test' ||
          // Fallback: Jest sets NODE_ENV at module level — process.env is
          // acceptable here because this branch only fires in Node.js tests
          // (CF Workers never reach this path without API keys).
          process.env['NODE_ENV'] === 'test'
        ) {
          // [logging sweep] structured logger so PII fields land as JSON context
          logger.warn(
            '[llm] No LLM API keys set — skipping provider registration (test environment)',
          );
        } else {
          const env = c.env?.ENVIRONMENT ?? 'development';
          throw new Error(
            `At least one LLM API key is required (GEMINI_API_KEY or OPENAI_API_KEY) (environment: ${env})`,
          );
        }
      }
    } finally {
      initialized = true;
    }
  }
  await next();
});

/**
 * Reset initialization state — only for testing.
 *
 * NOTE: This only resets the `initialized` flag so the middleware re-runs
 * provider registration on the next request. It does NOT clear the provider
 * registry in router.ts. For full test isolation, also call `_clearProviders()`
 * from `@eduagent/services/llm` to remove previously registered providers.
 */
export function resetLlmMiddleware(): void {
  initialized = false;
}
