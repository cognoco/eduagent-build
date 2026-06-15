// ---------------------------------------------------------------------------
// Metering Middleware — Sprint 9 Phase 4 + Pre-Feature Hardening + Dual-Cap
// Enforces quota on billable LLM-consuming routes.
// Reads from KV cache first, falls back to DB, backfills KV on miss.
//
// Fixes applied:
//   CR1 — Free-tier users auto-provisioned (ensureFreeSubscription)
//   CR3 — KV cache stores subscriptionId (no DB hit on cache hit)
//   I4  — KV operations wrapped in try/catch
//   I6  — Trailing slash tolerated in route matching
//   I7  — KV cache updated after decrement
//
// Dual-cap: free tier enforces 10 questions/day AND 50 questions/month.
// Paid tiers: monthly limit only (dailyLimit = null).
// ---------------------------------------------------------------------------

import { createMiddleware } from 'hono/factory';
import type { Context } from 'hono';
import type { Database } from '@eduagent/database';
import { ERROR_CODES } from '@eduagent/schemas';
import type {
  SubscriptionTier,
  SubscriptionStatus,
  MaybeReplayResponse,
} from '@eduagent/schemas';
import type { Account } from '../services/account';
import type { LLMTier } from '../services/subscription';
import type { ProfileMeta } from './profile-scope';
import { assertNotProxyMode } from './proxy-guard';
import {
  ensureFreeSubscription,
  getQuotaPool,
  decrementQuota,
  getTopUpCreditsRemaining,
  safeRefundQuota,
  getEffectiveAccessForSubscription,
  getOrProvisionProfileQuotaUsage,
  MeteringError,
} from '../services/billing';
// [CUT-B3 / WI-693] v2 store reads for the DB-fallback path, selected by the
// flag. The quota-satellite hot-path ops (decrementQuota, getTopUpCreditsRemaining,
// safeRefundQuota) are store-agnostic and unchanged.
import {
  ensureFreeSubscriptionV2,
  getQuotaPoolV2,
  getEffectiveAccessForSubscriptionV2,
  getOrProvisionProfileQuotaUsageV2,
} from '../services/billing/billing-v2';
import { isIdentityV2Enabled } from '../config';
import { getTierConfig } from '../services/subscription';
import { checkQuota } from '../services/metering';
import {
  buildIdempotencyCacheKey,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from '../services/idempotency-marker';
import { lookupAssistantTurnState } from '../services/idempotency-assistant-state';
import {
  readSubscriptionStatus,
  writeSubscriptionStatus,
  deleteSubscriptionStatus,
  type CachedSubscriptionStatus,
} from '../services/kv';
import { createLogger } from '../services/logger';
import { captureException } from '../services/sentry';
import { safeSend } from '../services/safe-non-core';
import { inngest } from '../inngest/client';

const logger = createLogger();

/**
 * [CR-2026-05-19-M1] Escalate a KV failure to Sentry so ops can filter and
 * alert on billing KV outages. `logger.warn` alone cannot answer "how many
 * times did this fire in the last 24 h" in Sentry queries.
 *
 * Not exported — shared only by the three safeXxxKV helpers in this file.
 */
function captureKvFailure(
  err: unknown,
  ctx: { op: 'read' | 'write' | 'delete'; accountId: string },
): void {
  captureException(err, {
    tags: {
      surface: 'billing.kv',
      op: ctx.op,
    },
    extra: {
      accountId: ctx.accountId,
    },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeteringEnv = {
  Bindings: {
    SUBSCRIPTION_KV?: KVNamespace;
    IDEMPOTENCY_KV?: KVNamespace;
    // [CUT-B3 / WI-693] Identity-foundation cutover flag — selects the v2
    // subscription store in the DB-fallback path. 'false'/unset in every
    // deployed env until the WI-586 flip.
    IDENTITY_V2_ENABLED?: string;
  };
  Variables: {
    db: Database;
    account: Account;
    profileId: string | undefined;
    profileMeta: ProfileMeta | undefined;
    subscriptionId: string;
    subscriptionTier: SubscriptionTier;
    llmTier: LLMTier;
    /**
     * [CR-2026-05-19-C6] Pool that funded the decrement, so refund paths
     * (LLM failure handlers in routes/sessions.ts) can return the credit to
     * the same pool instead of inflating monthly quota by 1 per failure.
     */
    quotaDecrementSource: 'monthly' | 'top_up';
    /** Set when quotaDecrementSource === 'top_up'. */
    quotaDecrementTopUpCreditId?: string;
    /** Quota model that funded the decrement; refund paths must not re-resolve it. */
    quotaDecrementQuotaModel?: 'per-profile' | 'shared-pool';
    /**
     * [WI-776 / WP-7] Identity-cutover flag that the decrement ran under.
     * Handler-owned self-refund paths (routes/sessions.ts, routes/assessments.ts)
     * MUST thread this into safeRefundQuota so the refund's ownership cross-check
     * uses the SAME store (v2 vs legacy) the decrement used. Without it the
     * refund defaults to the legacy profiles/subscriptions join, which under
     * flag-on/post-DROP fails — and the handler would mark quotaRefunded=true on
     * a refund that never happened, charging the user for a no-LLM branch.
     */
    quotaIdentityV2?: boolean;
    /** Remaining billable turns after the current decrement. */
    quotaRemainingTurns?: number;
    /** Remaining-turn ratio against the user's currently enforced cap. */
    quotaFractionRemaining?: number;
    /**
     * [WI-133] Belt-and-braces flag flipped after either refund path
     * (try/catch on handler throw, or post-`next()` status >= 400). Prevents
     * double-refund if both paths fire in the same request — which should
     * not happen in practice (throw replaces the response so the
     * status-based branch will not fire), but the flag protects against
     * unexpected interactions.
     */
    quotaRefunded?: boolean;
  };
};

// ---------------------------------------------------------------------------
// LLM-consuming route patterns
// The middleware only applies to routes that consume LLM exchanges.
// I6 fix: optional trailing slash (/?)
//
// [BUG-763] Routes are split by HTTP method-eligibility instead of relying on
// a `regex.source.includes('quiz')` string match in the dispatcher. Renaming
// or restructuring the quiz routes (e.g. adding a /quiz/rounds/coaching path)
// would silently break the previous filter — typed grouping prevents that.
// ---------------------------------------------------------------------------

// Routes that consume LLM exchanges on BOTH GET and POST. Currently every
// session-scoped LLM endpoint that may be invoked via SSE/GET counts here.
const SESSION_MESSAGE_STREAM_PATTERNS = [
  /\/sessions\/[^/]+\/messages\/?$/,
  /\/sessions\/[^/]+\/stream\/?$/,
];

export const LLM_ROUTE_PATTERNS_ANY_METHOD = [
  ...SESSION_MESSAGE_STREAM_PATTERNS,
  // [BUG-623 / A-6] generateRecallBridge calls the LLM but was missing from
  // this list, so any authenticated user could call recall-bridge in a tight
  // loop and burn unlimited LLM capacity at zero cost. Meter it like any
  // other LLM-driven session endpoint.
  /\/sessions\/[^/]+\/recall-bridge\/?$/,
  // [BUG-653 / A-5] evaluateSessionDepth runs an LLM call (depth gate +
  // topic detection). Without metering, an authenticated client could
  // spam this endpoint and burn unbounded LLM capacity at zero cost.
  /\/sessions\/[^/]+\/evaluate-depth\/?$/,
  // [WI-149 / DS-060] explainTopicOrdering is GET but invokes routeAndCall
  // to produce a natural-language explanation for a topic's curriculum
  // position. Authenticated abuse possible without metering (same class as
  // recall-bridge / evaluate-depth). Path uses UUIDs for subject and topic.
  /\/subjects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/curriculum\/topics\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/explain\/?$/,
];

// Routes that consume LLM exchanges only on POST. Quiz round generation and
// dictation are billable on POST; their GET counterparts (history, stats,
// completion) are DB-only and must NOT decrement quota.
export const LLM_ROUTE_PATTERNS_POST_ONLY = [
  /\/quiz\/rounds\/?$/,
  /\/quiz\/rounds\/prefetch\/?$/,
  // [CRIT-1] Dictation LLM-consuming routes — all POST-only.
  // generate + prepare-homework use rung 1, review uses rung 2 (vision).
  /\/dictation\/generate\/?$/,
  /\/dictation\/prepare-homework\/?$/,
  /\/dictation\/review\/?$/,
  // [BUG-93 / A1-CRIT] /subjects/resolve calls the LLM to normalize a
  // free-text subject name. Before fix it was missing here AND missing
  // requireProfileId at the route level, letting any authenticated user
  // spam the resolver in a tight loop at zero cost. Same class as
  // recall-bridge (BUG-623) and evaluate-depth (BUG-653). Route-level
  // requireProfileId is in routes/subjects.ts.
  /\/subjects\/resolve\/?$/,
  // Retry filing re-runs the LLM-backed filing flow. Match only UUIDs so a
  // malformed path falls through to the route validator without burning quota.
  /\/sessions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/retry-filing\/?$/,
  // [WI-141 / DS-052] Manual book topic generation invokes the LLM via
  // generateBookTopics. Authenticated abuse possible without metering — same
  // class as BUG-93 (subjects/resolve). Path uses UUIDs for subject and book.
  /\/subjects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/books\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/generate-topics\/?$/,
  // [WI-149 / DS-060] Curriculum LLM-consuming POST endpoints.
  // - /topics with mode=preview calls previewCurriculumTopic (LLM); mode=create
  //   is DB-only. Pattern matches all POSTs to /topics — create-mode requests
  //   over-bill by 1, accepted as a small false-positive vs. the security
  //   risk of unmetered preview calls. The route is the trust boundary.
  // - /challenge regenerates the curriculum via generateCurriculum (LLM).
  /\/subjects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/curriculum\/topics\/?$/,
  /\/subjects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/curriculum\/challenge\/?$/,
  // [WI-154 / DS-065] POST /filing invokes fileToLibrary which calls the LLM
  // to determine library placement. /filing/request-retry only dispatches an
  // Inngest event (no direct LLM call) and is intentionally not metered here.
  /\/filing\/?$/,
  // [WI-155 / DS-066] POST /ocr runs vision OCR through an LLM provider
  // (Gemini Vision via OcrProvider.extractText). Authenticated abuse possible
  // without metering.
  /\/ocr\/?$/,
  // [WI-157 / DS-068] /learner-profile/tell endpoints call parseLearnerInput
  // which invokes routeAndCall to classify free-text learner input.
  // Both the self-mode (/tell) and parent-proxy (/:profileId/tell) variants
  // reach the same LLM service.
  /\/learner-profile\/tell\/?$/,
  /\/learner-profile\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/tell\/?$/,
  // [WI-168 / DS-079] /retention/recall-test invokes evaluateRecallQuality
  // (LLM). Race + cooldown serialization (WI-234) lands in a separate WP;
  // allowlist coverage is the prerequisite.
  /\/retention\/recall-test\/?$/,
  // [WI-178 / DS-089] POST /subjects (create) calls detectLanguageSubject
  // which invokes routeAndCall. POST /subjects/classify calls classifySubject
  // (LLM). /subjects/resolve is already in the allowlist above (BUG-93).
  /\/subjects\/?$/,
  /\/subjects\/classify\/?$/,
  // [WI-247 / DS-148] POST /sessions/:sessionId/summary calls submitSummary
  // which evaluates the learner's "Your Words" via the LLM. The service-level
  // idempotency short-circuit for re-submitted accepted summaries lands in a
  // separate WP; allowlist coverage is the prerequisite.
  /\/sessions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/summary\/?$/,
  // [WI-136 / DS-038] POST /assessments/:assessmentId/answer invokes
  // evaluateAssessmentAnswer (LLM). The terminal-replay guard at the service
  // layer lands in a separate WP; allowlist coverage is the prerequisite.
  /\/assessments\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/answer\/?$/,
  // [WI-258 / DS-169] POST /subjects/:subjectId/book-suggestions/topup —
  // the side-effecting top-up generation path. The previous shape was a
  // GET ?topup=1 query parameter which the path-based allowlist could not
  // distinguish from the DB-only GET counterpart. Splitting into an
  // explicit POST topup route makes metering coverage trivial.
  /\/subjects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/book-suggestions\/topup\/?$/,
  // [F-023 / WI-575] POST /sessions/:sessionId/quick-check invokes
  // evaluateQuickCheckAnswer which calls routeAndCall (LLM). Without metering,
  // any authenticated user can call this in a tight loop and burn unbounded LLM
  // capacity. Path uses a UUID session ID to avoid matching non-LLM session routes.
  /\/sessions\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/quick-check\/?$/,
];

const PROFILE_REQUIRED_BEFORE_METERING_PATTERNS = [
  /\/dictation\/prepare-homework\/?$/,
  /\/dictation\/review\/?$/,
];

const IDEMPOTENT_SESSION_ROUTE_PATTERNS = SESSION_MESSAGE_STREAM_PATTERNS;

function isLlmRoute(path: string, method: string): boolean {
  // GET methods never decrement quota for POST-only endpoints. The any-method
  // list is what bills GET requests (SSE streams, recall-bridge, etc.).
  if (method === 'GET') {
    return LLM_ROUTE_PATTERNS_ANY_METHOD.some((pattern) => pattern.test(path));
  }
  return (
    LLM_ROUTE_PATTERNS_ANY_METHOD.some((pattern) => pattern.test(path)) ||
    LLM_ROUTE_PATTERNS_POST_ONLY.some((pattern) => pattern.test(path))
  );
}

function shouldReturnProfileRequiredBeforeMetering(path: string): boolean {
  return PROFILE_REQUIRED_BEFORE_METERING_PATTERNS.some((pattern) =>
    pattern.test(path),
  );
}

function isIdempotentSessionRoute(path: string): boolean {
  return IDEMPOTENT_SESSION_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(path),
  );
}

function profileRequiredResponse(c: Context<MeteringEnv>): Response {
  return c.json(
    {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Profile required — no profile resolved for this request',
    },
    400,
  );
}

function shouldRefundAfterHandler(status: number): boolean {
  return status >= 400;
}

function withQuotaHeaders(
  response: Response,
  headersToSet: {
    remaining: number;
    warningLevel: string;
    remainingDaily: number | null;
  },
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Quota-Remaining', String(headersToSet.remaining));
  headers.set('X-Quota-Warning-Level', headersToSet.warningLevel);
  if (headersToSet.remainingDaily !== null) {
    headers.set('X-Daily-Remaining', String(headersToSet.remainingDaily));
  } else {
    headers.delete('X-Daily-Remaining');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function maybeReplayIdempotentSessionRequest(
  c: Context<MeteringEnv>,
  db: Database,
  profileId: string | undefined,
): Promise<Response | null> {
  if (!isIdempotentSessionRoute(c.req.path)) return null;

  const key = c.req.header('Idempotency-Key')?.trim();
  if (!key) return null;

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return c.json(
      {
        code: ERROR_CODES.INVALID_IDEMPOTENCY_KEY,
        message: `Idempotency-Key exceeds ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      },
      400,
    );
  }

  if (!profileId) return null;

  const kv = c.env?.IDEMPOTENCY_KV;
  if (!kv) return null;

  let existing: string | null = null;
  try {
    existing = await kv.get(
      buildIdempotencyCacheKey(profileId, 'session', key),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('[metering] Idempotency replay lookup failed', {
      event: 'metering.idempotency_replay_lookup_failed',
      profileId,
      error: errorMessage,
    });
    // [CR-2026-05-21-047] Silent recovery in billing without a structured metric
    // is banned (AGENTS.md "Fix Development Rules"). On KV outage every idempotent
    // session request is processed twice if the client retries — including
    // double-decrementing the quota pool. Emit via safeSend so dispatch failure
    // is captured in Sentry but never throws and never breaks the user action.
    const account = c.get('account') as { id: string } | undefined;
    await safeSend(
      () =>
        inngest.send({
          // orphan-allow: structured telemetry signal required by AGENTS.md
          // ("silent recovery in billing must emit a structured metric"). The
          // KV-outage recovery is in-line (returns null → request processed
          // without replay protection); escalation is via logger.warn. The
          // event is a dashboard-queryable signal for KV-outage frequency — no
          // remediation handler is needed.
          name: 'app/idempotency.preflight_lookup_failed',
          data: {
            accountId: account?.id ?? null,
            profileId: profileId ?? null,
            route: c.req.path,
            error: errorMessage,
            timestamp: new Date().toISOString(),
          },
        }),
      'metering.idempotency_replay_lookup_failed',
      { profileId, route: c.req.path },
    );
    return null;
  }

  if (!existing) return null;

  const state = await lookupAssistantTurnState({
    db,
    profileId,
    flow: 'session',
    key,
  });

  c.header('Idempotency-Replay', 'true');
  // [CCR PR #281 / B68] Type the response body against the shared schema
  // (`MaybeReplayResponse` in @eduagent/schemas) so server + mobile cannot
  // drift. Mobile's `IdempotencyReplayBody` is the same shape and now
  // re-exports this type.
  const body: MaybeReplayResponse = {
    replayed: true,
    clientId: key,
    status: 'persisted',
    assistantTurnReady: state.assistantTurnReady,
    latestExchangeId: state.latestExchangeId,
  };
  return c.json(body);
}

// ---------------------------------------------------------------------------
// Upgrade options builder
// ---------------------------------------------------------------------------

function buildUpgradeOptions(currentTier: SubscriptionTier): Array<{
  tier: 'plus' | 'family' | 'pro';
  monthlyQuota: number;
  priceMonthly: number;
}> {
  const tiers = ['plus', 'family', 'pro'] as const;
  return tiers
    .filter((t) => t !== currentTier)
    .map((t) => {
      const config = getTierConfig(t);
      return {
        tier: t,
        monthlyQuota: config.monthlyQuota,
        priceMonthly: config.priceMonthly,
      };
    });
}

function nextDailyResetAt(now = new Date()): string {
  const reset = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      1,
      0,
      0,
      0,
    ),
  );
  if (reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 1);
  }
  return reset.toISOString();
}

function resolveQuotaResetAt(input: {
  reason: 'daily' | 'monthly';
  cycleResetAt: string | null;
}): string {
  return input.reason === 'daily'
    ? nextDailyResetAt()
    : (input.cycleResetAt ?? new Date().toISOString());
}

// ---------------------------------------------------------------------------
// KV helpers with error resilience (I4 fix)
// ---------------------------------------------------------------------------

// [T-11 / BUG-753] Silent recovery is banned by project policy: any catch
// block in billing/auth code that swallows an error must emit a structured
// log line so the failure rate is queryable. Without this, a sustained KV
// outage manifests only as elevated DB load — invisible to oncall.
//
// `event` field is the metric name; downstream log pipeline aggregates by it.
async function safeReadKV(
  kv: KVNamespace,
  accountId: string,
): Promise<CachedSubscriptionStatus | null> {
  try {
    return await readSubscriptionStatus(kv, accountId);
  } catch (error) {
    logger.warn('[metering] KV read failed — falling back to DB', {
      event: 'metering.kv_read_failed',
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    captureKvFailure(error, { op: 'read', accountId });
    return null; // KV unavailable — fall through to DB
  }
}

async function safeWriteKV(
  kv: KVNamespace,
  accountId: string,
  status: CachedSubscriptionStatus,
): Promise<void> {
  try {
    await writeSubscriptionStatus(kv, accountId, status);
  } catch (error) {
    logger.warn('[metering] KV write failed — DB remains source of truth', {
      event: 'metering.kv_write_failed',
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    captureKvFailure(error, { op: 'write', accountId });
  }
}

// [CCR PR #281 / B67] After `safeRefundQuota` undoes a decrement, the KV
// snapshot still encodes the *pre-refund* `usedThisMonth` / `usedToday`. Any
// follow-up request served from cache would over-count usage and could return
// a spurious 402 QUOTA_EXCEEDED. The cheapest correct fix is to invalidate
// the cache entry — the next request falls through to DB and backfills KV
// with the post-refund counters via the existing miss path. Silent recovery
// is banned: on delete failure we emit a structured warn so the failure
// rate is queryable (AGENTS.md → "Silent recovery without escalation is
// banned").
async function safeDeleteKV(kv: KVNamespace, accountId: string): Promise<void> {
  try {
    await deleteSubscriptionStatus(kv, accountId);
  } catch (error) {
    logger.warn(
      '[metering] KV delete failed — cache may serve stale counters until TTL',
      {
        event: 'metering.kv_delete_failed',
        accountId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    captureKvFailure(error, { op: 'delete', accountId });
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export const meteringMiddleware = createMiddleware<MeteringEnv>(
  async (c, next) => {
    // Only apply to LLM-consuming routes (method-aware to avoid charging GET)
    if (!isLlmRoute(c.req.path, c.req.method)) {
      await next();
      return;
    }

    // Fail closed: LLM routes MUST have an authenticated account.
    // If auth middleware failed to populate account (misconfigured route
    // stack), reject rather than silently bypassing quota enforcement.
    const account = c.get('account');
    if (!account) {
      return c.json(
        { code: 'UNAUTHORIZED', message: 'Authentication required' },
        401,
      );
    }

    const db = c.get('db');
    const kv = c.env?.SUBSCRIPTION_KV;
    const freeTier = getTierConfig('free');
    const profileMeta = c.get('profileMeta');
    const profileId = c.get('profileId');
    const proxyModeHeader = c.req.header('X-Proxy-Mode') === 'true';
    // [WI-776 / WP-7] Single read of the cutover flag for the whole metering
    // lifecycle. The quota decrement/increment ownership cross-check selects the
    // v2 twin (person × membership × subscription) under the flag; the legacy
    // path (flag-off) is byte-identical. Metering is a synchronous request-path
    // check — no scheduled/persisted decision spans the flag flip (atomic per
    // request), so no schedule-time mode-pinning is needed here (ic-orch-005).
    const identityV2 = isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED);

    if (
      (!profileId || !profileMeta) &&
      !proxyModeHeader &&
      shouldReturnProfileRequiredBeforeMetering(c.req.path)
    ) {
      return profileRequiredResponse(c);
    }

    // Metering runs before route handlers. Run the proxy guard here too so a
    // parent viewing a child profile cannot burn quota on a request that the
    // endpoint would later reject.
    assertNotProxyMode(c);

    if (!profileId) {
      return profileRequiredResponse(c);
    }

    const idempotentReplay = await maybeReplayIdempotentSessionRequest(
      c,
      db,
      profileId,
    );
    if (idempotentReplay) return idempotentReplay;

    // 1. Try KV cache for fast quota check (I4: wrapped in try/catch)
    let cached: CachedSubscriptionStatus | null = null;
    if (kv) {
      cached = await safeReadKV(kv, account.id);
    }

    let tier: SubscriptionTier;
    let effectiveAccessTier: SubscriptionTier;
    let billingAccess: 'current' | 'free_fallback';
    let quotaModel: 'per-profile' | 'shared-pool';
    let profileRole: 'owner' | 'child' | null = null;
    let monthlyLimit: number;
    let usedThisMonth: number;
    let dailyLimit: number | null;
    let usedToday: number;
    let subscriptionId: string;
    let subscriptionStatus: SubscriptionStatus;
    let cycleResetAt: string | null = null;

    // Don't trust KV when it reports daily exhaustion — the daily cron
    // resets used_today in DB but cannot invalidate KV entries (no KV binding).
    // Fall through to DB so the first post-reset request gets fresh data.
    if (
      cached &&
      cached.dailyLimit !== null &&
      cached.usedToday >= cached.dailyLimit
    ) {
      cached = null;
    }

    // [BUG-115] Same protection for monthly exhaustion. resetMonthlyQuota
    // (called at billing-cycle rollover from cron / subscription state
    // transitions) clears used_this_month in DB but cannot invalidate KV
    // entries from outside the request path. Without this fall-through, a
    // user whose KV reports monthlyLimit=100/usedThisMonth=100 keeps getting
    // 402 QUOTA_EXCEEDED for up to one KV TTL after the DB-level reset —
    // billing cycle has rolled over but the user is still blocked. The DB has
    // the authoritative cycleResetAt; the cache does not, so we pessimistically
    // drop to DB whenever KV reports monthly exhaustion. The immediate atomic
    // decrementQuota call below will re-establish a clean KV write derived
    // from the post-reset DB state.
    if (
      cached &&
      cached.monthlyLimit > 0 &&
      cached.usedThisMonth >= cached.monthlyLimit
    ) {
      cached = null;
    }

    if (
      cached &&
      getTierConfig(cached.effectiveAccessTier ?? cached.tier).quotaModel ===
        'per-profile'
    ) {
      cached = null;
    }

    if (cached) {
      // KV hit — use cached values (CR3: subscriptionId now in cache)
      subscriptionId = cached.subscriptionId;
      tier = cached.tier;
      effectiveAccessTier = cached.effectiveAccessTier ?? cached.tier;
      billingAccess = cached.billingAccess ?? 'current';
      quotaModel = getTierConfig(effectiveAccessTier).quotaModel;
      monthlyLimit = cached.monthlyLimit;
      usedThisMonth = cached.usedThisMonth;
      dailyLimit = cached.dailyLimit;
      usedToday = cached.usedToday;
      subscriptionStatus = cached.status;
    } else {
      // KV miss — fall back to DB
      // [CUT-B3 / WI-693] Select the v2 subscription store under the flag. The
      // request-context account.id equals organization.id under the flag, so the
      // same id keys both stores. Legacy path (flag-off) is byte-identical.
      // (identityV2 is hoisted to the metering body — see [WI-776 / WP-7].)
      // CR1: Auto-provision free-tier subscription if none exists
      const subscription = identityV2
        ? await ensureFreeSubscriptionV2(db, account.id)
        : await ensureFreeSubscription(db, account.id);
      subscriptionId = subscription.id;
      tier = subscription.tier;
      subscriptionStatus = subscription.status;
      const access = identityV2
        ? await getEffectiveAccessForSubscriptionV2(db, subscriptionId)
        : await getEffectiveAccessForSubscription(db, subscriptionId);
      effectiveAccessTier = access?.effectiveAccessTier ?? subscription.tier;
      billingAccess = access?.billingAccess ?? 'current';
      quotaModel = getTierConfig(effectiveAccessTier).quotaModel;

      if (quotaModel === 'per-profile') {
        const profileQuota = identityV2
          ? await getOrProvisionProfileQuotaUsageV2(
              db,
              subscriptionId,
              profileId,
              { tier: effectiveAccessTier },
            )
          : await getOrProvisionProfileQuotaUsage(
              db,
              subscriptionId,
              profileId,
              { tier: effectiveAccessTier },
            );
        if (!profileQuota) {
          return c.json(
            {
              code: ERROR_CODES.INTERNAL_ERROR,
              message: 'Profile quota state could not be resolved.',
            },
            500,
          );
        }
        profileRole = profileQuota.role;
        monthlyLimit = profileQuota.monthlyLimit;
        usedThisMonth = profileQuota.usedThisMonth;
        dailyLimit = profileQuota.dailyLimit;
        usedToday = profileQuota.usedToday;
        cycleResetAt = profileQuota.cycleResetAt;
      } else {
        const quota = identityV2
          ? await getQuotaPoolV2(db, subscriptionId)
          : await getQuotaPool(db, subscriptionId);
        monthlyLimit = quota?.monthlyLimit ?? freeTier.monthlyQuota;
        usedThisMonth = quota?.usedThisMonth ?? 0;
        dailyLimit = quota?.dailyLimit ?? null;
        usedToday = quota?.usedToday ?? 0;
        cycleResetAt = quota?.cycleResetAt ?? null;
      }

      // Backfill KV cache on miss (I4: wrapped in try/catch)
      if (kv && quotaModel === 'shared-pool') {
        await safeWriteKV(kv, account.id, {
          subscriptionId,
          tier,
          effectiveAccessTier,
          billingAccess,
          status: subscriptionStatus,
          monthlyLimit,
          usedThisMonth,
          dailyLimit,
          usedToday,
        });
      }
    }

    // 2. Query actual top-up credits for accurate quota check.
    // [F-135] On per-profile tiers, top-up credits belong to the owner
    // profile. Never run the unscoped subscription-wide sum for a non-owner —
    // it returns the owner's purchased balance, which would leak into the
    // child's 402 payload and quota fraction. Non-owners get 0 (they cannot
    // draw on top-ups in decrementQuota either). Mirrors the /usage route
    // masking in routes/billing.ts.
    const topUpCreditsRemaining =
      quotaModel === 'per-profile' && profileRole !== 'owner'
        ? 0
        : await getTopUpCreditsRemaining(
            db,
            subscriptionId,
            new Date(),
            quotaModel === 'per-profile' ? profileId : undefined,
          );

    // 3. Check quota using pure business logic (checks both daily + monthly)
    const result = checkQuota({
      monthlyLimit,
      usedThisMonth,
      topUpCreditsRemaining,
      dailyLimit,
      usedToday,
    });

    // Fast-path rejection: skip atomic decrement if quota is clearly exhausted
    if (!result.allowed) {
      const isDailyExceeded =
        result.dailyRemaining !== null && result.dailyRemaining <= 0;
      return c.json(
        {
          code: ERROR_CODES.QUOTA_EXCEEDED,
          message: isDailyExceeded
            ? "You've reached your daily question limit. Come back tomorrow for more!"
            : 'Monthly quota exceeded. Upgrade your plan or purchase top-up credits.',
          details: {
            tier,
            effectiveAccessTier,
            quotaModel,
            profileRole,
            reason: isDailyExceeded ? ('daily' as const) : ('monthly' as const),
            resetsAt: resolveQuotaResetAt({
              reason: isDailyExceeded ? 'daily' : 'monthly',
              cycleResetAt,
            }),
            monthlyLimit,
            usedThisMonth,
            dailyLimit,
            usedToday,
            topUpCreditsRemaining,
            upgradeOptions: buildUpgradeOptions(effectiveAccessTier),
          },
        },
        402,
      );
    }

    // 4. Attempt to decrement quota (atomic, handles top-up FIFO fallback + daily guard)
    let decrement: Awaited<ReturnType<typeof decrementQuota>>;
    try {
      decrement = await decrementQuota(
        db,
        subscriptionId,
        profileId,
        identityV2,
      );
    } catch (err) {
      if (err instanceof MeteringError) {
        return c.json({ error: err.code, meta: err.meta }, 500);
      }
      throw err;
    }

    if (!decrement.success) {
      const isDailyExceeded = decrement.source === 'daily_exceeded';
      const reason = isDailyExceeded
        ? ('daily' as const)
        : ('monthly' as const);
      return c.json(
        {
          code: ERROR_CODES.QUOTA_EXCEEDED,
          message: isDailyExceeded
            ? "You've reached your daily question limit. Come back tomorrow for more!"
            : 'Monthly quota exceeded. Upgrade your plan or purchase top-up credits.',
          details: {
            tier,
            effectiveAccessTier,
            quotaModel,
            profileRole: decrement.profileRole ?? profileRole,
            reason,
            resetsAt:
              decrement.resetsAt ??
              resolveQuotaResetAt({ reason, cycleResetAt }),
            monthlyLimit: decrement.monthlyLimit ?? monthlyLimit,
            usedThisMonth: decrement.usedThisMonth ?? usedThisMonth,
            dailyLimit: decrement.dailyLimit ?? dailyLimit,
            usedToday: decrement.usedToday ?? usedToday,
            topUpCreditsRemaining,
            upgradeOptions: buildUpgradeOptions(effectiveAccessTier),
          },
        },
        402,
      );
    }

    // Store subscriptionId for potential refund on LLM failure
    c.set('subscriptionId', subscriptionId);
    c.set('subscriptionTier', effectiveAccessTier);
    // [CR-2026-05-19-C6] Thread the decrement source so refund paths can
    // credit the correct pool.
    c.set(
      'quotaDecrementSource',
      decrement.source === 'top_up' ? 'top_up' : 'monthly',
    );
    c.set('quotaDecrementQuotaModel', decrement.quotaModel ?? quotaModel);
    // [WI-776 / WP-7] Expose the cutover flag the decrement ran under so
    // handler-owned self-refund paths use the same store's ownership check.
    c.set('quotaIdentityV2', identityV2);
    if (decrement.topUpCreditId) {
      c.set('quotaDecrementTopUpCreditId', decrement.topUpCreditId);
    }

    // [F-135] Same owner-only gate as the pre-check read above. A 'top_up'
    // decrement is only reachable for an owner (consumeOwnerTopUpCredit) or a
    // shared pool, but keep the invariant explicit rather than rely on that.
    const topUpRemainingAfterDecrement =
      decrement.source === 'top_up'
        ? quotaModel === 'per-profile' && profileRole !== 'owner'
          ? 0
          : await getTopUpCreditsRemaining(
              db,
              subscriptionId,
              new Date(),
              quotaModel === 'per-profile' ? profileId : undefined,
            )
        : decrement.remainingTopUp;
    const quotaRemainingTurns =
      decrement.remainingDaily === null
        ? decrement.remainingMonthly + topUpRemainingAfterDecrement
        : Math.min(
            decrement.remainingMonthly + topUpRemainingAfterDecrement,
            decrement.remainingDaily,
          );
    const quotaDenominator =
      dailyLimit === null
        ? monthlyLimit + topUpCreditsRemaining
        : Math.min(monthlyLimit + topUpCreditsRemaining, dailyLimit);
    c.set('quotaRemainingTurns', quotaRemainingTurns);
    c.set(
      'quotaFractionRemaining',
      quotaDenominator > 0 ? quotaRemainingTurns / quotaDenominator : 0,
    );

    // Expose the LLM tier so session route handlers can thread it to the LLM router.
    // Plus keeps the base tier standard; session exchange routing promotes its
    // included advanced entitlement only from rung 4 upward. Per-profile
    // premium flags unlock the same rung-gated behavior for Pro seats and AI
    // upgrade add-ons.
    const baseLlmTier = getTierConfig(effectiveAccessTier).llmTier;
    // [CUT-B3 / WI-693] `has_premium_llm` is derived, not stored (§1.3) — no
    // application code ever wrote `profiles.has_premium_llm` (verified). Under v2
    // the field is always the derived `false`, so the override is dead. Drop it
    // on the v2 path (llmTier := base, derived from the subscription tier);
    // keep the legacy override branch byte-identical.
    c.set(
      'llmTier',
      isIdentityV2Enabled(c.env?.IDENTITY_V2_ENABLED)
        ? baseLlmTier
        : profileMeta?.hasPremiumLlm
          ? 'premium'
          : baseLlmTier,
    );

    // [WI-133] Wrap handler invocation in try/catch so a thrown error refunds
    // quota before propagating. Without this, any uncaught handler exception
    // (LLM provider 5xx, DB connection drop, validation throw inside a
    // service) decrements the quota pool but never refunds, silently burning
    // user quota for failures that never produced LLM output.
    try {
      await next();
    } catch (err) {
      // The handler's Response may not exist on throw — treat absence as
      // not-skip. When present, an explicit `Quota-Refund: skip` header
      // suppresses middleware refund (handlers that already refunded
      // explicitly use this to avoid double-refund — e.g. streaming routes
      // that refund inside the SSE reducer).
      const skipHeader =
        (c.res as Response | undefined)?.headers?.get('Quota-Refund') ===
        'skip';
      if (!skipHeader && !c.get('quotaRefunded')) {
        // Preserve BUG-503 ordering on the throw path: KV delete BEFORE DB
        // refund so a concurrent request cannot read the stale pre-refund
        // KV snapshot and decrement again.
        if (kv) {
          await safeDeleteKV(kv, account.id);
        }
        await safeRefundQuota(db, subscriptionId, {
          route: `metering.${c.req.method}.${c.req.path}`,
          profileId,
          source: decrement.source === 'top_up' ? 'top_up' : 'monthly',
          quotaModel: decrement.quotaModel ?? quotaModel,
          topUpCreditId: decrement.topUpCreditId,
          identityV2,
        });
        c.set('quotaRefunded', true);
      }
      // Always re-throw — the middleware does not swallow handler errors.
      // The global error handler still gets the original exception unchanged.
      throw err;
    }

    if (shouldRefundAfterHandler(c.res.status)) {
      // [WI-133] Honor the `Quota-Refund: skip` escape hatch on the
      // status-based branch too, so a handler that returned 5xx after
      // refunding explicitly inside its own reducer doesn't get double-
      // refunded by the middleware.
      const skipHeader = c.res.headers.get('Quota-Refund') === 'skip';
      if (skipHeader || c.get('quotaRefunded')) {
        return;
      }
      // [BUG-503] Cache-aside invalidate-BEFORE-write: delete KV snapshot
      // FIRST, then refund the DB. Without this ordering, a concurrent request
      // could read the stale post-decrement KV between the DB refund write and
      // the KV delete, decrement again, and write doubly-decremented counters
      // back — persisting a phantom "used +1" state for up to the 24h TTL.
      // Deleting first means concurrent reads either see the post-refund DB
      // state (via re-fetch on cache miss) or the fresh post-delete state —
      // both correct.
      //
      // [CCR PR #281 / B67] Strip the in-flight quota headers (already handled
      // by skipping `withQuotaHeaders` on this branch) AND invalidate the KV
      // snapshot — the pre-refund counters live there and would feed the next
      // request a stale, post-decrement view of usage. Without this, a 400 on
      // a metered route refunds the DB but leaves a "user is one question
      // closer to the cap" snapshot in KV until the 24h TTL expires.
      if (kv) {
        await safeDeleteKV(kv, account.id);
      }
      await safeRefundQuota(db, subscriptionId, {
        route: `metering.${c.req.method}.${c.req.path}`,
        profileId,
        // [CR-2026-05-19-C6] Refund to the same pool the decrement consumed.
        source: decrement.source === 'top_up' ? 'top_up' : 'monthly',
        quotaModel: decrement.quotaModel ?? quotaModel,
        topUpCreditId: decrement.topUpCreditId,
        identityV2,
      });
      c.set('quotaRefunded', true);
      return;
    }

    // [CR-2026-05-21-050] When the decrement consumed a top-up credit,
    // `decrement.remainingTopUp` is only the remaining count of the single
    // FIFO-oldest batch we just touched. If the user holds multiple unexpired
    // top-up batches, summing remainingMonthly(=0) + that single-batch value
    // under-reports — UI shows "0 questions left" while the user has
    // hundreds across other unspent batches. Aggregate across all batches
    // for the top-up case, and reuse the same aggregate for the KV cache
    // below so the header and the cached snapshot can't disagree.
    const topUpRemainingAggregate = topUpRemainingAfterDecrement;

    const headerRemaining =
      decrement.remainingMonthly + topUpRemainingAggregate;

    c.res = withQuotaHeaders(c.res, {
      remaining: headerRemaining,
      warningLevel: result.warningLevel,
      remainingDaily: decrement.remainingDaily,
    });

    // I7 fix: Update KV cache after decrement so next request sees fresh count.
    // Derive from the atomic DB result (decrement.remainingMonthly/Daily) to
    // avoid stale-read races under concurrency — two requests reading the same
    // cached count would each write original+1, understating actual usage.
    //
    // [F-146 / WI-701] If the handler self-refunded (quotaRefunded=true on a
    // 200 response — e.g. the assessments app-help early-return path), writing
    // the pre-refund decremented counters here would leave KV stale until the
    // next natural TTL expiry. Delete the entry instead so the next request
    // falls through to DB and gets the correct post-refund counts.
    if (kv && quotaModel === 'shared-pool') {
      if (c.get('quotaRefunded')) {
        await safeDeleteKV(kv, account.id);
      } else {
        // Single formula for both branches: `remainingMonthly` is already 0 in
        // the top-up path, so `monthlyLimit - 0 - topUpRemainingAggregate` is
        // the same accounting as the monthly-source path. Use the SAME aggregate
        // we wrote into the header — earlier this used the single-batch
        // `decrement.remainingTopUp`, which over-counted usage when multiple
        // unexpired batches existed and could push the cached `usedThisMonth`
        // close to or past `monthlyLimit` for the duration of the KV TTL.
        const atomicUsedMonth =
          monthlyLimit - decrement.remainingMonthly - topUpRemainingAggregate;
        const atomicUsedToday =
          dailyLimit !== null && decrement.remainingDaily !== null
            ? dailyLimit - decrement.remainingDaily
            : usedToday + 1;
        await safeWriteKV(kv, account.id, {
          subscriptionId,
          tier,
          effectiveAccessTier,
          billingAccess,
          status: subscriptionStatus,
          monthlyLimit,
          usedThisMonth: atomicUsedMonth,
          dailyLimit,
          usedToday: atomicUsedToday,
        });
      }
    }
    return;
  },
);
