import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { consentRequestSchema, consentResponseSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import {
  requestConsent,
  processConsentResponse,
  getProfileConsentState,
} from '../services/consent';
import { notFound } from '../errors';
import { inngest } from '../inngest/client';

type ConsentRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    APP_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };
  Variables: { user: AuthUser; db: Database; profileId: string };
};

export const consentRoutes = new Hono<ConsentRouteEnv>()
  .post(
    '/consent/request',
    zValidator('json', consentRequestSchema),
    async (c) => {
      const db = c.get('db');
      const input = c.req.valid('json');
      const appUrl = c.env.APP_URL ?? 'https://app.eduagent.com';
      const consentState = await requestConsent(db, input, appUrl, {
        resendApiKey: c.env.RESEND_API_KEY,
        emailFrom: c.env.EMAIL_FROM,
      });

      // Dispatch Inngest event for reminder workflow
      await inngest.send({
        name: 'app/consent.requested',
        data: {
          profileId: consentState.profileId,
          parentEmail: consentState.parentEmail,
          consentType: consentState.consentType,
          timestamp: new Date().toISOString(),
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
          return notFound(c, 'Invalid consent token');
        }
        throw error;
      }
    }
  )
  .get('/consent/my-status', async (c) => {
    const profileId = c.get('profileId');
    if (!profileId) {
      return c.json({
        consentStatus: null,
        parentEmail: null,
        consentType: null,
      });
    }
    const db = c.get('db');
    const state = await getProfileConsentState(db, profileId);
    return c.json({
      consentStatus: state?.status ?? null,
      parentEmail: state?.parentEmail ?? null,
      consentType: state?.consentType ?? null,
    });
  });
