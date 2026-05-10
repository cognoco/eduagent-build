import type { Href, Router } from 'expo-router';
import type { LearningResumeTarget } from '@eduagent/schemas';

export const FAMILY_HOME_PATH = '/(app)/family';
export const LEARNER_HOME_RETURN_TO = 'learner-home';
export const LEARNER_HOME_HREF = '/(app)/home';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function homeHrefForReturnTo(
  returnTo: string | string[] | undefined,
): Href {
  return firstParam(returnTo) === LEARNER_HOME_RETURN_TO
    ? (LEARNER_HOME_HREF as Href)
    : ('/(app)/home' as Href);
}

export function goBackOrReplace(
  router: Pick<Router, 'back' | 'canGoBack' | 'replace'>,
  fallbackHref: Href,
): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}

export function pushLearningResumeTarget(
  router: Pick<Router, 'push'>,
  target: LearningResumeTarget,
  returnTo?: string,
): void {
  // [BUG-977 / CCR-PR126-M-2] Replace the previous `as never` cast (which
  // silenced the typed Href system entirely) with `as Href`. The Expo Router
  // generator types each route's params as required regardless of which
  // are optional in practice — and our params are all string-or-undefined,
  // so the structural shape can't be expressed without casting at all.
  // `as Href` keeps the pathname checked against the route table (a typo or
  // route rename will fail at compile time) while accepting the dynamic
  // params shape; `as never` allowed any pathname through.
  router.push({
    pathname: '/(app)/session',
    params: {
      mode: 'learning',
      subjectId: target.subjectId,
      subjectName: target.subjectName,
      ...(target.topicId ? { topicId: target.topicId } : {}),
      ...(target.topicTitle ? { topicName: target.topicTitle } : {}),
      ...(target.sessionId ? { sessionId: target.sessionId } : {}),
      ...(target.resumeFromSessionId
        ? { resumeFromSessionId: target.resumeFromSessionId }
        : {}),
      ...(returnTo ? { returnTo } : {}),
    },
  } as Href);
}
