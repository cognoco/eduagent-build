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

let bootstrapped = false;

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

  if (!geminiKey && !openaiKey && !anthropicKey) {
    throw new Error(
      'No LLM API keys found in environment. ' +
        'Run with `doppler run -- pnpm eval:llm -- --live` to inject keys.'
    );
  }

  bootstrapped = true;
}

/** Reset bootstrap state (for tests). */
export function _resetBootstrap(): void {
  bootstrapped = false;
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
  opts: { flow: string; rung?: 1 | 2 | 3 | 4 | 5 } = { flow: 'eval' }
): Promise<string> {
  bootstrapLlmProviders();
  const result = await routeAndCall(messages, opts.rung ?? 2, {
    flow: opts.flow,
    sessionId: `eval-${opts.flow}`,
  });
  return result.response;
}
