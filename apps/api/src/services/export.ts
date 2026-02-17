// ---------------------------------------------------------------------------
// Data Export Service — Story 0.6
// Pure business logic, no Hono imports
// ---------------------------------------------------------------------------

import { eq, inArray } from 'drizzle-orm';
import {
  accounts,
  profiles,
  consentStates,
  type Database,
} from '@eduagent/database';
import type { DataExport } from '@eduagent/schemas';

export async function generateExport(
  db: Database,
  accountId: string
): Promise<DataExport> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, accountId),
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const profileRows = await db.query.profiles.findMany({
    where: eq(profiles.accountId, accountId),
  });

  const profileIds = profileRows.map((p) => p.id);

  const consentRows =
    profileIds.length > 0
      ? await db.query.consentStates.findMany({
          where: inArray(consentStates.profileId, profileIds),
        })
      : [];

  return {
    account: {
      email: account.email,
      createdAt: account.createdAt.toISOString(),
    },
    profiles: profileRows.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl ?? null,
      birthDate: row.birthDate
        ? row.birthDate.toISOString().split('T')[0]
        : null,
      personaType: row.personaType,
      isOwner: row.isOwner,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    consentStates: consentRows.map((row) => ({
      id: row.id,
      profileId: row.profileId,
      consentType: row.consentType,
      status: row.status,
      parentEmail: row.parentEmail ?? null,
      requestedAt: row.requestedAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
    })),
    exportedAt: new Date().toISOString(),
  };
}
