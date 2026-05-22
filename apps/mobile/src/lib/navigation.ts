import type { Href, Router } from 'expo-router';
import type { LearningResumeTarget } from '@eduagent/schemas';

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

/**
 * Navigate back in the stack, or replace the current screen with `fallbackHref`
 * when there is nowhere to go back to.
 *
 * **When the fallback fires**
 * `router.canGoBack()` returns `false` whenever the current screen is the
 * first (and only) entry in the navigation stack — most commonly when the
 * screen was reached via a deep-link or a cross-tab `router.push` that did
 * not first seed the ancestor chain. In that case this function calls
 * `router.replace(fallbackHref)` instead of `router.back()`.
 *
 * **Callers MUST pass the parent screen, NOT home.**
 * Passing `'/(app)/home'` as the fallback turns the first-route / deep-link
 * case into a UX dead-end: the user is dumped at Home with no way to return
 * to the content they came from. Pass the immediate parent of the current
 * screen — e.g. a list screen, a tab root, or the `more` tab — so that
 * `replace` keeps the user in the correct context.
 *
 * @see CLAUDE.md — "cross-tab / cross-stack router.push" rule: pushes must
 *   include the full ancestor chain so that `router.back()` resolves
 *   correctly and the fallback only fires as a last-resort guard.
 *
 * @param router  Expo Router instance (or a compatible test double).
 * @param fallbackHref  The parent screen href to `replace` with when the
 *   back-stack is empty. Must NOT be the app home screen unless the caller
 *   is certain it can only ever be reached from home.
 */
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
  // [PARENT-03] This hook is READ-ONLY. It must NOT call setMode() or
  // router.replace() as a side effect — doing so silently mutates the user's
  // mode when they deep-link into a child route from Study context.
  // The consumer (RequireFamilyContext) is responsible for rendering an
  // explicit opt-in CTA when mode !== 'family' and familyCapable is true,
  // or a protected fallback when familyCapable is false.
  const { mode, familyCapable } = useAppContext();

  return {
    canRenderFamilyRoute: mode === 'family',
    mode,
    familyCapable,
  };
}
