import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  ERROR_CODES,
  mentorNoticeDeferResponseSchema,
  mentorNoticeRecheckResponseSchema,
} from '@eduagent/schemas';

import { apiError } from '../errors';
import { isMentorNoticeEnabled } from '../config';
import { assertNotProxyMode } from '../middleware/proxy-guard';
import { withProfile, type RouteEnv } from '../route-utils/route-context';
import {
  deferMentorNotice,
  getLearningDayStart,
  getProfileTimeZone,
  MentorNoticeUnavailableError,
  startMentorNoticeRecheck,
} from '../services/mentor-notices';

type MentorNoticeRouteEnv = {
  Bindings: RouteEnv['Bindings'] & { MENTOR_NOTICE_ENABLED?: string };
  Variables: RouteEnv['Variables'];
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
      assertNotProxyMode(c);
      if (!isMentorNoticeEnabled(c.env.MENTOR_NOTICE_ENABLED)) {
        return apiError(
          c,
          404,
          ERROR_CODES.NOT_FOUND,
          'Mentor notice not found',
        );
      }
      const { db, profileId } = withProfile(c);
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
      assertNotProxyMode(c);
      if (!isMentorNoticeEnabled(c.env.MENTOR_NOTICE_ENABLED)) {
        return apiError(
          c,
          404,
          ERROR_CODES.NOT_FOUND,
          'Mentor notice not found',
        );
      }
      const { db, profileId } = withProfile(c);
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
