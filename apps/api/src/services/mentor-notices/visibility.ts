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
// [WI-2504] POLICY EPOCH — the same seam, extended, not a second one.
//
// V answers "may notice data be projected NOW?". It cannot invalidate a
// projection a client already persisted: a mobile Now-feed cache entry written
// while the rollout flag was ON survives a flag-off, because nothing on the
// wire tells the device that the policy it observed has changed. The epoch is
// that missing signal — a stable, server-authoritative string derived from
// EXACTLY the inputs V already evaluates, in the same order, from the same
// branch structure. It is not a parallel policy: `visible` is true for exactly
// one epoch value (`MENTOR_NOTICE_EPOCH_VISIBLE`), so the two can never
// disagree.
//
// Every branch that denies V gets its OWN epoch value rather than a shared
// "hidden" token. That matters for cache binding: a proxy-tightened read and a
// flag-off read must not key to the same cache entry, or one could serve the
// other's projection. Binding a cache entry to the epoch therefore binds it to
// actor-vs-subject selfhood, subject consent, and rollout state at once (the
// subject profile is separately part of the client's cache key).
//
// The epoch is DERIVED at all six notice-bearing call sites (routes/now.ts ×2,
// routes/sessions.ts summary, routes/mentor-notices.ts recheck+defer) because
// they all call this one function. It is only put ON THE WIRE by the `/now`
// and `/now/overflow` responses — those carry the only client projection that
// is PERSISTED across launches (apps/mobile/src/lib/now-feed-cache.ts). The
// other surfaces hold no persisted state to invalidate: with the flag off the
// summary simply carries no notice receipt and recheck/defer return 404. Do
// not widen response schemas that have nothing to invalidate.
// ---------------------------------------------------------------------------

import type { Database } from '@eduagent/database';
import type { MentorNoticePolicyObservation } from '@eduagent/schemas';

import {
  isMentorNoticeEnabled,
  resolveMentorNoticePolicyRevision,
} from '../../config';
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
 * [WI-2504] Policy-epoch vocabulary. `v1` is the SHAPE version — bump it only
 * if the meaning of the suffixes changes, never to force an invalidation (a
 * policy change already produces a different suffix).
 *
 * The client treats these as OPAQUE: it stores whichever string it last
 * observed and keys its persisted projection on it. It never parses them, so
 * adding a branch here can only ever produce a cache miss, never a leak.
 */
const EPOCH_PREFIX = 'notice-policy-v1';
/** Rollout flag off — the operational kill switch. */
export const MENTOR_NOTICE_EPOCH_ROLLOUT_OFF = `${EPOCH_PREFIX}:off` as const;
/** Rollout on, but the caller declared an explicit proxy session. */
export const MENTOR_NOTICE_EPOCH_PROXY = `${EPOCH_PREFIX}:on:proxy` as const;
/** Rollout on, but the caller person is not the selected subject. */
export const MENTOR_NOTICE_EPOCH_OTHER_SUBJECT =
  `${EPOCH_PREFIX}:on:other-subject` as const;
/** Rollout on, caller IS the subject, but the subject withdrew LLM consent. */
export const MENTOR_NOTICE_EPOCH_CONSENT_WITHDRAWN =
  `${EPOCH_PREFIX}:on:self:withdrawn` as const;
/** The ONLY epoch SUFFIX under which notice data may be projected. */
export const MENTOR_NOTICE_EPOCH_VISIBLE =
  `${EPOCH_PREFIX}:on:self:consented` as const;

/**
 * [WI-2627] Fold the policy revision INTO the opaque epoch.
 *
 * The revision is not decoration on the side of the epoch — it is part of the
 * cache-binding token, so a revision bump alone re-keys every persisted
 * projection even on a client too old to read the observation object. That
 * makes a revision bump a usable invalidation lever by itself, which is what
 * lets the server PR land ahead of the client store without being inert for
 * already-shipped builds.
 *
 * Placed as a SEGMENT of the same opaque string rather than a second key
 * component because the client contract is "store the string you were given
 * and key on it"; a second component would be a second thing to get wrong.
 */
