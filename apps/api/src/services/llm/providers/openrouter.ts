import {
  makeChatStreamResult,
  type LLMProvider,
  type ChatMessage,
  type ChatResult,
  type ChatStreamResult,
  type ModelConfig,
} from '../types';
import { normalizeStopReason, type StopReason } from '../stop-reason';
import { SafetyFilterError } from '../../../errors';
import { createProviderApiError, createProviderHttpError } from './errors';
import { toOpenAIContent } from './openai';

// ---------------------------------------------------------------------------
// OpenRouter Provider — EVAL-ONLY model-candidate adapter
//
// Purpose: one adapter to A/B candidate models (Mistral Small 4, gpt-oss-120b,
// US-hosted DeepSeek, …) in the eval harness (`pnpm eval:llm --live`) without
// writing a per-vendor integration for each candidate. See the model register
// docs/registers/llm-models/master.md (and its vetting/ trail) for the vetted set.
//
// NOT registered in production middleware (middleware/llm.ts) by design:
// OpenRouter is a US broker — adding it to the production path for minors'
// conversation data would add a processor to the B3 transfer/DPA chain.
// If a candidate model wins its eval, promote it to a direct vendor
// integration instead of shipping this adapter to production.
//
// Wire format: OpenAI-compatible chat completions. Model IDs are passed
// through VERBATIM (e.g. "mistralai/mistral-small-2603",
// "openai/gpt-oss-120b") — there is deliberately no MODEL_MAP here, because
// the whole point is calling models the production router doesn't know.
// ---------------------------------------------------------------------------

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

// 25s timeout — matches the other providers (CF Workers 30s subrequest wall
// minus 5s buffer). Kept identical even though this adapter only runs in
// Node eval contexts, so behavior doesn't change if it's ever reused.
const OPENROUTER_TIMEOUT_MS = 25_000;

type OpenRouterContent = ReturnType<typeof toOpenAIContent>;

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: OpenRouterContent;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  // OpenRouter normalizes `max_tokens` across all upstream providers
  // (unlike OpenAI first-party, which moved to `max_completion_tokens`).
  max_tokens: number;
  response_format?: { type: 'json_object' };
  // Provider-routing preferences. `zdr: true` restricts routing to
  // zero-data-retention endpoints only (opt-in — see
  // OpenRouterProviderOptions for the 2026-06-05 ruling). `order` +
  // `allow_fallbacks: false` pins serving to specific hosts — required for
  // open/hybrid models where host config changes model behavior (gpt-oss
  // brace-dropping on Google; DeepSeek reasoning-by-default on Novita).
  provider?: { zdr?: boolean; order?: string[]; allow_fallbacks?: boolean };
  // OpenRouter's unified reasoning control — maps to reasoning_effort for
  // OpenAI models, thinking budgets elsewhere. Only sent when the caller
  // sets config.reasoningEffort.
  reasoning?: { effort: 'minimal' | 'low' | 'medium' | 'high' };
}

export interface OpenRouterProviderOptions {
  /**
   * Pin routing to zero-data-retention endpoints only.
   *
   * Default `false` per owner ruling 2026-06-05 ("relax for eval traffic"):
   * this adapter only ever carries SYNTHETIC eval fixtures — no learner data,
   * no PII — and the strict pin made whole vendor catalogs unreachable
   * (observed: zero ZDR endpoints hosted Mistral Small 4, so the candidate
   * gate could not run at all). Known trade-off: our system prompts may be
   * retained by non-ZDR hosts — a prompt-confidentiality cost, not a
   * personal-data one.
   *
   * If this adapter is EVER promoted to production traffic, `zdr: true` must
   * be re-pinned and the B3 transfer/DPA review done first (see header).
   */
  zdr?: boolean;
  /**
   * Pin serving to these OpenRouter hosts (in preference order) with
   * fallbacks disabled. For open/hybrid-weight candidates the host IS part
   * of the model choice — measured 2026-06-06: deepseek-v4-pro via
   * DeepInfra = 5–10s non-reasoning, via Novita = 34–49s reasoning-on.
   */
  providerOrder?: string[];
}

