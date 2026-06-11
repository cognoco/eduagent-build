import { Inngest, InngestMiddleware } from 'inngest';
import type { Database } from '@eduagent/database';
import { INNGEST_PII_STEP_KEYS, scrubPiiPayload } from '@eduagent/schemas';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';
import {
  setDatabaseUrl,
  setVoyageApiKey,
  setResendApiKey,
  setEmailFrom,
  setAppUrl,
  setSupportEmail,
  setRetentionPurgeEnabled,
  setClerkSecretKey,
  setMemoryFactsDedupConfig,
  beginStepDatabaseScope,
  closeStepDatabases,
} from './helpers';

/**
 * Middleware that captures Cloudflare Workers env bindings and injects
 * DATABASE_URL and VOYAGE_API_KEY into module-level variables used by
 * getStepDatabase() and getStepVoyageApiKey().
 *
 * On CF Workers the bindings are only available through the request-scoped
 * env object. Inngest's middleware lifecycle runs before each function
 * invocation, giving us a hook to propagate the binding.
 */
const envBindingMiddleware = new InngestMiddleware({
  name: 'CF Env Binding Middleware',
  init() {
    return {
      onFunctionRun({ reqArgs }) {
        const stepDatabaseScope = new Set<Database>();
        // reqArgs[0] is the Request, reqArgs[1] is the CF env bindings object
        const env = reqArgs[1] as Record<string, unknown> | undefined;
        if (env && typeof env['DATABASE_URL'] === 'string') {
          setDatabaseUrl(env['DATABASE_URL']);
        }
        if (env && typeof env['VOYAGE_API_KEY'] === 'string') {
          setVoyageApiKey(env['VOYAGE_API_KEY']);
        }
        if (env && typeof env['RESEND_API_KEY'] === 'string') {
          setResendApiKey(env['RESEND_API_KEY']);
        }
        if (env && typeof env['EMAIL_FROM'] === 'string') {
          setEmailFrom(env['EMAIL_FROM']);
        }
        if (env && typeof env['APP_URL'] === 'string') {
          setAppUrl(env['APP_URL']);
        }
        if (env && typeof env['SUPPORT_EMAIL'] === 'string') {
          setSupportEmail(env['SUPPORT_EMAIL']);
        }
        if (env && typeof env['RETENTION_PURGE_ENABLED'] === 'string') {
          setRetentionPurgeEnabled(env['RETENTION_PURGE_ENABLED']);
        }
        if (env && typeof env['CLERK_SECRET_KEY'] === 'string') {
          setClerkSecretKey(env['CLERK_SECRET_KEY']);
        }
        if (env) {
          setMemoryFactsDedupConfig({
            enabled:
              typeof env['MEMORY_FACTS_DEDUP_ENABLED'] === 'string'
                ? env['MEMORY_FACTS_DEDUP_ENABLED']
                : undefined,
            threshold:
              typeof env['MEMORY_FACTS_DEDUP_THRESHOLD'] === 'string'
                ? env['MEMORY_FACTS_DEDUP_THRESHOLD']
                : undefined,
            maxLlmCalls:
              typeof env['MAX_DEDUP_LLM_CALLS_PER_SESSION'] === 'string'
                ? env['MAX_DEDUP_LLM_CALLS_PER_SESSION']
                : undefined,
            rolloutPct:
              typeof env['MEMORY_FACTS_DEDUP_ROLLOUT_PCT'] === 'string'
                ? env['MEMORY_FACTS_DEDUP_ROLLOUT_PCT']
                : undefined,
          });
        }
        return {
          beforeMemoization() {
            beginStepDatabaseScope(stepDatabaseScope);
          },
          beforeExecution() {
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
