import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { consentRequestSchema, consentResponseSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import { requestConsent, processConsentResponse } from '../services/consent';
import { inngest } from '../inngest/client';

type ConsentRouteEnv = {
  Bindings: { DATABASE_URL: string; CLERK_JWKS_URL?: string };
  Variables: { user: AuthUser; db: Database };
};

export const consentRoutes = new Hono<ConsentRouteEnv>()
  .post(
    '/consent/request',
    zValidator('json', consentRequestSchema),
    async (c) => {
      const db = c.get('db');
      const input = c.req.valid('json');
      const consentState = await requestConsent(db, input);

      // Dispatch Inngest event for reminder workflow
      await inngest.send({
        name: 'app/consent.requested',
        data: {
          profileId: consentState.profileId,
          parentEmail: consentState.parentEmail,
          consentType: consentState.consentType,
        },
      });

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
      const db = c.get('db');
      const input = c.req.valid('json');

      try {
        await processConsentResponse(db, input.token, input.approved);
        return c.json({
          message: input.approved ? 'Consent granted' : 'Consent denied',
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'Invalid consent token'
        ) {
          return c.json(
            { code: 'NOT_FOUND', message: 'Invalid consent token' },
            404
          );
        }
        throw error;
      }
    }
  );
