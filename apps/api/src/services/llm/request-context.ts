import { AsyncLocalStorage } from 'node:async_hooks';

export interface LlmRequestContextInput {
  routingV2Enabled: boolean;
  environment: string;
  readKillSwitch: (() => Promise<boolean>) | undefined;
}

interface LlmRequestContext extends LlmRequestContextInput {
  killSwitchRead?: Promise<boolean>;
  killSwitchActive?: boolean;
}

const requestContext = new AsyncLocalStorage<LlmRequestContext>();

/** Run downstream request work with isolate-safe LLM routing state. */
export function runWithLlmRequestContext<T>(
  input: LlmRequestContextInput,
  callback: () => T,
): T {
  return requestContext.run({ ...input }, callback);
}

export function getLlmRequestRoutingV2Enabled(fallback: boolean): boolean {
  return requestContext.getStore()?.routingV2Enabled ?? fallback;
}

export function getLlmRequestEnvironment(fallback: string): string {
  return requestContext.getStore()?.environment ?? fallback;
}

/**
 * Read the operator kill switch only when an LLM choke point is reached.
 * The Promise is cached in request-local state so overlapping calls in one
 * request share one KV read without leaking the result to another request.
 */
export async function readLlmRequestKillSwitch(
  fallback: boolean,
): Promise<boolean> {
  const context = requestContext.getStore();
  if (!context) return fallback;

  const readKillSwitch = context.readKillSwitch;
  if (!readKillSwitch) {
    context.killSwitchActive = false;
    return false;
  }

  if (!context.killSwitchRead) {
    context.killSwitchRead = (async () => {
      const active = await readKillSwitch();
      context.killSwitchActive = active;
      return active;
    })();
  }

  return context.killSwitchRead;
}

/** Test-only synchronous snapshot; production enforcement uses the async read. */
export function getLlmRequestKillSwitchSnapshot(fallback: boolean): boolean {
  const context = requestContext.getStore();
  if (!context) return fallback;
  return context.killSwitchActive ?? false;
}
