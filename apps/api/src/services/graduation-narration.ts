import { eq, inArray } from 'drizzle-orm';

import {
  supportVisibilityContracts,
  supportership,
  type Database,
} from '@eduagent/database';

import { createVisibilityNotice } from './visibility-moment-projections';
import { writeVisibilityAuditEvent } from './linking-ceremony';

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

  for (const row of activeRows) {
    await db
      .update(supportVisibilityContracts)
      .set({
        status: 'restamped',
        contractVersion: row.contract.contractVersion + 1,
        updatedAt: occurredAt,
      })
      .where(eq(supportVisibilityContracts.id, row.contract.id));
    await writeVisibilityAuditEvent(db, {
      supportershipId: row.edge.id,
      contractId: row.contract.id,
      actorPersonId: input.personId,
      eventType: 'graduation_restamped',
      payload: {
        personId: input.personId,
        occurredAt: occurredAt.toISOString(),
        priorContractVersion: row.contract.contractVersion,
      },
    });
    await createVisibilityNotice(db, {
      supportershipId: row.edge.id,
      contractId: row.contract.id,
      noticeType: 'graduation_contract_restamped',
      targetAudience: 'supportee',
      targetPersonId: row.edge.supporteePersonId,
      payload: {
        supporterPersonId: row.edge.supporterPersonId,
        occurredAt: occurredAt.toISOString(),
        contractVersion: row.contract.contractVersion + 1,
      },
    });
  }

  return { restamped: activeRows.length };
}
