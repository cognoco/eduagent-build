import { and, eq } from 'drizzle-orm';
import {
  createScopedRepository,
  sessionEvents,
  type Database,
} from '@eduagent/database';

import { validateEvidenceOverlap } from '../evidence-overlap';

const MIN_MENTOR_NOTICE_EVIDENCE_OVERLAP = 0.4;

interface NoticeEvidenceSignal {
  answerEventId: string;
  learnerQuote: string;
}

export async function validateNoticeEvidence<T extends NoticeEvidenceSignal>(
  db: Database,
  profileId: string,
  sessionId: string,
  signal: T,
): Promise<T | null> {
  const repo = createScopedRepository(db, profileId);
  const event = await repo.sessionEvents.findFirst(
    and(
      eq(sessionEvents.id, signal.answerEventId),
      eq(sessionEvents.sessionId, sessionId),
      eq(sessionEvents.eventType, 'user_message'),
    ),
  );
  if (!event) return null;

  const overlap = validateEvidenceOverlap(
    signal.learnerQuote,
    event.content,
    MIN_MENTOR_NOTICE_EVIDENCE_OVERLAP,
  );
  if (!overlap.ok) return null;

  return { ...signal, learnerQuote: event.content };
}
