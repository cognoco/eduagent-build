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

export async function routeAndStream(
  messages: ChatMessage[],
  rung: EscalationRung = 1
): Promise<StreamResult> {
  const config = getModelConfig(rung);
  const provider = providers.get(config.provider);
  if (!provider) {
    throw new Error(`No provider registered for: ${config.provider}`);
  }

  if (!canAttempt(config.provider)) {
    throw new CircuitOpenError(config.provider);
  }

  // For streaming, we record success when the stream object is returned
  // without error. Individual chunk failures are handled by the caller.
  try {
    const stream = provider.chatStream(messages, config);
    recordSuccess(config.provider);
    return {
      stream,
      provider: config.provider,
      model: config.model,
    };
  } catch (err) {
    recordFailure(config.provider);
    throw err;
  }
}
