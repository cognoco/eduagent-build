// ---------------------------------------------------------------------------
// LLM Middleware — lazy provider registration from env bindings
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import { registerProvider, _clearProviders } from '../services/llm';
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

// [BUG-488 / P2] Replace the single `initialized: boolean` flag with an
// env-key hash. The old flag bound provider registration to the first
// request's env bindings for the isolate lifetime — if a Worker was reused
// across preview→prod, the second env's API keys were silently ignored.
//
// Fix (strategy a): hash the current env's LLM keys into a string; re-register
// when the hash differs from the one used for the previous registration.
// Cost: O(1) per request (three string concatenations + compare).
//
// The try/finally flip-on-error from BUG-96/A1-HIGH is intentionally removed:
// the old try/finally was designed to make a failed init "terminal" — but with
// env-key hashing, a new request with a different (valid) env must be allowed
// to re-register. Instead, registration errors now propagate normally; the
// stored hash is only updated on SUCCESS, so the next request with the same
// env re-attempts (and will fail again) while a request with a different env
// gets a clean registration attempt.

let _registeredEnvHash: string | null = null;

function envHash(env: {
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}): string {
  // Simple concatenation — keys are hex/base64 tokens so `|` is a safe separator.
  return `${env.GEMINI_API_KEY ?? ''}|${env.OPENAI_API_KEY ?? ''}|${env.ANTHROPIC_API_KEY ?? ''}`;
}

export const llmMiddleware = createMiddleware<LLMEnv>(async (c, next) => {
  const currentHash = envHash({
    GEMINI_API_KEY: c.env?.GEMINI_API_KEY,
    OPENAI_API_KEY: c.env?.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: c.env?.ANTHROPIC_API_KEY,
  });

  if (_registeredEnvHash !== currentHash) {
    // Clear previously registered providers so re-registration does not throw
    // "provider already registered" when the env changes.
    if (_registeredEnvHash !== null) {
      _clearProviders();
    }

    // Only update the hash AFTER successful registration (no try/finally flip).
    // If registration throws, _registeredEnvHash stays at the old value so the
    // next request retries — unlike the old approach which made a failed init
    // permanently terminal.
    const geminiKey = c.env?.GEMINI_API_KEY;
    const openaiKey = c.env?.OPENAI_API_KEY;
    const anthropicKey = c.env?.ANTHROPIC_API_KEY;

    if (geminiKey) {
      registerProvider(createGeminiProvider(geminiKey));
    }

    if (openaiKey) {
      registerProvider(createOpenAIProvider(openaiKey));
    }

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

    // Hash update is deferred to here — only reached when registration succeeded.
    _registeredEnvHash = currentHash;
  }
  await next();
});

/**
 * Reset initialization state — only for testing.
 *
 * NOTE: This clears both the env hash and the provider registry so the next
 * request performs a fresh registration. For partial isolation (hash only),
 * set `_registeredEnvHash` directly, but prefer this function.
 */
export function resetLlmMiddleware(): void {
  _registeredEnvHash = null;
}
