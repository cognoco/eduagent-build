import type {
  LLMProvider,
  ChatMessage,
  EscalationRung,
  ModelConfig,
  RouteResult,
  StreamResult,
} from './types';
import type { AgeBracket } from '@eduagent/schemas';
import type { LLMTier } from '../subscription';
import { createLogger } from '../logger';

const logger = createLogger();

// ---------------------------------------------------------------------------
// Content safety preamble — age-aware identity framing.
// Applied at the router layer so it covers ALL providers uniformly,
// including fallback paths through the circuit breaker.
//
// The identity statement ("for young learners" vs "adult learner") prevents
// the LLM from anchoring to a minor-tutor persona when the user is an adult.
// Safety RULES are identical for all ages — only the framing changes.
// ---------------------------------------------------------------------------

const SAFETY_RULES =
  'You MUST refuse any request involving: harassment, bullying, or threats; ' +
  'hate speech or discriminatory content; sexually explicit material; ' +
  'dangerous or harmful activities; or content undermining civic integrity. ' +
  'If a request touches these areas, politely decline and redirect to the learning topic.';

function getSafetyPreamble(ageBracket?: AgeBracket): string {
  if (ageBracket === 'adult') {
    return `You are an educational AI assistant. The current learner is an adult. ${SAFETY_RULES}`;
  }
  // Default to minor-safe framing (defence-in-depth for missing age data)
  return `You are an educational AI assistant for young learners. ${SAFETY_RULES}`;
}

function withSafetyPreamble(
  messages: ChatMessage[],
  ageBracket?: AgeBracket
): ChatMessage[] {
  const preamble = getSafetyPreamble(ageBracket);
  const first = messages[0];
  if (first?.role === 'system') {
    return [
      {
        role: 'system',
        content: `${preamble}\n\n${first.content}`,
      },
      ...messages.slice(1),
    ];
  }
  return [{ role: 'system', content: preamble }, ...messages];
}

// ---------------------------------------------------------------------------
// Model routing configuration (ARCH-9)
// ---------------------------------------------------------------------------

