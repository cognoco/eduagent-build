import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import {
  person,
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

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors';

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
    initiatedByPersonId?: string;
  },
): Promise<VisibilityContract> {
  return await db.transaction(async (tx) =>
    initiateLinkInTransaction(tx as unknown as Database, input),
  );
}

/**
 * Canonical link initiation for callers that already own a transaction.
 * Repairs a pre-existing bare supportership by adding its missing contract.
 */
export async function initiateLinkInTransaction(
  db: Database,
  input: VisibilityLinkInitiate & {
    managedTierActive?: boolean;
    now?: Date;
    contractVersion?: number;
    initiatedByPersonId?: string;
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
    .onConflictDoNothing({
      target: [
        supportership.supporterPersonId,
        supportership.supporteePersonId,
      ],
      where: isNull(supportership.revokedAt),
    })
    .returning();
  let edge = edgeRows[0];
  if (!edge) {
    const existingEdgeRows = await db
      .select()
      .from(supportership)
      .where(
        and(
          eq(supportership.supporterPersonId, input.supporterPersonId),
          eq(supportership.supporteePersonId, input.supporteePersonId),
          isNull(supportership.revokedAt),
        ),
      )
      .limit(1);
    edge = existingEdgeRows[0];
  }
  if (!edge) throw new ConflictError('An active support link already exists.');

  const existingRows = await db
    .select()
    .from(supportVisibilityContracts)
    .where(
      and(
        eq(supportVisibilityContracts.supportershipId, edge.id),
        inArray(supportVisibilityContracts.status, [
          'pending',
          'accepted',
          'restamped',
        ]),
      ),
    )
    .limit(1);
  const existing = existingRows[0];
  if (existing) return mapContract(existing);

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
    .onConflictDoNothing({
      target: supportVisibilityContracts.supportershipId,
      where: sql`${supportVisibilityContracts.status} IN ('pending','accepted','restamped')`,
    })
    .returning();
  let contract = contractRows[0];
  if (!contract) {
    const winnerRows = await db
      .select()
      .from(supportVisibilityContracts)
      .where(
        and(
          eq(supportVisibilityContracts.supportershipId, edge.id),
          inArray(supportVisibilityContracts.status, [
            'pending',
            'accepted',
            'restamped',
          ]),
        ),
      )
      .limit(1);
    contract = winnerRows[0];
  }
  if (!contract)
    throw new ConflictError('An active support link already exists.');

  if (contractRows[0]) {
    await writeVisibilityAuditEvent(db, {
      supportershipId: edge.id,
      contractId: contract.id,
      actorPersonId: input.initiatedByPersonId ?? input.supporterPersonId,
      eventType: 'contract_initiated',
      payload: {
        relation: input.relation,
        managedTier: input.managedTier,
        reportableKinds: REPORTABLE_KINDS,
      },
    });
  }

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

  if (contract.contractVersion !== input.contractVersion) {
    throw new ConflictError(
      'This visibility contract changed. Review the current version before accepting.',
    );
  }

  if (contract.status === 'lapsed' || contract.status === 'revoked') {
    throw new ConflictError('This visibility contract is no longer active.');
  }

  const audienceAlreadyAccepted =
    input.audience === 'supporter'
      ? contract.supporterAcceptedAt !== null
      : contract.supporteeAcceptedAt !== null;
  if (audienceAlreadyAccepted) {
    return contract;
  }

  if (contract.status !== 'pending' && contract.status !== 'restamped') {
    throw new ConflictError('This visibility contract cannot be accepted.');
  }

  // [WI-1060] Wrap the contract update + audit insert in a transaction so a
  // crash between the two writes cannot leave the contract updated but the
  // audit trail missing. The conditional update also serializes simultaneous
  // accepts on the row: each statement writes only its own side, and the
  // second statement observes the first side before deriving accepted status.
  return await db.transaction(async (tx) => {
    const txDb = tx as unknown as Database;

    const audienceAcceptedColumn =
      input.audience === 'supporter'
        ? supportVisibilityContracts.supporterAcceptedAt
        : supportVisibilityContracts.supporteeAcceptedAt;
    const actorColumn =
      input.audience === 'supporter'
        ? supportVisibilityContracts.supporterPersonId
        : supportVisibilityContracts.supporteePersonId;
    const oppositeAcceptedColumn =
      input.audience === 'supporter'
        ? supportVisibilityContracts.supporteeAcceptedAt
        : supportVisibilityContracts.supporterAcceptedAt;
    const acceptanceUpdate =
      input.audience === 'supporter'
        ? { supporterAcceptedAt: now }
        : { supporteeAcceptedAt: now };

    const rows = await tx
      .update(supportVisibilityContracts)
      .set({
        ...acceptanceUpdate,
        status: sql<string>`case when ${oppositeAcceptedColumn} is not null then 'accepted' else ${supportVisibilityContracts.status} end`,
        updatedAt: now,
      })
      .where(
        and(
          eq(supportVisibilityContracts.id, contractId),
          eq(actorColumn, input.actorPersonId),
          eq(supportVisibilityContracts.contractVersion, input.contractVersion),
          inArray(supportVisibilityContracts.status, ['pending', 'restamped']),
          isNull(audienceAcceptedColumn),
        ),
      )
      .returning();
    const updated = rows[0];
    if (!updated) {
      // A concurrent request may have accepted this audience after the
      // optimistic read above. In that case, return the winning write without
      // appending a second audit event. Any other state change still fails
      // closed under the same rules as the initial read.
      const current = await readContractById(txDb, contractId);
      const currentAudienceAccepted =
        input.audience === 'supporter'
          ? current.supporterAcceptedAt !== null
          : current.supporteeAcceptedAt !== null;
      if (current.contractVersion !== input.contractVersion) {
        throw new ConflictError(
          'This visibility contract changed. Review the current version before accepting.',
        );
      }
      if (currentAudienceAccepted) return current;
      if (current.status === 'lapsed' || current.status === 'revoked') {
        throw new ConflictError(
          'This visibility contract is no longer active.',
        );
      }
      throw new ConflictError('This visibility contract cannot be accepted.');
    }

    await writeVisibilityAuditEvent(txDb, {
      supportershipId: updated.supportershipId,
      contractId: updated.id,
      actorPersonId: input.actorPersonId,
      eventType: 'contract_accepted',
      payload: {
        audience: input.audience,
        status: updated.status,
        contractVersion: updated.contractVersion,
      },
    });

    return mapContract(updated);
  });
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

/**
 * [WI-2237] The single default-deny predicate for "this supporter may see
 * this supportee's data right now." Requires the caller to have already
 * joined `supportership`, `supportVisibilityContracts` (on
 * `supportVisibilityContracts.supportershipId = supportership.id`), and
 * `person` (on `person.id = supportership.supporteePersonId`) into the
 * query — it is query-composable, not a standalone lookup, so it can be
 * embedded in a list query (scope-resolution), a structural join
 * (supporter-structural-mask), or a single-row check (this file's own
 * helpers below) alike.
 *
 * Per-leg AC-variant mapping:
 *  - `isNull(supportership.revokedAt)`              -> revoked edge
 *  - `eq(status, 'accepted')`                        -> missing / pending /
 *    one-sided / restamped / lapsed. Restamp is an in-place UPDATE
 *    (`graduation-narration.ts`'s `restampGraduationContracts` sets
 *    `status='restamped'`, bumps `contractVersion`, and clears both prior
 *    acceptance timestamps on the *same row*), so a restamp cannot retain
 *    authorization from the previous contract version.
 *  - `isNotNull(supporterAcceptedAt) && isNotNull(supporteeAcceptedAt)`
 *    -> one-sided acceptance. Redundant with `status='accepted'` under every
 *    current write path, kept as an explicit belt-and-suspenders leg because
 *    the AC names "all required acceptances" as its own criterion, separate
 *    from "accepted status".
 *  - `isNull(person.archivedAt)`                     -> archived person
 *
 * No separate "current contract version" filter is needed: the partial
 * unique index `support_visibility_contracts_supportership_active_unique`
 * (schema `visibility-contract.ts`) guarantees at most one row per
 * `supportershipId` with status IN ('pending','accepted','restamped') at a
 * time, so an `accepted`-status row is structurally always the only (hence
 * current) one for that `supportershipId` — no write path ever inserts a
 * second contract row for an existing `supportershipId`.
 */
export function acceptedVisibilityCondition() {
  return and(
    isNull(supportership.revokedAt),
    isNull(person.archivedAt),
    eq(supportVisibilityContracts.status, 'accepted'),
    isNotNull(supportVisibilityContracts.supporterAcceptedAt),
    isNotNull(supportVisibilityContracts.supporteeAcceptedAt),
  );
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
    .innerJoin(person, eq(person.id, supportership.supporteePersonId))
    .where(
      and(
        eq(supportVisibilityContracts.supportershipId, input.supportershipId),
        eq(
          supportVisibilityContracts.supporterPersonId,
          input.supporterPersonId,
        ),
        acceptedVisibilityCondition(),
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
    .innerJoin(person, eq(person.id, supportership.supporteePersonId))
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
        acceptedVisibilityCondition(),
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
