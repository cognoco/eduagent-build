import { and, eq, isNull } from 'drizzle-orm';

import {
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';
import type {
  SupporterRelation,
  VisibilityContract,
  VisibilityLinkAccept,
  VisibilityLinkInitiate,
} from '@eduagent/schemas';

import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';

const REPORTABLE_KINDS = ['mastery', 'effort', 'observable_engagement'];

export async function writeVisibilityAuditEvent(
  db: Database,
  input: {
    supportershipId: string;
    contractId?: string;
    actorPersonId?: string;
    eventType:
      | 'contract_initiated'
      | 'contract_accepted'
      | 'appeal_requested'
      | 'supportership_revoked'
      | 'graduation_restamped';
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(supportVisibilityAuditEvents).values({
    supportershipId: input.supportershipId,
    contractId: input.contractId,
    actorPersonId: input.actorPersonId,
    eventType: input.eventType,
    payload: input.payload,
  });
}

export async function initiateLink(
  db: Database,
  input: VisibilityLinkInitiate & {
    managedTierActive?: boolean;
    now?: Date;
    contractVersion?: number;
  },
): Promise<VisibilityContract> {
  if (input.managedTier && !input.managedTierActive) {
    throw new ForbiddenError('Managed support links are not active yet.');
  }
  if (input.supporterPersonId === input.supporteePersonId) {
    throw new BadRequestError('A supporter cannot support themself.');
  }

  const now = input.now ?? new Date();
  const edgeRows = await db
    .insert(supportership)
    .values({
      supporterPersonId: input.supporterPersonId,
      supporteePersonId: input.supporteePersonId,
      grantedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const edge = edgeRows[0];
  if (!edge) throw new Error('Supportership insert returned no row');

  const contractRows = await db
    .insert(supportVisibilityContracts)
    .values({
      supportershipId: edge.id,
      supporterPersonId: input.supporterPersonId,
      supporteePersonId: input.supporteePersonId,
      relation: input.relation,
      status: input.managedTier ? 'accepted' : 'pending',
      contractVersion: input.contractVersion ?? 1,
      reportableKinds: REPORTABLE_KINDS,
      artifactWall: true,
      renderEquivalence: true,
      safetyException: true,
      supporterAcceptedAt: input.managedTier ? now : null,
      supporteeAcceptedAt: input.managedTier ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const contract = contractRows[0];
  if (!contract) throw new Error('Visibility contract insert returned no row');

  await writeVisibilityAuditEvent(db, {
    supportershipId: edge.id,
    contractId: contract.id,
    actorPersonId: input.supporterPersonId,
    eventType: 'contract_initiated',
    payload: {
      relation: input.relation,
      managedTier: input.managedTier,
      reportableKinds: REPORTABLE_KINDS,
    },
  });

  return mapContract(contract);
}

export async function acceptLink(
  db: Database,
  contractId: string,
  input: VisibilityLinkAccept & { now?: Date },
): Promise<VisibilityContract> {
  const contract = await readContractById(db, contractId);
  const now = input.now ?? new Date();
  if (input.audience === 'supporter') {
    if (contract.supporterPersonId !== input.actorPersonId) {
      throw new ForbiddenError('Only the supporter can accept this side.');
    }
  } else if (contract.supporteePersonId !== input.actorPersonId) {
    throw new ForbiddenError('Only the supportee can accept this side.');
  }

  const supporterAcceptedAt =
    input.audience === 'supporter'
      ? now
      : contract.supporterAcceptedAt
        ? new Date(contract.supporterAcceptedAt)
        : null;
  const supporteeAcceptedAt =
    input.audience === 'supportee'
      ? now
      : contract.supporteeAcceptedAt
        ? new Date(contract.supporteeAcceptedAt)
        : null;
  const status =
    supporterAcceptedAt && supporteeAcceptedAt ? 'accepted' : contract.status;

  const rows = await db
    .update(supportVisibilityContracts)
    .set({
      supporterAcceptedAt,
      supporteeAcceptedAt,
      status,
      updatedAt: now,
    })
    .where(eq(supportVisibilityContracts.id, contractId))
    .returning();
  const updated = rows[0];
  if (!updated) throw new Error('Visibility contract update returned no row');

  await writeVisibilityAuditEvent(db, {
    supportershipId: updated.supportershipId,
    contractId: updated.id,
    actorPersonId: input.actorPersonId,
    eventType: 'contract_accepted',
    payload: { audience: input.audience, status },
  });

  return mapContract(updated);
}

export async function getContractForVisibleLink(
  db: Database,
  input: { contractId: string; actorPersonId: string },
): Promise<VisibilityContract> {
  const contract = await readContractById(db, input.contractId);
  if (
    contract.supporterPersonId !== input.actorPersonId &&
    contract.supporteePersonId !== input.actorPersonId
  ) {
    throw new ForbiddenError('You do not have access to this contract.');
  }
  return contract;
}

export async function assertAcceptedSupportership(
  db: Database,
  input: { supportershipId: string; supporterPersonId: string },
): Promise<VisibilityContract> {
  const rows = await db
    .select()
    .from(supportVisibilityContracts)
    .innerJoin(
      supportership,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      and(
        eq(supportVisibilityContracts.supportershipId, input.supportershipId),
        eq(
          supportVisibilityContracts.supporterPersonId,
          input.supporterPersonId,
        ),
        eq(supportVisibilityContracts.status, 'accepted'),
        isNull(supportership.revokedAt),
      ),
    )
    .limit(1);
  const row = rows[0]?.support_visibility_contracts;
  if (!row) throw new ForbiddenError('This support link is not active.');
  return mapContract(row);
}

export async function findAcceptedContractForSupportee(
  db: Database,
  input: { supporterPersonId: string; supporteePersonId: string },
): Promise<VisibilityContract> {
  const rows = await db
    .select()
    .from(supportVisibilityContracts)
    .innerJoin(
      supportership,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      and(
        eq(
          supportVisibilityContracts.supporterPersonId,
          input.supporterPersonId,
        ),
        eq(
          supportVisibilityContracts.supporteePersonId,
          input.supporteePersonId,
        ),
        eq(supportVisibilityContracts.status, 'accepted'),
        isNull(supportership.revokedAt),
      ),
    )
    .limit(1);
  const row = rows[0]?.support_visibility_contracts;
  if (!row) throw new ForbiddenError('This support link is not active.');
  return mapContract(row);
}

async function readContractById(
  db: Database,
  contractId: string,
): Promise<VisibilityContract> {
  const rows = await db
    .select()
    .from(supportVisibilityContracts)
    .where(eq(supportVisibilityContracts.id, contractId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('Visibility contract not found.');
  return mapContract(row);
}

function mapContract(
  row: typeof supportVisibilityContracts.$inferSelect,
): VisibilityContract {
  return {
    id: row.id,
    supportershipId: row.supportershipId,
    supporterPersonId: row.supporterPersonId,
    supporteePersonId: row.supporteePersonId,
    relation: row.relation as SupporterRelation,
    status: row.status as VisibilityContract['status'],
    contractVersion: row.contractVersion,
    reportableKinds:
      row.reportableKinds as VisibilityContract['reportableKinds'],
    artifactWall: row.artifactWall as true,
    renderEquivalence: row.renderEquivalence as true,
    safetyException: row.safetyException as true,
    supporterAcceptedAt: row.supporterAcceptedAt?.toISOString() ?? null,
    supporteeAcceptedAt: row.supporteeAcceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
