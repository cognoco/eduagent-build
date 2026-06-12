// ---------------------------------------------------------------------------
// Webhook Signature-Failure Escalation Guard
//
// Cloudflare Workers runtime note:
//   Workers use an isolate-per-request model. Module-level state MAY persist
//   across requests within the same isolate (warm re-use), but is never shared
//   across isolates or Workers instances. This guard is therefore per-isolate
//   best-effort: it detects sustained failure within a single warm isolate's
//   lifetime and fires one Sentry escalation. Under cold-start conditions or
//   when the platform spawns multiple isolates, each isolate maintains its own
//   independent counter. This is documented and accepted in the PR (WI-646).
//
//   A durable alternative (Inngest-based cross-isolate counter) is possible but
//   would require a new Inngest function, a KV or D1 backend, and adds latency
//   to the hot path. The per-isolate approach is sufficient for detecting
//   sustained misconfiguration without adding request-path overhead.
//
// Threshold: FAILURE_THRESHOLD failures within WINDOW_MS milliseconds trigger
//   exactly one Sentry escalation per contiguous failure episode per isolate.
//   The escalation flag is suppressed until the window drains to zero
//   (all in-window timestamps evict), at which point a fresh episode can
//   escalate once more. Under a continuous failure stream the window never
//   drains, so the flag stays suppressed for the entire episode — one alert
//   per misconfiguration incident. Sentry-side grouping deduplicates any
//   duplicate events that arrive from multiple concurrent isolates.
// ---------------------------------------------------------------------------

import { captureException } from '../sentry';

/** Number of signature failures within the window before escalating. */
export const SIGNATURE_FAILURE_THRESHOLD = 5;

/** Sliding window duration in milliseconds. */
export const SIGNATURE_FAILURE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

interface EscalatorState {
  /** Timestamps (ms) of recent failures still within the window. */
  timestamps: number[];
  /** Whether an escalation has already been fired for the current window. */
  escalationFired: boolean;
}

export interface SignatureFailureEscalator {
  /**
   * Record a signature-verification failure and escalate to Sentry when the
   * sustained-failure threshold is exceeded within the configured window.
   *
   * Isolated failures (< threshold) emit no Sentry event. Sustained failures
   * (>= threshold within the window) emit exactly one escalation per window,
   * then reset so the next sustained window also fires once.
   *
   * Must not throw — any internal error is swallowed so the webhook response
   * path is never affected.
   *
   * @param nowMs - Current time in milliseconds (injectable for testing).
   */
  record(nowMs?: number): void;

  /** Reset internal state. Exposed for test isolation only. */
  __resetForTesting(): void;
}

/**
 * Create an independent signature-failure escalator for a single webhook
 * endpoint. Each escalator has isolated state so Stripe and Resend failure
 * counters do not cross-contaminate.
 *
 * @param sentryContext - The `context` field written to the Sentry extra bag
 *   (e.g. `'stripe.webhook.sustained_signature_failure'`).
 * @param errorMessage - The error message string sent to Sentry.
 */
export function createSignatureFailureEscalator(
  sentryContext: string,
  errorMessage: string,
): SignatureFailureEscalator {
  const state: EscalatorState = {
    timestamps: [],
    escalationFired: false,
  };

  return {
    record(nowMs: number = Date.now()): void {
      try {
        // Evict timestamps outside the current window.
        state.timestamps = state.timestamps.filter(
          (ts) => nowMs - ts < SIGNATURE_FAILURE_WINDOW_MS,
        );

        // If eviction cleared all timestamps, the previous window has fully
        // expired. Reset the escalation flag so the next sustained burst can
        // also fire once.
        if (state.timestamps.length === 0) {
          state.escalationFired = false;
        }

        state.timestamps.push(nowMs);

        if (
          state.timestamps.length >= SIGNATURE_FAILURE_THRESHOLD &&
          !state.escalationFired
        ) {
          state.escalationFired = true;
          captureException(new Error(errorMessage), {
            extra: {
              context: sentryContext,
              failureCount: state.timestamps.length,
              windowMs: SIGNATURE_FAILURE_WINDOW_MS,
              threshold: SIGNATURE_FAILURE_THRESHOLD,
            },
          });
          // escalationFired stays true until all in-window timestamps evict
          // (on the next call after the window expires), preventing duplicate
          // escalations within the same sustained-failure window.
        }
      } catch {
        // Swallow — escalation-path failures must never affect the webhook handler.
      }
    },

    __resetForTesting(): void {
      state.timestamps = [];
      state.escalationFired = false;
    },
  };
}

// ---------------------------------------------------------------------------
// Pre-built escalators — one per webhook endpoint.
// ---------------------------------------------------------------------------

/**
 * Stripe webhook signature-failure escalator.
 * Use `stripeSignatureFailureEscalator.record()` in the Stripe webhook catch block.
 */
export const stripeSignatureFailureEscalator = createSignatureFailureEscalator(
  'stripe.webhook.sustained_signature_failure',
  'Stripe webhook signature verification failure rate exceeded threshold',
);

/**
 * Resend webhook signature-failure escalator.
 * Use `resendSignatureFailureEscalator.record()` in the Resend webhook verification block.
 */
export const resendSignatureFailureEscalator = createSignatureFailureEscalator(
  'resend.webhook.sustained_signature_failure',
  'Resend webhook signature verification failure rate exceeded threshold',
);

/**
 * Convenience shorthand for `stripeSignatureFailureEscalator.record()`.
 * Used in stripe-webhook.ts for brevity; prefer the named escalator when
 * adding new call sites so the source is unambiguous.
 */
export function recordSignatureFailure(nowMs?: number): void {
  stripeSignatureFailureEscalator.record(nowMs);
}
