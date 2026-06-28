import { Inngest, InngestMiddleware } from 'inngest';
import type { Database } from '@eduagent/database';
import { INNGEST_PII_STEP_KEYS, scrubPiiPayload } from '@eduagent/schemas';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';
import {
  enterWithEnvBindings,
  beginStepDatabaseScope,
  closeStepDatabases,
  type EnvBindings,
} from './helpers';

function readStringBinding(
  env: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = env?.[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Middleware that captures Cloudflare Workers env bindings and scopes them to
 * the invocation's async context for getStepDatabase(), getStepVoyageApiKey()
 * and friends.
 *
 * On CF Workers the bindings are only available through the request-scoped
 * env object. Inngest's middleware lifecycle runs before each function
 * invocation, giving us a hook to propagate the binding. The bindings are
 * carried through AsyncLocalStorage and (re-)entered in beforeMemoization /
 * beforeExecution — the hooks that fire on every invocation including step
 * re-entries — so overlapping runs in one isolate can never read each other's
 * values. (Previously these were module-level singletons, which a concurrent
 * invocation's middleware pass could overwrite mid-run.)
 */
const envBindingMiddleware = new InngestMiddleware({
  name: 'CF Env Binding Middleware',
  init() {
    return {
      onFunctionRun({ reqArgs }) {
        const stepDatabaseScope = new Set<Database>();
        // reqArgs[0] is the Request, reqArgs[1] is the CF env bindings object
        const env = reqArgs[1] as Record<string, unknown> | undefined;
        const bindings: EnvBindings = {
          databaseUrl: readStringBinding(env, 'DATABASE_URL'),
          voyageApiKey: readStringBinding(env, 'VOYAGE_API_KEY'),
          resendApiKey: readStringBinding(env, 'RESEND_API_KEY'),
          emailFrom: readStringBinding(env, 'EMAIL_FROM'),
          appUrl: readStringBinding(env, 'APP_URL'),
          supportEmail: readStringBinding(env, 'SUPPORT_EMAIL'),
          retentionPurgeEnabled: readStringBinding(
            env,
            'RETENTION_PURGE_ENABLED',
          ),
          clerkSecretKey: readStringBinding(env, 'CLERK_SECRET_KEY'),
          stripeSecretKey: readStringBinding(env, 'STRIPE_SECRET_KEY'),
          revenueCatRestApiKey: readStringBinding(
            env,
            'REVENUECAT_REST_API_KEY',
          ),
          memoryFactsDedupEnabled: readStringBinding(
            env,
            'MEMORY_FACTS_DEDUP_ENABLED',
          ),
          memoryFactsDedupThreshold: readStringBinding(
            env,
            'MEMORY_FACTS_DEDUP_THRESHOLD',
          ),
          maxDedupLlmCallsPerSession: readStringBinding(
            env,
            'MAX_DEDUP_LLM_CALLS_PER_SESSION',
          ),
          memoryFactsDedupRolloutPct: readStringBinding(
            env,
            'MEMORY_FACTS_DEDUP_ROLLOUT_PCT',
          ),
          // [CUT-B1] Identity cutover flag for the B1 Inngest functions.
          identityV2Enabled: readStringBinding(env, 'IDENTITY_V2_ENABLED'),
        };
        enterWithEnvBindings(bindings);
        return {
          beforeMemoization() {
            enterWithEnvBindings(bindings);
            beginStepDatabaseScope(stepDatabaseScope);
          },
          beforeExecution() {
            enterWithEnvBindings(bindings);
            beginStepDatabaseScope(stepDatabaseScope);
          },
          beforeResponse() {
            return closeStepDatabases(stepDatabaseScope);
          },
        };
      },
    };
  },
});

const piiScrubLogger = createLogger();

/**
 * PII egress: Scrubs denylisted PII payload keys from every outgoing
 * event before it reaches Inngest's third-party event store.
 *
 * This is a belt-and-braces runtime ratchet, not the primary fix: dispatch
 * sites no longer construct payloads with these fields (the consumers
 * rehydrate from the DB by reference). A scrub firing here therefore means a
 * regression re-introduced raw learner content into an event payload — it is
 * escalated to Sentry, never silent. Denylist: `INNGEST_PII_PAYLOAD_KEYS`
 * in @eduagent/schemas (the shared W3 scrubber's canonical home).
 *
 * Exported for unit tests.
 */
export function scrubOutgoingEventPayloads<
  T extends { name?: string; data?: unknown },
>(payloads: ReadonlyArray<T>): { payloads: T[] } {
  const scrubbed = payloads.map((payload) => {
    if (payload.data === undefined || payload.data === null) return payload;
    const result = scrubPiiPayload(payload.data);
    if (result.scrubbedPaths.length === 0) return payload;
    const err = new Error(
      `[pii-scrub] denylisted PII key(s) in outgoing Inngest event payload: ${result.scrubbedPaths.join(', ')}`,
    );
    piiScrubLogger.error(
      '[inngest] scrubbed PII key(s) from outgoing event payload',
      {
        event: payload.name,
        scrubbedPaths: result.scrubbedPaths,
      },
    );
    captureException(err, {
      extra: {
        site: 'inngest.piiScrubMiddleware',
        event: payload.name,
        scrubbedPaths: result.scrubbedPaths,
      },
    });
    return { ...payload, data: result.value };
  });
  return { payloads: scrubbed };
}

/**
 * PII egress: scrubs denylisted step-state keys from every step return (and
 * the function-level return) before Inngest memoizes it in its third-party
 * state store.
 *
 * Same belt-and-braces doctrine as `scrubOutgoingEventPayloads`: the primary
 * fix is that steps no longer return these fields (consumers rehydrate from
 * the DB by reference), so a scrub firing here means a regression
 * re-introduced minor-PII into memoized step state — escalated to Sentry,
 * never silent. Denylist: `INNGEST_PII_STEP_KEYS` in @eduagent/schemas.
 *
 * Exported for unit tests.
 */
export function scrubStepOutput(
  data: unknown,
  stepName: string | undefined,
): { result: { data: unknown } } | undefined {
  if (data === undefined || data === null) return undefined;
  const result = scrubPiiPayload(data, INNGEST_PII_STEP_KEYS);
  if (result.scrubbedPaths.length === 0) return undefined;
  const err = new Error(
    `[pii-scrub] denylisted PII key(s) in memoized Inngest step return: ${result.scrubbedPaths.join(', ')}`,
  );
  piiScrubLogger.error(
    '[inngest] scrubbed PII key(s) from memoized step return',
    {
      step: stepName,
      scrubbedPaths: result.scrubbedPaths,
    },
  );
  captureException(err, {
    extra: {
      site: 'inngest.piiScrubMiddleware.stepOutput',
      step: stepName,
      scrubbedPaths: result.scrubbedPaths,
    },
  });
  return { result: { data: result.value } };
}

const piiScrubMiddleware = new InngestMiddleware({
  name: 'PII Scrub Middleware',
  init() {
    return {
      onSendEvent() {
        return {
          transformInput({ payloads }) {
            return scrubOutgoingEventPayloads(payloads);
          },
        };
      },
      onFunctionRun() {
        return {
          transformOutput({ result, step }) {
            return scrubStepOutput(result.data, step?.displayName);
          },
        };
      },
    };
  },
});

export const inngest = new Inngest({
  id: 'eduagent',
  middleware: [envBindingMiddleware, piiScrubMiddleware],
});