function getModelConfig(
  rung: EscalationRung,
  llmTier: LLMTier = 'standard'
): ModelConfig {
  // Premium tier: route to Anthropic Sonnet when the provider is registered.
  // Falls through to standard routing if Anthropic keys are not configured.
  if (llmTier === 'premium' && providers.has('anthropic')) {
    return {
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      maxTokens: rung <= 2 ? 4096 : 8192,
    };
  }

  // Flash tier: always use the cheapest model regardless of rung.
  // Standard tier: Flash for light tasks (rung ≤ 2), Pro for heavy (rung > 2).
  // Premium without Anthropic: same as standard (graceful degradation).
  const useGemini = providers.has('gemini');
  const isLight = llmTier === 'flash' || rung <= 2;

  if (isLight) {
    if (useGemini) {
      return { provider: 'gemini', model: 'gemini-2.5-flash', maxTokens: 4096 };
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
  probeInFlight: boolean; // R-01: single-probe control for HALF_OPEN
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
    cb = {
      state: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureAt: 0,
      probeInFlight: false,
    };
    circuits.set(providerId, cb);
  }
  return cb;
}

function recordSuccess(providerId: string): void {
  const cb = getCircuit(providerId);
  cb.state = 'CLOSED';
  cb.consecutiveFailures = 0;
  cb.probeInFlight = false;
}

function recordFailure(providerId: string): void {
  const cb = getCircuit(providerId);
  cb.probeInFlight = false;
  cb.consecutiveFailures++;
  cb.lastFailureAt = Date.now();
  if (cb.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    cb.state = 'OPEN';
  }
}

// R-02: only transient errors should trip the circuit
function isTransientError(err: unknown): boolean {
  const status =
    (err as { status?: number }).status ??
    (err as { statusCode?: number }).statusCode;
  if (status != null) {
    // 429 (rate limit) is transient; other 4xx are client errors
    if (status === 429) return true;
    if (status >= 400 && status < 500) return false;
    // 5xx is transient
    return true;
  }
  // Network errors, timeouts, unknown — treat as transient
  return true;
}

function canAttempt(providerId: string): boolean {
  const cb = getCircuit(providerId);
  if (cb.state === 'CLOSED') return true;
  if (cb.state === 'OPEN') {
    // Check if recovery period has elapsed → transition to HALF_OPEN
    if (Date.now() - cb.lastFailureAt >= CIRCUIT_RECOVERY_MS) {
      cb.state = 'HALF_OPEN';
      cb.probeInFlight = true; // R-01: first probe
      return true;
    }
    return false;
  }
  // R-01: HALF_OPEN — allow only one probe at a time
  if (cb.probeInFlight) return false;
  cb.probeInFlight = true;
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
// Retry helper for transient failures
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3; // Up to 4 total attempts
const INITIAL_RETRY_DELAY_MS = 500;

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const jitter = Math.random() * 500;
        const delay = INITIAL_RETRY_DELAY_MS * 2 ** attempt + jitter;
        logger.warn(`[llm] ${label} attempt ${attempt + 1} failed, retrying`, {
          attempt: attempt + 1,
          delayMs: Math.round(delay),
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Core orchestrator — all LLM calls go through here (ARCH-8)
// ---------------------------------------------------------------------------

export async function routeAndCall(
  messages: ChatMessage[],
  rung: EscalationRung = 1,
  _options?: {
    correlationId?: string;
    llmTier?: LLMTier;
    ageBracket?: AgeBracket;
  }
): Promise<RouteResult> {
  const safeMessages = withSafetyPreamble(messages, _options?.ageBracket);
  const config = getModelConfig(rung, _options?.llmTier);
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }

  // --- Try primary provider with retry ---
  if (canAttempt(config.provider)) {
    const start = Date.now();
    try {
      const response = await withRetry(
        () => provider.chat(safeMessages, config),
        config.provider
      );
      recordSuccess(config.provider);
      return {
        response,
        provider: config.provider,
        model: config.model,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      // R-02: only count transient errors toward circuit trips
      if (isTransientError(err)) {
        recordFailure(config.provider);
      } else {
        getCircuit(config.provider).probeInFlight = false;
      }
      // Fall through to fallback
      const fallbackConfig = getFallbackConfig(config, rung);
      if (!fallbackConfig) throw err;

      logger.warn(
        '[llm] Primary provider failed after retries, trying fallback',
        {
          provider: config.provider,
          fallback: fallbackConfig.provider,
          error: err instanceof Error ? err.message : String(err),
        }
      );
      return attemptProvider(fallbackConfig, safeMessages);
    }
  }

  // Primary circuit is open — try fallback directly
  const fallbackConfig = getFallbackConfig(config, rung);
  if (fallbackConfig) {
    logger.warn('[llm] Primary provider circuit open, using fallback', {
      provider: config.provider,
      fallback: fallbackConfig.provider,
    });
    return attemptProvider(fallbackConfig, safeMessages);
  }

  throw new CircuitOpenError(config.provider);
}

/** Attempt a single provider call with retry (used by fallback path). */
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
    const response = await withRetry(
      () => provider.chat(messages, config),
      `${config.provider} (fallback)`
    );
    recordSuccess(config.provider);
    return {
      response,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    if (isTransientError(err)) {
      recordFailure(config.provider);
    } else {
      getCircuit(config.provider).probeInFlight = false;
    }
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
    if (isTransientError(err)) {
      recordFailure(providerId);
    } else {
      getCircuit(providerId).probeInFlight = false;
    }

    // Pre-first-byte failure with available fallback → try fallback stream
    if (chunksYielded === 0 && fallbackConfig) {
      const fallbackProvider = providers.get(fallbackConfig.provider);
      if (fallbackProvider && canAttempt(fallbackConfig.provider)) {
        logger.warn(
          '[llm] Primary stream failed before first byte, trying fallback',
          {
            provider: providerId,
            fallback: fallbackConfig.provider,
            error: err instanceof Error ? err.message : String(err),
          }
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
  rung: EscalationRung = 1,
  options?: {
    llmTier?: LLMTier;
    ageBracket?: AgeBracket;
  }
): Promise<StreamResult> {
  const safeMessages = withSafetyPreamble(messages, options?.ageBracket);
  const config = getModelConfig(rung, options?.llmTier);
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
      provider.chatStream(safeMessages, config),
      config.provider,
      fallbackConfig,
      safeMessages,
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
    logger.warn('[llm] Primary stream circuit open, using fallback', {
      provider: config.provider,
      fallback: fallbackConfig.provider,
    });
    return attemptStreamProvider(fallbackConfig, safeMessages);
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
