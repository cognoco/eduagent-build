import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { consentRequestSchema, consentResponseSchema } from '@eduagent/schemas';
import { requestConsent, processConsentResponse } from '../services/consent';
import { inngest } from '../inngest/client';

export const consentRoutes = new Hono()
  .post(
    '/consent/request',
    zValidator('json', consentRequestSchema),
    async (c) => {
      const input = c.req.valid('json');
      const consentState = await requestConsent(input);

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
      const input = c.req.valid('json');
      await processConsentResponse(input.token, input.approved);

      return c.json({
        message: input.approved ? 'Consent granted' : 'Consent denied',
      });
    }
  );
