import type { Href } from 'expo-router';

type SessionDetailHrefOptions = {
  sessionId: string;
  childProfileId?: string | null;
  subjectId?: string | null;
  topicId?: string | null;
  bookId?: string | null;
  returnTo?: string | null;
};

export function buildSessionDetailHref({
  sessionId,
  childProfileId,
  subjectId,
  topicId,
  bookId,
  returnTo,
}: SessionDetailHrefOptions): Href {
  if (childProfileId) {
    return {
      pathname: '/(app)/child/[profileId]/session/[sessionId]',
      params: {
        profileId: childProfileId,
        sessionId,
      },
    } as Href;
  }

  return {
    pathname: '/session-summary/[sessionId]',
    params: {
      sessionId,
      ...(subjectId ? { subjectId } : {}),
      ...(topicId ? { topicId } : {}),
      ...(bookId ? { bookId } : {}),
      ...(returnTo ? { returnTo } : {}),
    },
  } as Href;
}
