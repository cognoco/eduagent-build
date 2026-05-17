import type { Href, Router } from 'expo-router';
import type { LearningResumeTarget } from '@eduagent/schemas';

export const FAMILY_HOME_PATH = '/(app)/home';
export const LEARNER_HOME_RETURN_TO = 'learner-home';
export const LEARNER_HOME_HREF = '/(app)/home';
export const OWN_LEARNING_RETURN_TO = 'own-learning';
export const OWN_LEARNING_HREF = '/(app)/own-learning';
export const PRACTICE_RETURN_TO = 'practice';
export const PRACTICE_HREF = '/(app)/practice';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function homeHrefForReturnTo(
  returnTo: string | string[] | undefined,
): Href {
  const token = firstParam(returnTo);
  if (token === OWN_LEARNING_RETURN_TO) return OWN_LEARNING_HREF as Href;
  if (token === LEARNER_HOME_RETURN_TO) return LEARNER_HOME_HREF as Href;
  if (token === PRACTICE_RETURN_TO) return PRACTICE_HREF as Href;
  return '/(app)/home' as Href;
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
