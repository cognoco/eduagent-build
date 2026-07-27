import type { Database } from '@eduagent/database';
import type {
  MentorNoticeAccepted,
  NoticedGapSignal,
  SessionType,
} from '@eduagent/schemas';

import { validateNoticeEvidence } from './evidence';
import { acceptMentorNotice } from './state';

interface NoticeSourceSession {
  id: string;
  subjectId: string;
  topicId: string | null;
  sessionType: SessionType;
}

/**
 * Validate and persist one evidence-backed mentor notice from an exchange.
 * The target subject/topic is always the authoritative session metadata —
 * never client- or LLM-supplied.
 *
 * [WI-2500] Interleaved sessions are out of MVP scope: a noticed gap cannot
 * be unambiguously attributed to one of an interleaved session's several
 * topics without a topicId on the proposal, and the proposal schema no
 * longer carries one (clause 1). Rejecting here mirrors the prompt no
 * longer asking the LLM for a notice in that session type
 * (exchange-prompts.ts's `mentorNoticeEnabled` gate).
 */
export async function createMentorNoticeFromExchange(
  db: Database,
  input: {
    profileId: string;
    session: NoticeSourceSession;
    signal: NoticedGapSignal;
    isMentorNoticeRecheck?: boolean;
    /**
     * [WI-2628] The vendor whose model produced `signal` — the real producer of
     * the notice copy. Threaded so the shared multilingual gate can refer
     * ambiguous copy to the INDEPENDENT judge with that vendor excluded from
     * judge selection. Omitting it is not a neutral default: AC-4 fails closed on
     * an unknown producer, so ambiguous copy would block outright and the notice
     * would never be written.
     */
    producerVendor?: string | null;
  },
): Promise<MentorNoticeAccepted | null> {
  if (input.isMentorNoticeRecheck) return null;
  if (input.session.sessionType === 'interleaved') return null;

  const evidence = await validateNoticeEvidence(
    db,
    input.profileId,
    input.session.id,
    input.signal,
  );
  if (!evidence) return null;

  return acceptMentorNotice(db, {
    profileId: input.profileId,
    subjectId: input.session.subjectId,
    topicId: input.session.topicId,
    sourceSessionId: input.session.id,
    answerEventId: evidence.answerEventId,
    concept: evidence.concept,
    correctionHint: evidence.correctionHint,
    producerVendor: input.producerVendor,
  });
}
