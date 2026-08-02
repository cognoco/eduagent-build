import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import {
  nowOverflowResponseSchema,
  nowQuerySchema,
  nowResponseSchema,
} from '@eduagent/schemas';

import {
  requireCallerPersonId,
  withProfile,
  type RouteEnv,
} from '../route-utils/route-context';
import { assertCanReadProfile } from '../services/family-access';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';
import { resolveMentorNoticeVisibility } from '../services/mentor-notices';

type NowRouteEnv = {
  Bindings: RouteEnv['Bindings'] & {
    MENTOR_NOTICE_ENABLED?: string;
    // [WI-2627] Orders rollout observations across deployments.
    MENTOR_NOTICE_POLICY_REVISION?: string;
  };
  Variables: RouteEnv['Variables'] & {
    // [WI-2565] Required by assertCanReadProfile.
    account: { id: string } | undefined;
    // [WI-2498] Server-resolved caller identity (set app-wide by
    // accountMiddleware from the login→person binding). The selfhood conjunct
    // of the mentor-notice visibility predicate reads it; never
    // request-supplied.
    callerPersonId: string | undefined;
  };
};

// S4 widens `/now` from self-only to supporter hub/person scopes. Supporter
// visibility is derived at read time from active supportership edges.
export const nowRoutes = new Hono<NowRouteEnv>()
  .get('/now', zValidator('query', nowQuerySchema), async (c) => {
    const { db, profileId } = withProfile(c);
    // [WI-2565] withProfile proves only organization membership for the
    // selected profile; require self-or-guardian read authority (matching
    // GET /sessions/:sessionId/summary) before any notice-policy or feed read.
    await assertCanReadProfile(c, profileId);
    const query = c.req.valid('query');
    const callerPersonId =
      query.scope === 'self'
        ? c.get('callerPersonId')
        : requireCallerPersonId(c);
    // [WI-2498] V — rollout ∧ caller-is-subject ∧ subject consent. Replaces a
    // bare isMentorNoticeEnabled(env) read, which gated notice evidence on
    // the rollout flag alone and so leaked it into guardian selected-child
    // reads. now-feed's own `scope`/`visibility` guards still apply on top.
    // [WI-2504] The same call now also yields the policy epoch. `/now` is the
    // one notice-bearing projection the client PERSISTS, so this is where the
    // epoch goes on the wire: the device binds its cache entry to it and a
    // flag-off makes every already-persisted entry unreachable.
    const policy = await resolveMentorNoticeVisibility(
      c,
      profileId,
      c.env?.MENTOR_NOTICE_ENABLED,
      { proxyModeHeader: c.req.header('X-Proxy-Mode') },
      c.env?.MENTOR_NOTICE_POLICY_REVISION,
    );
    const feed = await buildNowFeed(db, profileId, query, {
      callerPersonId,
      mentorNoticeEnabled: policy.visible,
    });
    return c.json(
      nowResponseSchema.parse({
        ...feed,
        mentorNoticePolicyEpoch: policy.policyEpoch,
        // [WI-2627] The ORDERABLE form of the same answer. The epoch above
        // stays for already-shipped clients that key on it (and now carries the
        // revision, so a bump alone re-keys them); the observation adds the
        // revision a client needs to reject an out-of-order re-enable.
        mentorNoticePolicy: policy.observation,
      }),
    );
  })
  .get('/now/overflow', zValidator('query', nowQuerySchema), async (c) => {
    const { db, profileId } = withProfile(c);
    // [WI-2565] Same read-authority boundary as `/now` — overflow is the
    // second page of the same projection.
    await assertCanReadProfile(c, profileId);
    const query = c.req.valid('query');
    const callerPersonId =
      query.scope === 'self'
        ? c.get('callerPersonId')
        : requireCallerPersonId(c);
    // [WI-2498] Same predicate as `/now` — overflow is the second page of the
    // same projection and carries the same notice-bearing card kinds.
    // [WI-2504] …and therefore the same epoch, so an overflow read observed
    // after a flag-off keys the client's overflow query exactly as a feed read
    // does. The overflow page itself is not persisted.
    const policy = await resolveMentorNoticeVisibility(
      c,
      profileId,
      c.env?.MENTOR_NOTICE_ENABLED,
      { proxyModeHeader: c.req.header('X-Proxy-Mode') },
      c.env?.MENTOR_NOTICE_POLICY_REVISION,
    );
    const overflow = await buildNowOverflow(db, profileId, query, {
      callerPersonId,
      mentorNoticeEnabled: policy.visible,
    });
    return c.json(
      nowOverflowResponseSchema.parse({
        ...overflow,
        mentorNoticePolicyEpoch: policy.policyEpoch,
        mentorNoticePolicy: policy.observation,
      }),
    );
  });
