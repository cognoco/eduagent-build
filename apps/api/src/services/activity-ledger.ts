import { and, eq, inArray, isNull } from 'drizzle-orm';

import { mentorActivityLedger, type Database } from '@eduagent/database';
import type { LedgerKind, LedgerTemplateKey } from '@eduagent/schemas';

import { safeWrite } from './safe-non-core';

export interface WriteActivityMomentInput {
  db: Database;
  profileId: string;
  actorJob: string;
  kind: LedgerKind;
  templateKey: LedgerTemplateKey;
  params?: Record<string, unknown>;
}

export async function writeActivityMoment(
  input: WriteActivityMomentInput,
): Promise<void> {
  const { db, profileId, actorJob, kind, templateKey, params } = input;

  await safeWrite(
    () =>
      db.insert(mentorActivityLedger).values({
        profileId,
        actorJob,
        kind,
        templateKey,
        params: params ?? {},
        visibility: 'self',
      }),
    'activity-ledger.write',
    { profileId, actorJob, kind },
  );
}

export async function markMomentSurfaced(
  db: Database,
  profileId: string,
  ledgerIds: string[],
): Promise<void> {
  if (ledgerIds.length === 0) return;

  await safeWrite(
    () =>
      db
        .update(mentorActivityLedger)
        .set({ surfacedAt: new Date() })
        .where(
          and(
            eq(mentorActivityLedger.profileId, profileId),
            isNull(mentorActivityLedger.surfacedAt),
            inArray(mentorActivityLedger.id, ledgerIds),
          ),
        ),
    'activity-ledger.mark-surfaced',
    { profileId, count: ledgerIds.length },
  );
}
