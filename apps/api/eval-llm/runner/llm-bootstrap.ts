// ---------------------------------------------------------------------------
// Eval-LLM — LLM provider bootstrap for tier-2 (--live) runs
//
// Reads API keys from process.env (supplied by `doppler run --`) and registers
// whichever providers are available. Calling this more than once is safe —
// re-registration of the same provider is idempotent because registerProvider
// replaces the Map entry.
//
// Usage:
//   import { bootstrapLlmProviders, callLlm } from './llm-bootstrap';
//   bootstrapLlmProviders();  // call once at entry point or per flow
//   const response = await callLlm(messages, { flow: 'quiz-capitals' });
// ---------------------------------------------------------------------------

import {
  registerProvider,
  routeAndCall,
  type ChatMessage,
} from '../../src/services/llm';
import { createGeminiProvider } from '../../src/services/llm/providers/gemini';
import { createOpenAIProvider } from '../../src/services/llm/providers/openai';
import { createAnthropicProvider } from '../../src/services/llm/providers/anthropic';
import { createOpenRouterProvider } from '../../src/services/llm/providers/openrouter';
import type { LLMProvider } from '../../src/services/llm';

let bootstrapped = false;

// OpenRouter is held as a direct reference, NOT registered into the router's
// provider registry: routeAndCall's rung→model configs only know
// gemini/openai/anthropic, and candidate-model evals deliberately bypass
// production model selection (you're testing a model that production doesn't
// route to yet). Use `callOpenRouterModel` below.
let openRouterProvider: LLMProvider | null = null;

/**
 * Register LLM providers from process.env. Safe to call multiple times.
 * Throws if no provider keys are present (so tier-2 runs fail early rather
 * than silently producing no results).
 */
export function bootstrapLlmProviders(): void {
  if (bootstrapped) return;

  const geminiKey = process.env['GEMINI_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];
  const anthropicKey = process.env['ANTHROPIC_API_KEY'];

  if (geminiKey) {
    registerProvider(createGeminiProvider(geminiKey));
  }
  if (openaiKey) {
    registerProvider(createOpenAIProvider(openaiKey));
  }
  if (anthropicKey) {
    registerProvider(createAnthropicProvider(anthropicKey));
  }

  // Eval-only candidate-model adapter — see callOpenRouterModel. Optional:
  // its absence must not fail runs that only exercise production providers.
  const openRouterKey = process.env['OPENROUTER_API_KEY'];
  if (openRouterKey) {
    openRouterProvider = createOpenRouterProvider(openRouterKey);
  }

  if (!geminiKey && !openaiKey && !anthropicKey) {
    throw new Error(
      'No LLM API keys found in environment. ' +
        'Run with `doppler run -- pnpm eval:llm -- --live` to inject keys.',
    );
  }

  bootstrapped = true;
}

/** Reset bootstrap state (for tests). */
export function _resetBootstrap(): void {
  bootstrapped = false;
  openRouterProvider = null;
}

/**
 * Make a single non-streaming LLM call. Registers providers on first use.
 *
 * @param messages System + optional user messages.
 * @param opts.flow  Flow label for stop_reason metrics (e.g. "exchanges").
 * @param opts.rung  Escalation rung — governs model selection. Defaults to 2
 *                   (mid-tier model, good balance for eval runs).
 * @returns Raw response string from the LLM.
 */
export async function callLlm(
  messages: ChatMessage[],
  opts: { flow: string; rung?: 1 | 2 | 3 | 4 | 5; responseFormat?: 'json' } = {
    flow: 'eval',
  },
): Promise<string> {
  bootstrapLlmProviders();
  const result = await routeAndCall(messages, opts.rung ?? 2, {
    flow: opts.flow,
    sessionId: `eval-${opts.flow}`,
    ...(opts.responseFormat ? { responseFormat: opts.responseFormat } : {}),
  });
  return result.response;
}

/**
 * Make a single non-streaming call to an arbitrary candidate model via
 * OpenRouter, bypassing production routing entirely.
 *
 * For A/B-ing models the production router doesn't know yet (Mistral
 * Small 4, gpt-oss-120b, US-hosted DeepSeek, …). Requires
 * `OPENROUTER_API_KEY` in the environment (add to Doppler).
 *
 * @param messages System + user messages.
 * @param model    OpenRouter model ID, verbatim — e.g.
 *                 "mistralai/mistral-small-2603", "openai/gpt-oss-120b".
 * @param opts.maxTokens       Output cap (default 8192, mirroring the
 *                             router's uniform reply ceiling).
 * @param opts.responseFormat  'json' to request JSON-object mode.
 * @returns Raw response string from the model.
 */
export async function callOpenRouterModel(
  messages: ChatMessage[],
  model: string,
  opts: { maxTokens?: number; responseFormat?: 'json' } = {},
): Promise<string> {
  bootstrapLlmProviders();
  if (!openRouterProvider) {
    throw new Error(
      'OPENROUTER_API_KEY not found in environment. ' +
        'Add it to Doppler, then run with `doppler run -- pnpm eval:llm -- --live`.',
    );
  }
  const result = await openRouterProvider.chat(messages, {
    provider: 'openrouter',
    model,
    maxTokens: opts.maxTokens ?? 8192,
    ...(opts.responseFormat ? { responseFormat: opts.responseFormat } : {}),
  });
  return result.content;
}
