import { getTableConfig } from 'drizzle-orm/pg-core';

import { organizationInvitations, organizations, profiles } from './index.js';

describe('organizationInvitations schema shape', () => {
  it('exposes the invitation and claim columns', () => {
    expect(organizationInvitations).toHaveProperty('id');
    expect(organizationInvitations).toHaveProperty('organizationId');
    expect(organizationInvitations).toHaveProperty('kind');
    expect(organizationInvitations).toHaveProperty('invitedRoles');
    expect(organizationInvitations).toHaveProperty('targetProfileId');
    expect(organizationInvitations).toHaveProperty('tokenHash');
    expect(organizationInvitations).toHaveProperty('status');
    expect(organizationInvitations).toHaveProperty('expiresAt');
    expect(organizationInvitations).toHaveProperty('acceptedByProfileId');
  });

  it('pins token uniqueness and role/status/kind checks', () => {
    const { columns, checks, uniqueConstraints } = getTableConfig(
      organizationInvitations,
    );

    const tokenUnique = uniqueConstraints.find(
      (u) => u.name === 'organization_invitations_token_hash_unique',
    );
    expect(tokenUnique).toBeDefined();
    expect(tokenUnique!.columns.map((c) => c.name)).toEqual(['token_hash']);

    const roles = columns.find((c) => c.name === 'invited_roles');
    expect(roles).toBeDefined();
    expect(roles!.notNull).toBe(true);
    expect(roles!.getSQLType()).toBe('membership_role[]');

    expect(
      checks.some((c) => c.name === 'organization_invitations_kind_check'),
    ).toBe(true);
    expect(
      checks.some((c) => c.name === 'organization_invitations_status_check'),
    ).toBe(true);
    expect(
      checks.some((c) => c.name === 'organization_invitations_roles_non_empty'),
    ).toBe(true);
  });

  it('links organizations and target profiles by foreign key', () => {
    const { foreignKeys } = getTableConfig(organizationInvitations);
    const targets = foreignKeys.map((fk) => {
      const reference = fk.reference();
      return {
        columns: reference.columns.map((c) => c.name),
        foreignTable: reference.foreignTable,
      };
    });

    expect(targets).toContainEqual({
      columns: ['organization_id'],
      foreignTable: organizations,
    });
    expect(targets).toContainEqual({
      columns: ['target_profile_id'],
      foreignTable: profiles,
    });
  });
});
