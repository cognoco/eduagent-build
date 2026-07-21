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
    const feed = await buildNowFeed(db, profileId, query, {
      // [WI-2498] V — rollout ∧ caller-is-subject ∧ subject consent. Replaces a
      // bare isMentorNoticeEnabled(env) read, which gated notice evidence on
      // the rollout flag alone and so leaked it into guardian selected-child
      // reads. now-feed's own `scope`/`visibility` guards still apply on top.
      mentorNoticeEnabled: await resolveMentorNoticeVisibility(
        c,
        profileId,
        c.env?.MENTOR_NOTICE_ENABLED,
        { proxyModeHeader: c.req.header('X-Proxy-Mode') },
      ),
    });
    return c.json(nowResponseSchema.parse(feed));
  })
  .get('/now/overflow', zValidator('query', nowQuerySchema), async (c) => {
    const { db, profileId } = withProfile(c);
    const query = c.req.valid('query');
    const overflow = await buildNowOverflow(db, profileId, query, {
      // [WI-2498] Same predicate as `/now` — overflow is the second page of the
      // same projection and carries the same notice-bearing card kinds.
      mentorNoticeEnabled: await resolveMentorNoticeVisibility(
        c,
        profileId,
        c.env?.MENTOR_NOTICE_ENABLED,
        { proxyModeHeader: c.req.header('X-Proxy-Mode') },
      ),
    });
    return c.json(nowOverflowResponseSchema.parse(overflow));
  });
