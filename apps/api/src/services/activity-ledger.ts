import { and, eq, inArray, isNull } from 'drizzle-orm';

import { mentorActivityLedger, type Database } from '@eduagent/database';
import type { LedgerKind } from '@eduagent/schemas';

import { safeWrite } from './safe-non-core';

export interface WriteActivityMomentInput {
  db: Database;
  profileId: string;
  actorJob: string;
  kind: LedgerKind;
  params?: Record<string, unknown>;
}

export async function writeActivityMoment(
  input: WriteActivityMomentInput,
): Promise<void> {
  const { db, profileId, actorJob, kind, params } = input;

  await safeWrite(
    () =>
      db.insert(mentorActivityLedger).values({
        profileId,
        actorJob,
        kind,
        params: params ?? {},
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
