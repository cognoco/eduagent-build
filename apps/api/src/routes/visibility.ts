import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';

import {
  appealReportSchema,
  appealRequestSchema,
  sharedRecordSchema,
  visibilityContractSchema,
  visibilityLinkAcceptSchema,
  visibilityLinkInitiateSchema,
} from '@eduagent/schemas';
import type { Database } from '@eduagent/database';

import type { AuthUser } from '../middleware/auth';
import { requireProfileId } from '../middleware/profile-scope';
import { BadRequestError, ForbiddenError } from '../errors';
import { isManagedTierActive } from '../config';
import { inngest } from '../inngest/client';
import {
  acceptLink,
  findAcceptedContractForSupportee,
  getContractForVisibleLink,
  initiateLink,
  writeVisibilityAuditEvent,
} from '../services/linking-ceremony';
import { requestSelfUnlink } from '../services/supportership-revocation';
import { buildAttentionReport } from '../services/supporter-report';
import { projectSharedRecord } from '../services/shared-record';
import { safeSend } from '../services/safe-non-core';

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const personIdParamSchema = z.object({
  personId: z.string().uuid(),
});

const appealBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

type VisibilityRouteEnv = {
  Bindings: {
    MANAGED_TIER_ACTIVE?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
    callerPersonId: string | undefined;
  };
};

function withCaller(c: Context<VisibilityRouteEnv>): {
  db: Database;
  callerPersonId: string;
} {
  requireProfileId(c.get('profileId'));
  const callerPersonId = c.get('callerPersonId');
  if (!callerPersonId) {
    throw new BadRequestError('Identity v2 caller person is required.');
  }
  return { db: c.get('db'), callerPersonId };
}

export const visibilityRoutes = new Hono<VisibilityRouteEnv>()
  .post(
    '/visibility/links',
    zValidator('json', visibilityLinkInitiateSchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const body = c.req.valid('json');
      if (body.supporterPersonId !== callerPersonId) {
        throw new ForbiddenError('Only the supporter can initiate this link.');
      }
      const contract = await initiateLink(db, {
        ...body,
        managedTierActive: isManagedTierActive(c.env.MANAGED_TIER_ACTIVE),
      });
      return c.json(visibilityContractSchema.parse(contract));
    },
  )
  .post(
    '/visibility/links/:id/accept',
    zValidator('param', idParamSchema),
    zValidator('json', visibilityLinkAcceptSchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      if (body.actorPersonId !== callerPersonId) {
        throw new ForbiddenError('Only the authenticated person can accept.');
      }
      const contract = await acceptLink(db, id, body);
      return c.json(visibilityContractSchema.parse(contract));
    },
  )
  .post(
    '/visibility/links/:id/revoke',
    zValidator('param', idParamSchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const { id } = c.req.valid('param');
      const notice = await requestSelfUnlink(db, {
        supportershipId: id,
        callerPersonId,
      });
      await safeSend(
        () =>
          inngest.send({
            name: 'app/supportership.unlinked',
            data: {
              supportershipId: notice.supportershipId,
              supporteePersonId: notice.supporteePersonId,
              supporterPersonId: notice.supporterPersonId,
              revokedAt: notice.revokedAt,
            },
          }),
        'visibility.supportership.unlinked',
        { supportershipId: notice.supportershipId },
      );
      return c.json(notice);
    },
  )
  .get(
    '/visibility/links/:id/contract',
    zValidator('param', idParamSchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const { id } = c.req.valid('param');
      const contract = await getContractForVisibleLink(db, {
        contractId: id,
        actorPersonId: callerPersonId,
      });
      return c.json(visibilityContractSchema.parse(contract));
    },
  )
  .post(
    '/visibility/reports/:personId/appeal',
    zValidator('param', personIdParamSchema),
    zValidator('json', appealBodySchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const { personId } = c.req.valid('param');
      const contract = await findAcceptedContractForSupportee(db, {
        supporterPersonId: callerPersonId,
        supporteePersonId: personId,
      });
      const body = c.req.valid('json');
      const requestedAt = new Date().toISOString();
      appealRequestSchema.parse({
        supportershipId: contract.supportershipId,
        supporteePersonId: personId,
        requestedAt,
        reason: body.reason,
      });
      const report = await buildAttentionReport({
        supportershipId: contract.supportershipId,
        requestedByPersonId: callerPersonId,
        reason: body.reason,
        facts: [],
        auditWriter: (event) =>
          writeVisibilityAuditEvent(db, {
            ...event,
            actorPersonId: callerPersonId,
          }),
      });
      return c.json(appealReportSchema.parse(report));
    },
  )
  .get(
    '/visibility/reports/:personId/shared-record',
    zValidator('param', personIdParamSchema),
    async (c) => {
      const { db, callerPersonId } = withCaller(c);
      const { personId } = c.req.valid('param');
      const contract = await findAcceptedContractForSupportee(db, {
        supporterPersonId: callerPersonId,
        supporteePersonId: personId,
      });
      const record = projectSharedRecord({
        supportershipId: contract.supportershipId,
        facts: [],
      });
      return c.json(sharedRecordSchema.parse(record));
    },
  );
