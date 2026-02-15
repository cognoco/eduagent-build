import type {
  LLMProvider,
  ChatMessage,
  EscalationRung,
  ModelConfig,
  RouteResult,
  StreamResult,
} from './types';

// ---------------------------------------------------------------------------
// Model routing configuration (ARCH-9)
// ---------------------------------------------------------------------------

function getModelConfig(rung: EscalationRung): ModelConfig {
  if (rung <= 2) {
    return { provider: 'gemini', model: 'gemini-2.0-flash', maxTokens: 4096 };
  }
  return { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 8192 };
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.id, provider);
}

// ---------------------------------------------------------------------------
// Core orchestrator — all LLM calls go through here (ARCH-8)
// ---------------------------------------------------------------------------

export async function routeAndCall(
  messages: ChatMessage[],
  rung: EscalationRung = 1,
  _options?: { correlationId?: string }
): Promise<RouteResult> {
  const config = getModelConfig(rung);
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }

  const start = Date.now();
  const response = await provider.chat(messages, config);

  return {
    response,
    provider: config.provider,
    model: config.model,
    latencyMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Streaming variant for SSE
// ---------------------------------------------------------------------------

export async function routeAndStream(
  messages: ChatMessage[],
  rung: EscalationRung = 1
): Promise<StreamResult> {
  const config = getModelConfig(rung);
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }

  return {
    stream: provider.chatStream(messages, config),
    provider: config.provider,
    model: config.model,
  };
}
