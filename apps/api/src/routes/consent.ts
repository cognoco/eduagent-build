import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { consentRequestSchema, consentResponseSchema } from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import {
  requestConsent,
  processConsentResponse,
  getProfileConsentState,
  getChildConsentForParent,
  revokeConsent,
  restoreConsent,
} from '../services/consent';
import { notFound, forbidden } from '../errors';
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
      // NOTE: parentEmail is intentionally omitted — PII must not be in event payloads.
      // The consent-reminders function looks up parentEmail from the DB.
      await inngest.send({
        name: 'app/consent.requested',
        data: {
          profileId: consentState.profileId,
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
  })

  // Get consent status for a child (parent view, includes respondedAt for countdown)
  .get('/consent/:childProfileId/status', async (c) => {
    const db = c.get('db');
    const parentProfileId = c.get('profileId');
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await getChildConsentForParent(
        db,
        childProfileId,
        parentProfileId
      );
      if (!state) {
        return c.json({
          consentStatus: null,
          respondedAt: null,
          consentType: null,
        });
      }
      return c.json({
        consentStatus: state.status,
        respondedAt: state.respondedAt,
        consentType: state.consentType,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not authorized')) {
        return forbidden(c, 'Not authorized to view consent for this profile');
      }
      throw error;
    }
  })

  // Revoke consent for a child (parent-initiated, GDPR Art. 7(3))
  .put('/consent/:childProfileId/revoke', async (c) => {
    const db = c.get('db');
    const parentProfileId = c.get('profileId');
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await revokeConsent(db, childProfileId, parentProfileId);

      // Schedule 7-day grace period deletion via Inngest
      await inngest.send({
        name: 'app/consent.revoked',
        data: {
          childProfileId,
          parentProfileId,
          timestamp: new Date().toISOString(),
        },
      });

      return c.json({
        message:
          'Consent revoked. Data will be deleted after 7-day grace period.',
        consentStatus: state.status,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not authorized')) {
        return forbidden(
          c,
          'Not authorized to revoke consent for this profile'
        );
      }
      if (
        error instanceof Error &&
        error.message.includes('No consent record')
      ) {
        return notFound(c, 'No consent record found');
      }
      throw error;
    }
  })

  // Restore consent (cancel revocation, within 7-day grace period)
  .put('/consent/:childProfileId/restore', async (c) => {
    const db = c.get('db');
    const parentProfileId = c.get('profileId');
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await restoreConsent(db, childProfileId, parentProfileId);
      return c.json({
        message: 'Consent restored. Deletion cancelled.',
        consentStatus: state.status,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Not authorized')) {
        return forbidden(
          c,
          'Not authorized to restore consent for this profile'
        );
      }
      if (
        error instanceof Error &&
        error.message.includes('No consent record')
      ) {
        return notFound(c, 'No consent record found');
      }
      throw error;
    }
  });
