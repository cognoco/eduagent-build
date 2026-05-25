import type { Database } from '@eduagent/database';
import {
  getSessionEffectiveMode,
  sessionAutoFileRequestedEventSchema,
} from '@eduagent/schemas';

import { FILING_CONFIG } from '../../config/filing';
import { inngest } from '../../inngest/client';
import { safeSend } from '../safe-non-core';
import { getSession } from './session-crud';

export function isClosePathAutoFileEligible(session: {
  metadata?: unknown;
  topicId?: string | null;
  filedAt?: string | Date | null;
  filingStatus?: string | null;
  exchangeCount?: number;
}): boolean {
  return (
    getSessionEffectiveMode(session) === 'freeform' &&
    session.topicId == null &&
    session.filedAt == null &&
    session.filingStatus == null &&
    (session.exchangeCount ?? 0) >= FILING_CONFIG.minFreeformExchanges
  );
}

export async function dispatchClosePathAutoFileIfEligible(
  db: Database,
  profileId: string,
  sessionId: string,
): Promise<void> {
  const session = await getSession(db, profileId, sessionId);
  if (!session || !isClosePathAutoFileEligible(session)) return;

  const dispatchId = 'initial';
  const payload = sessionAutoFileRequestedEventSchema.parse({
    profileId,
    sessionId,
    requestedAt: new Date().toISOString(),
    reason: 'freeform_session_closed',
    dispatchId,
  });

  await safeSend(
    () =>
      inngest.send({
        id: `auto-file-${sessionId}-${dispatchId}`,
        name: 'app/session.auto_file_requested',
        data: payload,
      }),
    'sessions.close.auto_file_requested',
    { profileId, sessionId },
  );
}
