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

interface InterleavedNoticeTopic {
  topicId: string;
  subjectId?: string;
  title: string;
}

interface MentorNoticeTarget {
  subjectId: string;
  topicId: string | null;
}

export function resolveMentorNoticeTarget(
  session: NoticeSourceSession,
  signal: NoticedGapSignal,
  interleavedTopics: InterleavedNoticeTopic[] = [],
): MentorNoticeTarget | null {
  if (session.sessionType !== 'interleaved') {
    return { subjectId: session.subjectId, topicId: session.topicId };
  }

  if (!signal.topicId) return null;
  const matched = interleavedTopics.find(
    (topic) => topic.topicId === signal.topicId && Boolean(topic.subjectId),
  );
  return matched?.subjectId
    ? { subjectId: matched.subjectId, topicId: matched.topicId }
    : null;
}

export async function createMentorNoticeFromExchange(
  db: Database,
  input: {
    profileId: string;
    session: NoticeSourceSession;
    signal: NoticedGapSignal;
    interleavedTopics?: InterleavedNoticeTopic[];
    isMentorNoticeRecheck?: boolean;
  },
): Promise<MentorNoticeAccepted | null> {
  if (input.isMentorNoticeRecheck) return null;

  const target = resolveMentorNoticeTarget(
    input.session,
    input.signal,
    input.interleavedTopics,
  );
  if (!target) return null;

  const evidence = await validateNoticeEvidence(
    db,
    input.profileId,
    input.session.id,
    input.signal,
  );
  if (!evidence) return null;

  return acceptMentorNotice(db, {
    profileId: input.profileId,
    subjectId: target.subjectId,
    topicId: target.topicId,
    sourceSessionId: input.session.id,
    concept: evidence.concept,
    correctionHint: evidence.correctionHint,
  });
}
