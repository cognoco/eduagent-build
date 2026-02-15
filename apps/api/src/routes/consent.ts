import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { consentRequestSchema, consentResponseSchema } from '@eduagent/schemas';

export const consentRoutes = new Hono()
  .post(
    '/consent/request',
    zValidator('json', consentRequestSchema),
    async (c) => {
      const input = c.req.valid('json');
      return c.json(
        {
          message: 'Consent request sent to parent',
          consentType: input.consentType,
        },
        201
      );
    }
  )
  .post(
    '/consent/respond',
    zValidator('json', consentResponseSchema),
    async (c) => {
      const input = c.req.valid('json');
      return c.json({
        message: input.approved ? 'Consent granted' : 'Consent denied',
      });
    }
  );
