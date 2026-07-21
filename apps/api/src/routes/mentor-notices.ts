import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  ERROR_CODES,
  mentorNoticeDeferResponseSchema,
  mentorNoticeRecheckResponseSchema,
} from '@eduagent/schemas';

import { apiError } from '../errors';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile, type RouteEnv } from '../route-utils/route-context';
import {
  deferMentorNotice,
  getLearningDayStart,
  getProfileTimeZone,
  MentorNoticeUnavailableError,
  resolveMentorNoticeVisibility,
  startMentorNoticeRecheck,
} from '../services/mentor-notices';

type MentorNoticeRouteEnv = {
  Bindings: RouteEnv['Bindings'] & { MENTOR_NOTICE_ENABLED?: string };
  Variables: RouteEnv['Variables'] & {
    // [WI-2498] See routes/now.ts — server-resolved caller identity, read by
    // the mentor-notice visibility predicate's selfhood conjunct.
    callerPersonId: string | undefined;
  };
};

const noticeParamsSchema = z.object({ noticeId: z.string().uuid() });

function unavailable(
  c: Parameters<typeof apiError>[0],
  err: MentorNoticeUnavailableError,
) {
  return err.reason === 'not_found'
    ? apiError(c, 404, ERROR_CODES.NOT_FOUND, err.message)
    : apiError(c, 409, ERROR_CODES.CONFLICT, err.message);
}

export const mentorNoticeRoutes = new Hono<MentorNoticeRouteEnv>()
  .post(
    '/mentor-notices/:noticeId/recheck',
    zValidator('param', noticeParamsSchema),
    async (c) => {
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [WI-2498] V replaces the bare rollout read here. It is strictly
      // narrower (adds caller-is-subject and subject consent) and these
      // responses echo notice data, so routing them through the one predicate
      // keeps every notice-bearing boundary on a single seam.
      // [WI-2504] Same seam; the epoch is derived here but not surfaced —
      // these are mutations, not persisted projections, and a flag-off
      // answers 404 rather than returning a body to invalidate.
      if (
        !(
          await resolveMentorNoticeVisibility(
            c,
            profileId,
            c.env.MENTOR_NOTICE_ENABLED,
            { proxyModeHeader: c.req.header('X-Proxy-Mode') },
          )
        ).visible
      ) {
        return apiError(
          c,
          404,
          ERROR_CODES.NOT_FOUND,
          'Mentor notice not found',
        );
      }
      try {
        const result = await startMentorNoticeRecheck(
          db,
          profileId,
          c.req.valid('param').noticeId,
        );
        return c.json(mentorNoticeRecheckResponseSchema.parse(result));
      } catch (err) {
        if (err instanceof MentorNoticeUnavailableError)
          return unavailable(c, err);
        throw err;
      }
    },
  )
  .post(
    '/mentor-notices/:noticeId/defer',
    zValidator('param', noticeParamsSchema),
    async (c) => {
      await assertNotProxyMode(c);
      const { db, profileId } = withProfile(c);
      // [WI-2498] V replaces the bare rollout read here. It is strictly
      // narrower (adds caller-is-subject and subject consent) and these
      // responses echo notice data, so routing them through the one predicate
      // keeps every notice-bearing boundary on a single seam.
      // [WI-2504] Same seam; the epoch is derived here but not surfaced —
      // these are mutations, not persisted projections, and a flag-off
      // answers 404 rather than returning a body to invalidate.
      if (
        !(
          await resolveMentorNoticeVisibility(
            c,
            profileId,
            c.env.MENTOR_NOTICE_ENABLED,
            { proxyModeHeader: c.req.header('X-Proxy-Mode') },
          )
        ).visible
      ) {
        return apiError(
          c,
          404,
          ERROR_CODES.NOT_FOUND,
          'Mentor notice not found',
        );
      }
      try {
        const now = new Date();
        const timezone = await getProfileTimeZone(db, profileId);
        const result = await deferMentorNotice(
          db,
          profileId,
          c.req.valid('param').noticeId,
          {
            now,
            learningDayStart: getLearningDayStart(now, timezone),
          },
        );
        return c.json(mentorNoticeDeferResponseSchema.parse(result));
      } catch (err) {
        if (err instanceof MentorNoticeUnavailableError)
          return unavailable(c, err);
        throw err;
      }
    },
  );
