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
  // Gemini is the preferred (cheaper) provider. If it isn't registered
  // (no GEMINI_API_KEY), route to OpenAI as primary instead.
  const useGemini = providers.has('gemini');

  if (rung <= 2) {
    if (useGemini) {
      return { provider: 'gemini', model: 'gemini-2.0-flash', maxTokens: 4096 };
    }
    return { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 4096 };
  }

  if (useGemini) {
    return { provider: 'gemini', model: 'gemini-2.5-pro', maxTokens: 8192 };
  }
  return { provider: 'openai', model: 'gpt-4o', maxTokens: 8192 };
}

/**
 * Fallback config when primary provider fails. Returns null if no fallback.
 *
 * Intentionally one-directional for MVP: Gemini → OpenAI only.
 * Gemini is our primary (cheaper, safety-settings-native) provider. OpenAI is
 * the paid fallback. The reverse (OpenAI → Gemini) is not wired because in an
 * OpenAI-only deployment Gemini keys are absent, and in a dual-provider
 * deployment Gemini is already the primary. Extend when adding more providers.
 */
function getFallbackConfig(
  primary: ModelConfig,
  rung: EscalationRung
): ModelConfig | null {
  // Only fall back if the fallback provider is actually registered
  if (!providers.has('openai')) return null;
  // Don't fall back to the same provider (OpenAI-only deployment)
  if (primary.provider === 'openai') return null;

  if (rung <= 2) {
    return { provider: 'openai', model: 'gpt-4o-mini', maxTokens: 4096 };
  }
  return { provider: 'openai', model: 'gpt-4o', maxTokens: 8192 };
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers = new Map<string, LLMProvider>();

export function registerProvider(provider: LLMProvider): void {
  providers.set(provider.id, provider);
}

export function getRegisteredProviders(): string[] {
  return [...providers.keys()];
}

// ---------------------------------------------------------------------------
// Circuit breaker (architecture doc line 134)
//
// 3 consecutive 5xx/timeouts → OPEN (fail fast)
// After 60s → HALF_OPEN (try one request)
// If succeeds → CLOSED; if fails → OPEN again
// ---------------------------------------------------------------------------

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreaker {
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_RECOVERY_MS = 60_000; // 60 seconds

// NOTE: Module-level Map state is per-isolate and non-durable on Cloudflare
// Workers. Under cold starts or multi-isolate deployments, each instance has
// independent circuit state. This is acceptable for MVP defence-in-depth but
// does not guarantee global consistency. Upgrade path: Durable Objects for
// shared circuit state across isolates.
const circuits = new Map<string, CircuitBreaker>();

function getCircuit(providerId: string): CircuitBreaker {
  let cb = circuits.get(providerId);
  if (!cb) {
    cb = { state: 'CLOSED', consecutiveFailures: 0, lastFailureAt: 0 };
    circuits.set(providerId, cb);
  }
  return cb;
}

function recordSuccess(providerId: string): void {
  const cb = getCircuit(providerId);
  cb.state = 'CLOSED';
  cb.consecutiveFailures = 0;
}

function recordFailure(providerId: string): void {
  const cb = getCircuit(providerId);
  cb.consecutiveFailures++;
  cb.lastFailureAt = Date.now();
  if (cb.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    cb.state = 'OPEN';
  }
}

function canAttempt(providerId: string): boolean {
  const cb = getCircuit(providerId);
  if (cb.state === 'CLOSED') return true;
  if (cb.state === 'OPEN') {
    // Check if recovery period has elapsed → transition to HALF_OPEN
    if (Date.now() - cb.lastFailureAt >= CIRCUIT_RECOVERY_MS) {
      cb.state = 'HALF_OPEN';
      return true;
    }
    return false;
  }
  // HALF_OPEN: allow one trial request
  return true;
}

/** Exported for testing only */
export function _resetCircuits(): void {
  circuits.clear();
}

/** Exported for testing only */
export function _clearProviders(): void {
  providers.clear();
}

export class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(
      `LLM provider "${provider}" is temporarily unavailable. Please try again in a moment.`
    );
    this.name = 'CircuitOpenError';
  }
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

  // --- Try primary provider ---
  if (canAttempt(config.provider)) {
    const start = Date.now();
    try {
      const response = await provider.chat(messages, config);
      recordSuccess(config.provider);
      return {
        response,
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      recordFailure(config.provider);
      // Fall through to fallback
      const fallbackConfig = getFallbackConfig(config, rung);
      if (!fallbackConfig) throw err;

      console.warn(
        `[llm] Primary provider ${config.provider} failed, trying fallback ${
          fallbackConfig.provider
        }: ${err instanceof Error ? err.message : String(err)}`
      );
      return attemptProvider(fallbackConfig, messages);
    }
  }

  // Primary circuit is open — try fallback directly
  const fallbackConfig = getFallbackConfig(config, rung);
  if (fallbackConfig) {
    console.warn(
      `[llm] Primary provider ${config.provider} circuit open, using fallback ${fallbackConfig.provider}`
    );
    return attemptProvider(fallbackConfig, messages);
  }

  throw new CircuitOpenError(config.provider);
}

/** Attempt a single provider call (used by fallback path). */
async function attemptProvider(
  config: ModelConfig,
  messages: ChatMessage[]
): Promise<RouteResult> {
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }
  if (!canAttempt(config.provider)) {
    throw new CircuitOpenError(config.provider);
  }

  const start = Date.now();
  try {
    const response = await provider.chat(messages, config);
    recordSuccess(config.provider);
    return {
      response,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    recordFailure(config.provider);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Streaming variant for SSE
// ---------------------------------------------------------------------------

/**
 * Wraps an async iterable stream with circuit breaker tracking.
 *
 * chatStream() returns a lazy AsyncIterable — the actual HTTP request and
 * data flow happen during for-await iteration, not at creation time. This
 * wrapper defers recordSuccess/recordFailure to iteration so the circuit
 * breaker accurately reflects real streaming outcomes.
 *
 * - On successful completion → recordSuccess
 * - On iteration error → recordFailure
 * - Pre-first-byte failure with available fallback → transparent retry
 * - Mid-stream failure → re-throw (cannot switch providers after data flows)
 */
async function* wrapStreamWithCircuitBreaker(
  source: AsyncIterable<string>,
  providerId: string,
  fallbackConfig: ModelConfig | null,
  messages: ChatMessage[],
  onFallback?: () => void
): AsyncIterable<string> {
  let chunksYielded = 0;
  try {
    for await (const chunk of source) {
      chunksYielded++;
      yield chunk;
    }
    recordSuccess(providerId);
  } catch (err) {
    recordFailure(providerId);

    // Pre-first-byte failure with available fallback → try fallback stream
    if (chunksYielded === 0 && fallbackConfig) {
      const fallbackProvider = providers.get(fallbackConfig.provider);
      if (fallbackProvider && canAttempt(fallbackConfig.provider)) {
        console.warn(
          `[llm] Primary stream ${providerId} failed before first byte, trying fallback ${
            fallbackConfig.provider
          }: ${err instanceof Error ? err.message : String(err)}`
        );
        // Manually iterate so onFallback fires after first successful chunk,
        // confirming the fallback provider actually works.
        const fallbackStream = wrapStreamWithCircuitBreaker(
          fallbackProvider.chatStream(messages, fallbackConfig),
          fallbackConfig.provider,
          null, // no further fallback
          messages
        );
        let signalled = false;
        for await (const chunk of fallbackStream) {
          if (!signalled) {
            onFallback?.();
            signalled = true;
          }
          yield chunk;
        }
        return;
      }
    }

    // Mid-stream failure or no fallback available — re-throw
    throw err;
  }
}

/**
 * Streaming variant of routeAndCall.
 *
 * NOTE: The `provider` and `model` fields in the returned StreamResult
 * reflect the initially selected provider. If wrapStreamWithCircuitBreaker
 * transparently falls back (pre-first-byte failure), these fields still
 * report the original provider. Callers using these fields for cost
 * attribution or observability should be aware of this limitation.
 */
export async function routeAndStream(
  messages: ChatMessage[],
  rung: EscalationRung = 1
): Promise<StreamResult> {
  const config = getModelConfig(rung);
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }

  // --- Try primary provider ---
  if (canAttempt(config.provider)) {
    const fallbackConfig = getFallbackConfig(config, rung);
    // NOTE: recordSuccess/recordFailure fire during iteration, not here,
    // because chatStream() returns a lazy AsyncIterable — the actual HTTP
    // request and data flow happen in the caller's for-await loop.
    let fallbackFired = false;
    const stream = wrapStreamWithCircuitBreaker(
      provider.chatStream(messages, config),
      config.provider,
      fallbackConfig,
      messages,
      () => {
        fallbackFired = true;
      }
    );
    return {
      stream,
      provider: config.provider,
      model: config.model,
      get fallbackUsed() {
        return fallbackFired;
      },
    };
  }

  // Primary circuit is open — try fallback directly
  const fallbackConfig = getFallbackConfig(config, rung);
  if (fallbackConfig) {
    console.warn(
      `[llm] Primary stream ${config.provider} circuit open, using fallback ${fallbackConfig.provider}`
    );
    return attemptStreamProvider(fallbackConfig, messages);
  }

  throw new CircuitOpenError(config.provider);
}

/** Attempt a single provider stream (used for direct fallback when primary circuit is open). */
async function attemptStreamProvider(
  config: ModelConfig,
  messages: ChatMessage[]
): Promise<StreamResult> {
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }
  if (!canAttempt(config.provider)) {
    throw new CircuitOpenError(config.provider);
  }

  // NOTE: recordSuccess/recordFailure fire during iteration, not here,
  // because chatStream() returns a lazy AsyncIterable — the actual HTTP
  // request and data flow happen in the caller's for-await loop.
  const stream = wrapStreamWithCircuitBreaker(
    provider.chatStream(messages, config),
    config.provider,
    null, // no further fallback
    messages
  );
  return {
    stream,
    provider: config.provider,
    model: config.model,
  };
}
