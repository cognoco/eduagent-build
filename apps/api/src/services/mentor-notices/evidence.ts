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
  learnerQuote?: string;
}

/**
 * [WI-2629] `learnerQuote` is optional: when present it must pass the
 * lexical-overlap hallucination guard (unchanged, ≥0.4); when absent, the
 * overlap check is skipped, but full provenance is still enforced — the
 * event must exist, be a `user_message`, and belong to this profile + session
 * (via `createScopedRepository`'s profileId scoping and the sessionId
 * filter). This is the security floor: omitting the quote never lets a
 * caller attach a notice to an event the learner doesn't own. `learnerQuote`
 * is never persisted regardless of this function's return value — see
 * creation.ts / state.ts, which never read it off the returned evidence.
 */
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

  if (signal.learnerQuote !== undefined) {
    const overlap = validateEvidenceOverlap(
      signal.learnerQuote,
      event.content,
      MIN_MENTOR_NOTICE_EVIDENCE_OVERLAP,
    );
    if (!overlap.ok) return null;
    return { ...signal, learnerQuote: event.content };
  }

  return signal;
}