export function withPolicyRevision(epoch: string, revision: number): string {
  return `${EPOCH_PREFIX}:r${revision}${epoch.slice(EPOCH_PREFIX.length)}`;
}

/**
 * [WI-2504] The server's answer for one request: whether notice data may be
 * projected, and the policy epoch that answer was derived under. `visible` is
 * true if and only if `policyEpoch === MENTOR_NOTICE_EPOCH_VISIBLE`.
 */
export type MentorNoticePolicy = {
  visible: boolean;
  policyEpoch: string;
  /**
   * [WI-2627] The observation to put on the wire. `projectionEpoch` is the same
   * string as `policyEpoch` — one derivation, two names, so no caller can emit
   * an observation whose epoch disagrees with the epoch it gated on.
   */
  observation: MentorNoticePolicyObservation;
};

/**
 * [WI-2627] Assemble the policy result from the ONE derivation.
 *
 * `visible` is `epochSuffix === MENTOR_NOTICE_EPOCH_VISIBLE`, and
 * `projectionEpoch` is the revision-folded form of that same suffix, so the
 * three can never disagree — there is no path that returns a visible policy
 * under a hidden epoch, or an observation for a different epoch than the one
 * this request was gated on.
 */
function policy(
  epochSuffix: string,
  revision: number,
  rolloutEnabled: boolean,
): MentorNoticePolicy {
  const projectionEpoch = withPolicyRevision(epochSuffix, revision);
  return {
    visible: epochSuffix === MENTOR_NOTICE_EPOCH_VISIBLE,
    policyEpoch: projectionEpoch,
    observation: {
      rolloutRevision: revision,
      rolloutEnabled,
      projectionEpoch,
    },
  };
}

/**
 * Resolve V (and its epoch) for `subjectProfileId` on the current request.
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
  policyRevisionValue?: string | undefined,
): Promise<MentorNoticePolicy> {
  // [WI-2627] The revision is resolved ONCE, before any branch, so every branch
  // below reports the same revision. A branch-local resolve would let two
  // conjuncts of the same request disagree about what deployment they are.
  const revision = resolveMentorNoticePolicyRevision(policyRevisionValue);

  // 1. Rollout. Cheapest conjunct and the one that short-circuits the DB read
  //    when the feature is off entirely.
  const rolloutEnabled = isMentorNoticeEnabled(rolloutValue);
  if (!rolloutEnabled) {
    return policy(MENTOR_NOTICE_EPOCH_ROLLOUT_OFF, revision, false);
  }

  // Client tightening. Checked before the DB read purely as an optimisation —
  // it can only ever produce `false`, so its position carries no authority.
  // [WI-2627] Note `rolloutEnabled: true` on this and the two branches below:
  // the ROLLOUT is on, this REQUEST is merely tightened. Reporting these as
  // rollout-disabled would let one proxy read latch the client's monotonic
  // store off for the same learner's own legitimate read at the same revision.
  if (signals.proxyModeHeader === 'true') {
    return policy(MENTOR_NOTICE_EPOCH_PROXY, revision, true);
  }

  // 2. Selfhood — server-derived on both sides (see the file header).
  const callerPersonId = source.get('callerPersonId');
  if (!callerPersonId || callerPersonId !== subjectProfileId) {
    return policy(MENTOR_NOTICE_EPOCH_OTHER_SUBJECT, revision, true);
  }

  // 3. Subject consent. Applied to the SUBJECT, not the caller — the data
  //    belongs to the subject. `isLlmExchangeConsentAllowed` is
  //    "no rows → allowed": only an explicit WITHDRAWN denies, so a normal
  //    consented learner is unaffected.
  const consented = await isLlmExchangeConsentAllowed(
    source.get('db'),
    subjectProfileId,
  );
  return consented
    ? policy(MENTOR_NOTICE_EPOCH_VISIBLE, revision, true)
    : policy(MENTOR_NOTICE_EPOCH_CONSENT_WITHDRAWN, revision, true);
}