interface OpenRouterChoice {
  message?: { content?: string };
  finish_reason?: string;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message: string; code?: number | string };
}

function toOpenRouterMessages(messages: ChatMessage[]): OpenRouterMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: toOpenAIContent(m.content),
  }));
}

function createOpenRouterContentFilterError(): SafetyFilterError {
  return new SafetyFilterError(
    'The response was blocked by content safety filters. Please try rephrasing your question.',
  );
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createOpenRouterProvider(
  apiKey: string,
  options?: OpenRouterProviderOptions,
): LLMProvider {
  async function chat(
    messages: ChatMessage[],
    config: ModelConfig,
    signal?: AbortSignal,
  ): Promise<ChatResult> {
    // Both routing preferences are opt-in; the `provider` object is only
    // sent when at least one is set.
    const providerPrefs: NonNullable<OpenRouterRequest['provider']> = {
      ...(options?.zdr ? { zdr: true } : {}),
      ...(options?.providerOrder && options.providerOrder.length > 0
        ? { order: options.providerOrder, allow_fallbacks: false }
        : {}),
    };

    const body: OpenRouterRequest = {
      // Verbatim passthrough — see header comment.
      model: config.model,
      messages: toOpenRouterMessages(messages),
      max_tokens: config.maxTokens,
      ...(Object.keys(providerPrefs).length > 0
        ? { provider: providerPrefs }
        : {}),
      ...(config.reasoningEffort
        ? { reasoning: { effort: config.reasoningEffort } }
        : {}),
      ...(config.responseFormat === 'json'
        ? { response_format: { type: 'json_object' as const } }
        : {}),
    };

    const res = await fetch(OPENROUTER_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // Attribution headers — show up in the OpenRouter dashboard so eval
        // traffic is identifiable. No auth significance.
        'HTTP-Referer': 'https://eduagent.app',
        'X-Title': 'EduAgent Eval Harness',
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(OPENROUTER_TIMEOUT_MS)])
        : AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw createProviderHttpError(
        'OpenRouter API request',
        res.status,
        errorBody,
      );
    }

    const data = (await res.json()) as OpenRouterResponse;

    if (data.error) {
      // Keep only the structured type/code tokens (mirrors openai.ts /
      // FCR-2026-05-23-L11.F11); the vendor message can echo learner input,
      // so it never enters the error.
      throw createProviderApiError('OpenRouter API', data.error);
    }

    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'content_filter') {
      throw createOpenRouterContentFilterError();
    }

    const text = choice?.message?.content;
    if (!text) {
      throw new Error('OpenRouter returned empty response');
    }
    return {
      content: text,
      // OpenRouter normalizes finish_reason to the OpenAI vocabulary
      // ("stop" | "length" | "content_filter" | "tool_calls"), so the
      // OpenAI normalization table applies.
      stopReason: normalizeStopReason('openai', choice?.finish_reason),
    };
  }

  return {
    id: 'openrouter',
    chat,

    /**
     * EVAL-ONLY buffered stream: performs a non-streaming chat() and yields
     * the full content once. The eval harness never streams (`callLlm` /
     * `runHarnessLlm` are non-streaming), so a real SSE implementation would
     * be dead code here. If this provider is ever promoted to production,
     * implement true SSE streaming first (or extract the shared
     * OpenAI-compatible SSE parser from providers/openai.ts).
     */
    chatStream(messages: ChatMessage[], config: ModelConfig): ChatStreamResult {
      let resolveStop!: (r: StopReason) => void;
      const stopReasonPromise = new Promise<StopReason>((resolve) => {
        resolveStop = resolve;
      });

      async function* generate(): AsyncIterable<string> {
        try {
          const result = await chat(messages, config);
          resolveStop(result.stopReason);
          yield result.content;
        } catch (err) {
          resolveStop('unknown');
          throw err;
        }
      }

      return makeChatStreamResult(generate(), stopReasonPromise);
    },
  };
}
