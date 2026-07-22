import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';

import {
  nowOverflowResponseSchema,
  nowQuerySchema,
  nowResponseSchema,
} from '@eduagent/schemas';

import { withProfile, type RouteEnv } from '../route-utils/route-context';
import { buildNowFeed, buildNowOverflow } from '../services/now-feed';
import { resolveMentorNoticeVisibility } from '../services/mentor-notices';

type NowRouteEnv = {
  Bindings: RouteEnv['Bindings'] & { MENTOR_NOTICE_ENABLED?: string };
  Variables: RouteEnv['Variables'] & {
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
    const query = c.req.valid('query');
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
    );
    const feed = await buildNowFeed(db, profileId, query, {
      mentorNoticeEnabled: policy.visible,
    });
    return c.json(
      nowResponseSchema.parse({
        ...feed,
        mentorNoticePolicyEpoch: policy.policyEpoch,
      }),
    );
  })
  .get('/now/overflow', zValidator('query', nowQuerySchema), async (c) => {
    const { db, profileId } = withProfile(c);
    const query = c.req.valid('query');
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
    );
    const overflow = await buildNowOverflow(db, profileId, query, {
      mentorNoticeEnabled: policy.visible,
    });
    return c.json(
      nowOverflowResponseSchema.parse({
        ...overflow,
        mentorNoticePolicyEpoch: policy.policyEpoch,
      }),
    );
  });
