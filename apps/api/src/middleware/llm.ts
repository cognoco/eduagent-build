// ---------------------------------------------------------------------------
// LLM Middleware — lazy provider registration from env bindings
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import {
  registerProvider,
  getRegisteredProviders,
  _clearProviders,
  runWithLlmRequestContext,
  setLlmRoutingV2Enabled,
  setLlmKillSwitchActive,
} from '../services/llm';
import { createGeminiProvider } from '../services/llm/providers/gemini';
import { createOpenAIProvider } from '../services/llm/providers/openai';
import { createAnthropicProvider } from '../services/llm/providers/anthropic';
import { createCerebrasProvider } from '../services/llm/providers/cerebras';
import { createMistralProvider } from '../services/llm/providers/mistral';
import { isLlmRoutingV2Enabled } from '../config';
import { createLogger } from '../services/logger';
import { readLlmKillSwitch } from '../services/kv';

const logger = createLogger();

type LLMEnv = {
  Bindings: {
    GEMINI_API_KEY?: string;
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    CEREBRAS_API_KEY?: string;
    MISTRAL_API_KEY?: string;
    LLM_ROUTING_V2_ENABLED?: string;
    ENVIRONMENT?: string;
    // WI-1505 — reused for the aggregate LLM kill switch (key
    // `llm:kill-switch`); no new KV namespace/binding needed.
    SUBSCRIPTION_KV?: KVNamespace;
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
  CEREBRAS_API_KEY?: string;
  MISTRAL_API_KEY?: string;
}): string {
  // Simple concatenation — keys are hex/base64 tokens so `|` is a safe separator.
  // [BUG-488] Every registered provider's key MUST be in the hash, or a
  // key-only change (e.g. adding CEREBRAS_API_KEY on a reused isolate) would
  // not trigger re-registration.
  return `${env.GEMINI_API_KEY ?? ''}|${env.OPENAI_API_KEY ?? ''}|${env.ANTHROPIC_API_KEY ?? ''}|${env.CEREBRAS_API_KEY ?? ''}|${env.MISTRAL_API_KEY ?? ''}`;
}

export const llmMiddleware = createMiddleware<LLMEnv>(async (c, next) => {
  const currentHash = envHash({
    GEMINI_API_KEY: c.env?.GEMINI_API_KEY,
    OPENAI_API_KEY: c.env?.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: c.env?.ANTHROPIC_API_KEY,
    CEREBRAS_API_KEY: c.env?.CEREBRAS_API_KEY,
    MISTRAL_API_KEY: c.env?.MISTRAL_API_KEY,
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
    const cerebrasKey = c.env?.CEREBRAS_API_KEY;
    const mistralKey = c.env?.MISTRAL_API_KEY;

    if (geminiKey) {
      registerProvider(createGeminiProvider(geminiKey));
    }

    if (openaiKey) {
      registerProvider(createOpenAIProvider(openaiKey));
    }

    if (anthropicKey) {
      registerProvider(createAnthropicProvider(anthropicKey));
    }

    // Interactive-routing v2 providers (MMT-ADR-0016). Registered when their
    // key is present so they are available behind LLM_ROUTING_V2_ENABLED; the
    // router does not select them while the flag is off, so registering them
    // is inert until cutover. Not part of the primary-key gate below — a
    // deployment still needs a flag-off primary (Gemini/OpenAI).
    if (cerebrasKey) {
      registerProvider(createCerebrasProvider(cerebrasKey));
    }

    if (mistralKey) {
      registerProvider(createMistralProvider(mistralKey));
    }

    // [Gemini-retirement Phase A / T-A3] Count any admitted provider, not just
    // the legacy primaries. A Gemini-free deployment whose text primary is
    // Cerebras and vision is Mistral is a valid boot — gating only on
    // Gemini/OpenAI/Anthropic would reject it despite working providers.
    // A dedicated Worker entrypoint may install an external-boundary provider
    // before the first request (hosted Maestro does this). Cold production
    // index.ts installs none, and an env-hash change clears the registry above,
    // so accepting an existing provider does not weaken the no-key boot gate.
    const hasAnyProvider =
      cerebrasKey ||
      mistralKey ||
      openaiKey ||
      anthropicKey ||
      geminiKey ||
      getRegisteredProviders().length > 0;

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
          `At least one LLM API key is required (CEREBRAS_API_KEY, MISTRAL_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY) (environment: ${env})`,
        );
      }
    }

    // Hash update is deferred to here — only reached when registration succeeded.
    _registeredEnvHash = currentHash;
  }
  // Request-scoped routing values must not live in isolate globals: Workers
  // can overlap requests in one isolate. The kill switch binding is carried
  // without I/O here and read lazily at the LLM router choke points.
  const subscriptionKv = c.env?.SUBSCRIPTION_KV;
  await runWithLlmRequestContext(
    {
      routingV2Enabled: isLlmRoutingV2Enabled(c.env?.LLM_ROUTING_V2_ENABLED),
      environment: c.env?.ENVIRONMENT ?? 'development',
      readKillSwitch: subscriptionKv
        ? () => readLlmKillSwitch(subscriptionKv)
        : undefined,
    },
    next,
  );
});

/**
 * Reset initialization state — only for testing.
 *
 * Clears both the env-hash registration cache and the provider registry so
 * the next request performs a fresh registration. For partial isolation
 * (hash only), set `_registeredEnvHash` directly, but prefer this function.
 */
export function resetLlmMiddleware(): void {
  _registeredEnvHash = null;
  _clearProviders();
  // Reset the V2 flag so a test that flipped it on cannot leak into the next.
  setLlmRoutingV2Enabled(false);
  // WI-1505 — reset the kill switch so a test that flipped it on cannot leak
  // into the next.
  setLlmKillSwitchActive(false);
}
