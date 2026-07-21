// ---------------------------------------------------------------------------
// [WI-2498] Mentor-notice visibility predicate — V
// ---------------------------------------------------------------------------
//
// SECURITY (P1 — privacy). Mentor-notice payloads carry a learner's private
// misconception, exact evidence, concept, and correction hint. Before this
// module the read projections gated notice data on the rollout flag alone
// (`isMentorNoticeEnabled(env)`, called independently at ~8 sites) plus the
// request's own `scope`/`visibility` shape. Neither of those is an
// actor-versus-subject rule: a guardian (or an owner acting on a child, or
// any org member holding a read edge) who selects the learner's profile via
// X-Profile-Id issues a `scope=self` read and received the learner's notice
// evidence — the named red case, reachable with NO X-Proxy-Mode header at
// all.
//
// V is the single server-authoritative answer to "may notice data be
// projected for this subject on this request?" and is the conjunction of:
//
//   1. ROLLOUT   — the mentor-notice rollout flag is enabled.
//   2. SELFHOOD  — the authenticated caller person IS the selected subject
//                  profile's person.
//   3. CONSENT   — the SUBJECT currently holds the consent required to
//                  process their LLM-derived learning data. Same predicate
//                  (`isLlmExchangeConsentAllowed`) that gates notice
//                  GENERATION in session-exchange.ts's assertExchangeConsent,
//                  so the read gate and the write gate agree by construction.
//
// SELFHOOD IS DERIVED SERVER-SIDE, NEVER FROM A HEADER. `callerPersonId` is
// set app-wide by accountMiddleware from the authenticated Clerk login→person
// binding (middleware/account.ts) and is never request-supplied.
// `subjectProfileId` is the profile profileScopeMiddleware RESOLVED and
// verified against the caller's organization. A client controls only WHICH
// profile is selected — it cannot make the comparison true for a profile that
// is not its own person. So no header or query parameter can ESTABLISH V:
//   - X-Profile-Id = a child's id  → subject ≠ caller person → V false.
//   - X-Profile-Id omitted         → auto-resolves to the org OWNER profile;
//                                     a non-owner caller then fails selfhood,
//                                     an owner caller IS that person (their
//                                     own data) → correct either way.
//   - X-Proxy-Mode: 'true'         → TIGHTENS only (forces V false); its
//                                     absence never relaxes anything, because
//                                     the header is not an input to the
//                                     selfhood conjunct at all.
// This mirrors the server-derived posture assertNotProxyMode already
// established for the write side (middleware/proxy-guard.ts).
//
// SCOPE NOTE. V answers "may notice data be projected for THIS subject?" — it
// does not decide which subject a projection is about. A projection whose
// data-subject can differ from the selected profile (the Now feed's
// `scope=person` supporter reads) must ALSO keep its own scope guard, which
// is what makes `caller === selected profile` equivalent to
// `caller === data subject`. V is the conjunct that was missing; the scope
// guards are conjuncts that were already correct.
//
// V gates the notice ENRICHMENT, not read authority: a guardian legitimately
// reading a charge's session summary still receives the summary, just without
// `mentorNotice`. Denial belongs to assertCanReadProfile, not here.
//
// [WI-2504 EXTENSION POINT] The sibling item adds a server-authoritative
// policy EPOCH so that a rollout flag-off invalidates already-persisted client
// projections. That epoch belongs HERE, as a value derived alongside this
// predicate (same inputs: rollout + consent + subject), surfaced to clients so
// a cache entry can be bound to it. Extend `resolveMentorNoticeVisibility`
// below to return `{ visible, policyEpoch }` and thread the epoch out through
// the same call sites — do NOT introduce a second policy seam.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';

import { isMentorNoticeEnabled } from '../../config';
import { isLlmExchangeConsentAllowed } from '../identity-v2/consent-status-v2';

/**
 * Narrow getter shape the predicate needs from the request context. Mirrors
 * family-access.ts's own source types so this service stays framework-free
 * and route files do not have to import Hono's per-route Env types.
 */
export type MentorNoticeVisibilitySource = {
  get(key: 'db'): Database;
  /** Authenticated caller's own person id — set by accountMiddleware from the
   *  login→person binding. NEVER request-supplied. */
  get(key: 'callerPersonId'): string | undefined;
};

/**
 * Client-supplied signals that may only ever TIGHTEN V. Passing a value here
 * can turn V false; nothing here can turn it true.
 */
export type MentorNoticeVisibilityRequestSignals = {
  /** Raw `X-Proxy-Mode` request header, if any. */
  proxyModeHeader?: string | undefined;
};

/**
 * Resolve V for `subjectProfileId` on the current request.
 *
 * `rolloutValue` is the raw `MENTOR_NOTICE_ENABLED` binding — passed in rather
 * than read here so this stays a pure function of its inputs and every call
 * site keeps using the route's own `c.env`.
 */
export async function resolveMentorNoticeVisibility(
  source: MentorNoticeVisibilitySource,
  subjectProfileId: string,
  rolloutValue: string | undefined,
  signals: MentorNoticeVisibilityRequestSignals = {},
): Promise<boolean> {
  // 1. Rollout. Cheapest conjunct and the one that short-circuits the DB read
  //    when the feature is off entirely.
  if (!isMentorNoticeEnabled(rolloutValue)) return false;

  // Client tightening. Checked before the DB read purely as an optimisation —
  // it can only ever produce `false`, so its position carries no authority.
  if (signals.proxyModeHeader === 'true') return false;

  // 2. Selfhood — server-derived on both sides (see the file header).
  const callerPersonId = source.get('callerPersonId');
  if (!callerPersonId || callerPersonId !== subjectProfileId) return false;

  // 3. Subject consent. Applied to the SUBJECT, not the caller — the data
  //    belongs to the subject. `isLlmExchangeConsentAllowed` is
  //    "no rows → allowed": only an explicit WITHDRAWN denies, so a normal
  //    consented learner is unaffected.
  return isLlmExchangeConsentAllowed(source.get('db'), subjectProfileId);
}
