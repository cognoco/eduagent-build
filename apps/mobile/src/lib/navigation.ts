import type { Href, Router } from 'expo-router';
import type { LearningResumeTarget } from '@eduagent/schemas';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { useAppContext } from './app-context';

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
  //
  // [BUG-551] CLAUDE.md: cross-tab/cross-stack router.push must push the full
  // ancestor chain. A single push to /(app)/session synthesises a 1-deep stack,
  // so back() from session falls through to the active tab's first-route
  // (Home) instead of the caller's previous screen.
  // Fix: push the home screen first to seed the back-stack, then push session
  // on top. The session screen uses homeHrefForReturnTo(returnTo) for its own
  // back-navigation, so this also gives the correct target when returnTo is set.
  router.push('/(app)/home' as Href);
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

export function useGuardFamilyRoute(): {
  canRenderFamilyRoute: boolean;
  mode: ReturnType<typeof useAppContext>['mode'];
  familyCapable: boolean;
} {
  const router = useRouter();
  const { mode, setMode, familyCapable } = useAppContext();

  useEffect(() => {
    if (mode === 'family') return;
    if (!familyCapable) return;
    setMode('family');
    router.replace(FAMILY_HOME_PATH as Href);
  }, [familyCapable, mode, router, setMode]);

  return {
    canRenderFamilyRoute: mode === 'family',
    mode,
    familyCapable,
  };
}
