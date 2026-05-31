import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  memberships,
  organizationInvitations,
  organizations,
  profiles,
  type Database,
  type MembershipRole,
  type OrganizationInvitation,
} from '@eduagent/database';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors';

const DEFAULT_INVITATION_TTL_HOURS = 7 * 24;
const MEMBERSHIP_ROLES = new Set<MembershipRole>([
  'owner',
  'mentor',
  'student',
]);

function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function normalizeRoles(roles: MembershipRole[]): MembershipRole[] {
  const unique = [...new Set(roles)];
  if (unique.length === 0) {
    throw new BadRequestError('At least one invitation role is required.');
  }
  const invalid = unique.find((role) => !MEMBERSHIP_ROLES.has(role));
  if (invalid) {
    throw new BadRequestError(`Invalid invitation role: ${invalid}`);
  }
  return unique;
}

function expiresAtFromTtl(ttlHours: number | undefined): Date {
  return new Date(
    Date.now() + (ttlHours ?? DEFAULT_INVITATION_TTL_HOURS) * 60 * 60 * 1000,
  );
}

async function assertOrganizationExists(
  db: Database,
  organizationId: string,
): Promise<void> {
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
    columns: { id: true },
  });
  if (!organization) {
    throw new NotFoundError('Organization');
  }
}

async function lockInvitationByToken(
  db: Database,
  rawToken: string,
  kind: 'invite' | 'claim',
): Promise<OrganizationInvitation> {
  const [invitation] = await db
    .select()
    .from(organizationInvitations)
    .where(eq(organizationInvitations.tokenHash, hashToken(rawToken)))
    .for('update')
    .limit(1);

  if (!invitation || invitation.kind !== kind) {
    throw new NotFoundError('Invitation');
  }
  if (invitation.status !== 'pending') {
    throw new ConflictError('Invitation token has already been used.');
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await db
      .update(organizationInvitations)
      .set({ status: 'expired' })
      .where(eq(organizationInvitations.id, invitation.id));
    throw new ConflictError('Invitation token has expired.');
  }

  return invitation;
}

export async function createInvitation(
  db: Database,
  organizationId: string,
  invitedRoles: MembershipRole[],
  opts?: { email?: string; ttlHours?: number },
): Promise<{ invitation: OrganizationInvitation; rawToken: string }> {
  await assertOrganizationExists(db, organizationId);
  const roles = normalizeRoles(invitedRoles);
  const rawToken = generateRawToken();
  const [invitation] = await db
    .insert(organizationInvitations)
    .values({
      organizationId,
      kind: 'invite',
      invitedRoles: roles,
      targetProfileId: null,
      tokenHash: hashToken(rawToken),
      emailHint: opts?.email ?? null,
      expiresAt: expiresAtFromTtl(opts?.ttlHours),
    })
    .returning();

  if (!invitation) {
    throw new Error('Invitation insert did not return a row');
  }

  return { invitation, rawToken };
}

export async function acceptInvitation(
  db: Database,
  rawToken: string,
  accepterClerkUserId: string,
  _accepterEmail?: string,
): Promise<{ membershipId: string; organizationId: string }> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const invitation = await lockInvitationByToken(txDb, rawToken, 'invite');
    const accepter = await txDb.query.profiles.findFirst({
      where: eq(profiles.clerkUserId, accepterClerkUserId),
      columns: { id: true },
    });
    if (!accepter) {
      throw new NotFoundError('Profile');
    }

    const now = new Date();
    const [membership] = await txDb
      .insert(memberships)
      .values({
        personId: accepter.id,
        organizationId: invitation.organizationId,
        roles: normalizeRoles(invitation.invitedRoles),
      })
      .onConflictDoUpdate({
        target: [memberships.personId, memberships.organizationId],
        set: {
          roles: sql<MembershipRole[]>`
            (
              SELECT array_agg(DISTINCT role_value ORDER BY role_value)::"membership_role"[]
              FROM unnest(${memberships.roles} || excluded.roles) AS merged(role_value)
            )
          `,
          updatedAt: now,
        },
      })
      .returning({ id: memberships.id });

    if (!membership) {
      throw new Error('Membership upsert did not return a row');
    }

    const [accepted] = await txDb
      .update(organizationInvitations)
      .set({
        status: 'accepted',
        acceptedAt: now,
        acceptedByProfileId: accepter.id,
      })
      .where(
        and(
          eq(organizationInvitations.id, invitation.id),
          eq(organizationInvitations.status, 'pending'),
        ),
      )
      .returning({ id: organizationInvitations.id });
    if (!accepted) {
      throw new ConflictError('Invitation token has already been used.');
    }

    return {
      membershipId: membership.id,
      organizationId: invitation.organizationId,
    };
  });
}

