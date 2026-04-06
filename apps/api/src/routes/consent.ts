import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  consentRequestSchema,
  consentResponseSchema,
  ERROR_CODES,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';
import type { AuthUser } from '../middleware/auth';
import type { Account } from '../services/account';
import { requireProfileId } from '../middleware/profile-scope';
import { getProfile } from '../services/profile';
import {
  requestConsent,
  processConsentResponse,
  getProfileConsentState,
  getChildConsentForParent,
  revokeConsent,
  restoreConsent,
  ConsentResendLimitError,
  EmailDeliveryError,
  ConsentTokenNotFoundError,
  ConsentAlreadyProcessedError,
  ConsentTokenExpiredError,
} from '../services/consent';
import { notFound, forbidden, apiError } from '../errors';
import { inngest } from '../inngest/client';

type ConsentRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    account: Account;
    profileId: string | undefined;
  };
};

export const consentRoutes = new Hono<ConsentRouteEnv>()
  .post(
    '/consent/request',
    zValidator('json', consentRequestSchema),
    async (c) => {
      const db = c.get('db');
      const account = c.get('account');
      const input = c.req.valid('json');

      // Verify the childProfileId belongs to the authenticated user's account
      const childProfile = await getProfile(
        db,
        input.childProfileId,
        account.id
      );
      if (!childProfile) {
        return forbidden(
          c,
          'Not authorized to request consent for this profile'
        );
      }

      // Guard: child cannot send consent email to their own account email
      if (
        account.email.toLowerCase() === input.parentEmail.trim().toLowerCase()
      ) {
        return apiError(
          c,
          400,
          ERROR_CODES.VALIDATION_ERROR,
          'Parent email must be different from your account email'
        );
      }

      // Consent page is served by this API worker — derive URL from request
      // origin so the link always points to the correct API domain:
      //   production → https://api.mentomate.com
      //   staging    → https://api-stg.mentomate.com
      //   local dev  → http://localhost:8787
      const apiOrigin = new URL(c.req.url).origin;
      let result;
      try {
        result = await requestConsent(db, input, apiOrigin, {
          resendApiKey: c.env.RESEND_API_KEY,
          emailFrom: c.env.EMAIL_FROM,
        });
      } catch (error) {
        if (error instanceof ConsentResendLimitError) {
          return apiError(c, 429, ERROR_CODES.VALIDATION_ERROR, error.message);
        }
        if (error instanceof EmailDeliveryError) {
          return apiError(c, 502, ERROR_CODES.INTERNAL_ERROR, error.message);
        }
        throw error;
      }

      // Dispatch Inngest event for reminder workflow
      // NOTE: parentEmail is intentionally omitted — PII must not be in event payloads.
      // The consent-reminders function looks up parentEmail from the DB.
      // Wrapped in try-catch: consent request must succeed even if Inngest is unreachable
      // (same pattern as session close — BUG-54).
      try {
        await inngest.send({
          name: 'app/consent.requested',
          data: {
            profileId: result.consentState.profileId,
            consentType: result.consentState.consentType,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        console.warn(
          '[consent] Failed to dispatch Inngest event — reminder workflow skipped'
        );
      }

      return c.json(
        {
          message: 'Consent request sent to parent',
          consentType: input.consentType,
          emailStatus: result.emailDelivered ? 'sent' : 'failed',
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
        if (error instanceof ConsentTokenNotFoundError) {
          return notFound(c, error.message);
        }
        if (error instanceof ConsentAlreadyProcessedError) {
          return apiError(c, 409, ERROR_CODES.CONFLICT, error.message);
        }
        if (error instanceof ConsentTokenExpiredError) {
          return apiError(c, 410, ERROR_CODES.GONE, error.message);
        }
        throw error;
      }
    }
  )
  .get('/consent/my-status', async (c) => {
    // This route intentionally works without a profile —
    // returns null values when no profile is resolved.
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
    const parentProfileId = requireProfileId(c.get('profileId'));
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
    const parentProfileId = requireProfileId(c.get('profileId'));
    const childProfileId = c.req.param('childProfileId');

    try {
      const state = await revokeConsent(db, childProfileId, parentProfileId);

      // Schedule 7-day grace period deletion via Inngest
      // Wrapped in try-catch: revocation must succeed even if Inngest is unreachable
      // (same pattern as consent request — BUG-64, session close — BUG-54).
      try {
        await inngest.send({
          name: 'app/consent.revoked',
          data: {
            childProfileId,
            parentProfileId,
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        console.warn(
          '[consent] Failed to dispatch Inngest revocation event — grace period job skipped'
        );
      }

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
    const parentProfileId = requireProfileId(c.get('profileId'));
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
