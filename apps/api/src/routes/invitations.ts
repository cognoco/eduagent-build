import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';

import type { Database, OrganizationInvitation } from '@eduagent/database';
import {
  invitationAcceptResponseSchema,
  invitationAcceptSchema,
  invitationClaimCreateSchema,
  invitationCreateSchema,
  invitationRedeemResponseSchema,
  invitationTokenResponseSchema,
} from '@eduagent/schemas';

import type { AuthUser } from '../middleware/auth';
import type { ProfileMeta } from '../middleware/profile-scope';
import { assertOwnerProfile } from '../services/family-access';
import {
  acceptInvitation,
  createClaim,
  createInvitation,
  redeemClaim,
} from '../services/invitation';

type InvitationRouteEnv = {
  Bindings: {
    DATABASE_URL: string;
    CLERK_JWKS_URL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    organizationId: string | undefined;
    profileMeta: ProfileMeta | undefined;
  };
};

function requireOrganizationId(organizationId: string | undefined): string {
  if (!organizationId) {
    throw new HTTPException(401, {
      message: 'Organization required for this request',
    });
  }
  return organizationId;
}

function requireUser(user: AuthUser | undefined): AuthUser {
  if (!user) {
    throw new HTTPException(401, {
      message: 'Authentication required',
    });
  }
  return user;
}

function mapInvitation(invitation: OrganizationInvitation) {
  return {
    id: invitation.id,
    organizationId: invitation.organizationId,
    kind: invitation.kind,
    invitedRoles: invitation.invitedRoles,
    targetProfileId: invitation.targetProfileId,
    emailHint: invitation.emailHint,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  };
}

export const invitationRoutes = new Hono<InvitationRouteEnv>()
  .post(
    '/invitations',
    zValidator('json', invitationCreateSchema),
    async (c) => {
      assertOwnerProfile(c, 'Only the account owner can create invitations.');
      const input = c.req.valid('json');
      const result = await createInvitation(
        c.get('db'),
        requireOrganizationId(c.get('organizationId')),
        input.invitedRoles,
        { email: input.email },
      );

      return c.json(
        invitationTokenResponseSchema.parse({
          invitation: mapInvitation(result.invitation),
          token: result.rawToken,
        }),
        201,
      );
    },
  )
  .post(
    '/invitations/accept',
    zValidator('json', invitationAcceptSchema),
    async (c) => {
      const input = c.req.valid('json');
      const user = requireUser(c.get('user'));
      const result = await acceptInvitation(
        c.get('db'),
        input.token,
        user.userId,
        user.email,
      );
      return c.json(invitationAcceptResponseSchema.parse(result));
    },
  )
  .post(
    '/invitations/claims',
    zValidator('json', invitationClaimCreateSchema),
    async (c) => {
      assertOwnerProfile(c, 'Only the account owner can create claim links.');
      const input = c.req.valid('json');
      const result = await createClaim(
        c.get('db'),
        requireOrganizationId(c.get('organizationId')),
        input.targetProfileId,
        { email: input.email },
      );

      return c.json(
        invitationTokenResponseSchema.parse({
          invitation: mapInvitation(result.invitation),
          token: result.rawToken,
        }),
        201,
      );
    },
  )
  .post(
    '/invitations/claims/redeem',
    zValidator('json', invitationAcceptSchema),
    async (c) => {
      const input = c.req.valid('json');
      const user = requireUser(c.get('user'));
      const result = await redeemClaim(c.get('db'), input.token, user.userId);
      return c.json(invitationRedeemResponseSchema.parse(result));
    },
  );