export async function createClaim(
  db: Database,
  organizationId: string,
  targetProfileId: string,
  opts?: { email?: string; ttlHours?: number },
): Promise<{ invitation: OrganizationInvitation; rawToken: string }> {
  await assertOrganizationExists(db, organizationId);
  const target = await db.query.profiles.findFirst({
    where: eq(profiles.id, targetProfileId),
    columns: { id: true, clerkUserId: true },
  });
  if (!target) {
    throw new NotFoundError('Profile');
  }
  if (target.clerkUserId !== null) {
    throw new ConflictError('Target profile is already credentialed.');
  }

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.personId, targetProfileId),
      eq(memberships.organizationId, organizationId),
    ),
    columns: { roles: true },
  });
  if (!membership) {
    throw new ForbiddenError('Target profile is not a member of this org.');
  }

  const rawToken = generateRawToken();
  const [invitation] = await db
    .insert(organizationInvitations)
    .values({
      organizationId,
      kind: 'claim',
      invitedRoles: normalizeRoles(membership.roles),
      targetProfileId,
      tokenHash: hashToken(rawToken),
      emailHint: opts?.email ?? null,
      expiresAt: expiresAtFromTtl(opts?.ttlHours),
    })
    .returning();

  if (!invitation) {
    throw new Error('Claim insert did not return a row');
  }

  return { invitation, rawToken };
}

export async function redeemClaim(
  db: Database,
  rawToken: string,
  redeemerClerkUserId: string,
): Promise<{ graduatedProfileId: string }> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;
    const invitation = await lockInvitationByToken(txDb, rawToken, 'claim');
    if (!invitation.targetProfileId) {
      throw new ConflictError('Claim token has no target profile.');
    }

    const existingRedeemer = await txDb.query.profiles.findFirst({
      where: eq(profiles.clerkUserId, redeemerClerkUserId),
      columns: { id: true },
    });
    if (existingRedeemer) {
      throw new ConflictError(
        'This Clerk identity is already attached to another profile.',
      );
    }

    const [target] = await txDb
      .select()
      .from(profiles)
      .where(eq(profiles.id, invitation.targetProfileId))
      .for('update')
      .limit(1);
    if (!target) {
      throw new NotFoundError('Profile');
    }
    if (target.clerkUserId !== null) {
      throw new ConflictError('Target profile is already credentialed.');
    }

    const now = new Date();
    const [updated] = await txDb
      .update(profiles)
      .set({ clerkUserId: redeemerClerkUserId, updatedAt: now })
      .where(
        and(
          eq(profiles.id, invitation.targetProfileId),
          isNull(profiles.clerkUserId),
        ),
      )
      .returning({ id: profiles.id });
    if (!updated) {
      throw new ConflictError('Target profile is already credentialed.');
    }

    const [accepted] = await txDb
      .update(organizationInvitations)
      .set({
        status: 'accepted',
        acceptedAt: now,
        acceptedByProfileId: updated.id,
      })
      .where(
        and(
          eq(organizationInvitations.id, invitation.id),
          eq(organizationInvitations.status, 'pending'),
        ),
      )
      .returning({ id: organizationInvitations.id });
    if (!accepted) {
      throw new ConflictError('Claim token has already been used.');
    }

    return { graduatedProfileId: updated.id };
  });
}
