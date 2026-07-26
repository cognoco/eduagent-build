import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  supportVisibilityAuditEvents,
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';

import { createVisibilityNotice } from './visibility-moment-projections';
import { writeVisibilityAuditEvent } from './linking-ceremony';

function hasOccurredAt(payload: unknown, occurredAtIso: string): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'occurredAt' in payload &&
    payload.occurredAt === occurredAtIso
  );
}

export async function restampGraduationContracts(
  db: Database,
  input: { personId: string; occurredAt?: Date },
): Promise<{ restamped: number }> {
  const occurredAt = input.occurredAt ?? new Date();
  const rows = await db
    .select({ edge: supportership, contract: supportVisibilityContracts })
    .from(supportership)
    .innerJoin(
      supportVisibilityContracts,
      eq(supportVisibilityContracts.supportershipId, supportership.id),
    )
    .where(
      inArray(supportVisibilityContracts.status, ['accepted', 'restamped']),
    );

  const activeRows = rows.filter(
    (row) =>
      row.edge.supporteePersonId === input.personId &&
      row.edge.revokedAt === null,
  );

  const occurredAtIso = occurredAt.toISOString();
  let restamped = 0;
  for (const row of activeRows) {
    const didRestamp = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Database;
      // Revocation writes the supportership before its contract. Taking the
      // same row lock first serializes both paths and re-checks revokedAt after
      // any in-flight revocation commits.
      const lockedEdges = await tx
        .select({ id: supportership.id })
        .from(supportership)
        .where(
          and(
            eq(supportership.id, row.edge.id),
            eq(supportership.supporteePersonId, input.personId),
            isNull(supportership.revokedAt),
          ),
        )
        .for('update');
      if (!lockedEdges[0]) return false;

      const priorEvents =
        await txDb.query.supportVisibilityAuditEvents.findMany({
          columns: { payload: true },
          where: and(
            eq(supportVisibilityAuditEvents.contractId, row.contract.id),
            eq(supportVisibilityAuditEvents.eventType, 'graduation_restamped'),
          ),
        });
      if (
        priorEvents.some((event) => hasOccurredAt(event.payload, occurredAtIso))
      ) {
        return false;
      }

      const updatedRows = await tx
        .update(supportVisibilityContracts)
        .set({
          status: 'restamped',
          contractVersion: row.contract.contractVersion + 1,
          supporterAcceptedAt: null,
          supporteeAcceptedAt: null,
          updatedAt: occurredAt,
        })
        .where(
          and(
            eq(supportVisibilityContracts.id, row.contract.id),
            eq(supportVisibilityContracts.supporteePersonId, input.personId),
            eq(
              supportVisibilityContracts.contractVersion,
              row.contract.contractVersion,
            ),
            inArray(supportVisibilityContracts.status, [
              'accepted',
              'restamped',
            ]),
          ),
        )
        .returning();
      const updated = updatedRows[0];
      if (!updated) return false;

      await writeVisibilityAuditEvent(txDb, {
        supportershipId: row.edge.id,
        contractId: updated.id,
        actorPersonId: input.personId,
        eventType: 'graduation_restamped',
        payload: {
          personId: input.personId,
          occurredAt: occurredAtIso,
          priorContractVersion: row.contract.contractVersion,
        },
      });
      await createVisibilityNotice(txDb, {
        supportershipId: row.edge.id,
        contractId: updated.id,
        noticeType: 'graduation_contract_restamped',
        targetAudience: 'supportee',
        targetPersonId: row.edge.supporteePersonId,
        payload: {
          supporterPersonId: row.edge.supporterPersonId,
          occurredAt: occurredAtIso,
          contractVersion: updated.contractVersion,
        },
      });
      return true;
    });
    if (didRestamp) restamped += 1;
  }

  return { restamped };
}
