import type { Href, Router } from 'expo-router';
import type { LearningResumeTarget } from '@eduagent/schemas';
import { markHubToSessionTransition } from './navigation-transition-provenance';

export const FAMILY_HOME_PATH = '/(app)/home';
// [WI-1658]
export const FAMILY_HOME_RETURN_TO = 'family-home';
export const LEARNER_HOME_RETURN_TO = 'learner-home';
export const LEARNER_HOME_HREF = '/(app)/home';
export const OWN_LEARNING_RETURN_TO = 'own-learning';
export const OWN_LEARNING_HREF = '/(app)/own-learning';
export const PRACTICE_RETURN_TO = 'practice';
export const PRACTICE_HREF = '/(app)/practice';
export const JOURNAL_RETURN_TO = 'journal';
export const JOURNAL_HREF = '/(app)/journal';
export const MENTOR_RETURN_TO = 'mentor';
export const MENTOR_HREF = '/(app)/mentor';
export const SUBJECTS_RETURN_TO = 'subjects';
export const SUBJECTS_HREF = '/(app)/subjects';
export const SUBJECT_HUB_RETURN_TO = 'subject-hub';
export const SETTINGS_RETURN_TO = 'settings';
export const FAMILY_RECAPS_RETURN_TO = 'family-recaps';
export const FAMILY_RECAPS_HREF = '/(app)/recaps';
export const FAMILY_PROGRESS_RETURN_TO = 'family-progress';
export const FAMILY_PROGRESS_HREF = '/(app)/progress';
export const STUDY_PROGRESS_RETURN_TO = 'study-progress';
export const STUDY_PROGRESS_HREF = '/(app)/progress';
export const FAMILY_CHILDREN_RETURN_TO = 'family-children';
export const FAMILY_CHILDREN_HREF = '/(app)/home';

type StaticHomeReturnToken =
  | typeof OWN_LEARNING_RETURN_TO
  | typeof LEARNER_HOME_RETURN_TO
  | typeof PRACTICE_RETURN_TO
  | typeof JOURNAL_RETURN_TO
  | typeof MENTOR_RETURN_TO
  | typeof SUBJECTS_RETURN_TO
  | typeof FAMILY_RECAPS_RETURN_TO
  | typeof FAMILY_HOME_RETURN_TO
  | typeof FAMILY_CHILDREN_RETURN_TO
  | typeof FAMILY_PROGRESS_RETURN_TO
  | typeof STUDY_PROGRESS_RETURN_TO;

const STATIC_HOME_RETURN_HREFS = {
  [OWN_LEARNING_RETURN_TO]: OWN_LEARNING_HREF,
  [LEARNER_HOME_RETURN_TO]: LEARNER_HOME_HREF,
  [PRACTICE_RETURN_TO]: PRACTICE_HREF,
  [JOURNAL_RETURN_TO]: JOURNAL_HREF,
  [MENTOR_RETURN_TO]: MENTOR_HREF,
  [SUBJECTS_RETURN_TO]: SUBJECTS_HREF,
  [FAMILY_RECAPS_RETURN_TO]: FAMILY_RECAPS_HREF,
  [FAMILY_HOME_RETURN_TO]: FAMILY_HOME_PATH,
  [FAMILY_CHILDREN_RETURN_TO]: FAMILY_CHILDREN_HREF,
  [FAMILY_PROGRESS_RETURN_TO]: FAMILY_PROGRESS_HREF,
  [STUDY_PROGRESS_RETURN_TO]: STUDY_PROGRESS_HREF,
} as const satisfies Record<StaticHomeReturnToken, Href>;

function isStaticHomeReturnToken(
  token: string | undefined,
): token is StaticHomeReturnToken {
  return (
    token !== undefined &&
    Object.prototype.hasOwnProperty.call(STATIC_HOME_RETURN_HREFS, token)
  );
}

export type V2AccountReturnToken = 'mentor' | 'subjects' | 'journal';

const V2_ACCOUNT_RETURN_HREFS = {
  mentor: '/(app)/mentor',
  subjects: '/(app)/subjects',
  journal: '/(app)/journal',
} as const satisfies Record<V2AccountReturnToken, Href>;

export function isSessionForwardableReturnTo(
  returnTo: string | undefined,
): returnTo is
  | typeof SUBJECTS_RETURN_TO
  | typeof LEARNER_HOME_RETURN_TO
  | typeof OWN_LEARNING_RETURN_TO {
  return (
    returnTo === SUBJECTS_RETURN_TO ||
    returnTo === LEARNER_HOME_RETURN_TO ||
    returnTo === OWN_LEARNING_RETURN_TO
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Pin Account to three V2 tab roots; unknown pushed routes return to Mentor, not retired Home.
export function accountReturnTokenForPathname(
  pathname: string,
): V2AccountReturnToken {
  const isChildSubjectsRoute =
    /^\/child\/[^/]+\/(?:curriculum|(?:subjects|topic)\/[^/]+)\/?$/.test(
      pathname,
    );

  if (
    isChildSubjectsRoute ||
    pathname === '/subjects' ||
    pathname.startsWith('/subjects/') ||
    pathname === '/subject' ||
    pathname.startsWith('/subject/') ||
    pathname === '/subject-hub' ||
    pathname.startsWith('/subject-hub/') ||
    pathname === '/topic' ||
    pathname.startsWith('/topic/') ||
    pathname === '/pick-book' ||
    pathname.startsWith('/pick-book/') ||
    pathname === '/vocabulary' ||
    pathname.startsWith('/vocabulary/') ||
    pathname === '/shelf' ||
    pathname.startsWith('/shelf/')
  ) {
    return 'subjects';
  }
  if (pathname === '/journal' || pathname.startsWith('/journal/')) {
    return 'journal';
  }
  return 'mentor';
}

export function accountReturnToken(
  returnTo: string | string[] | undefined,
): V2AccountReturnToken {
  const token = firstParam(returnTo);
  return token === 'subjects' || token === 'journal' ? token : 'mentor';
}

/** Resolve Account's empty-history fallback without trusting arbitrary URLs. */
export function accountReturnHref(
  returnTo: string | string[] | undefined,
  v2Enabled: boolean,
): Href {
  if (!v2Enabled) return FAMILY_HOME_PATH as Href;

  return V2_ACCOUNT_RETURN_HREFS[accountReturnToken(returnTo)] as Href;
}

export function childProfileHref(
  profileId: string,
  mode?: 'progress' | 'settings',
): Href {
  const encodedProfileId = encodeURIComponent(profileId);
  if (!mode) {
    return `/(app)/child/${encodedProfileId}` as Href;
  }

  const encodedMode = encodeURIComponent(mode);
  return `/(app)/child/${encodedProfileId}?mode=${encodedMode}` as Href;
}

export function homeHrefForReturnTo(
  returnTo: string | string[] | undefined,
  returnId?: string | string[] | undefined,
): Href {
  const token = firstParam(returnTo);
  const id = firstParam(returnId);
  switch (token) {
    case SUBJECT_HUB_RETURN_TO:
      if (id) {
        return {
          pathname: '/(app)/subject-hub/[subjectId]',
          params: { subjectId: id },
        } as Href;
      }
      break;
    case FAMILY_RECAPS_RETURN_TO:
      if (id) {
        return {
          pathname: '/(app)/recaps/[recapId]',
          params: { recapId: id },
        } as Href;
      }
      break;
    case FAMILY_CHILDREN_RETURN_TO:
      if (id) return childProfileHref(id);
      break;
  }

  if (isStaticHomeReturnToken(token)) {
    return STATIC_HOME_RETURN_HREFS[token];
  }

  // FAMILY_HOME_PATH is the canonical /(app)/home fallback. Unknown or
  // incomplete tokens never become paths.
  return FAMILY_HOME_PATH as Href;
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
 * @see AGENTS.md — "cross-tab / cross-stack router.push" rule: pushes must
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

/**
 * Return a Journal-origin report to Journal without leaving Reports behind.
 *
 * Web replaces the report with Journal because Expo Router's stack can point
 * at the hidden Progress ancestor instead of the visible Journal caller.
 * Native dismisses the complete cross-tab Progress ancestry to Journal.
 */
export function returnJournalReportToCaller(
  router: Pick<Router, 'dismissTo' | 'replace'>,
  platform: 'web' | 'native',
): void {
  if (platform === 'web') {
    router.replace(JOURNAL_HREF);
    return;
  }

  router.dismissTo(JOURNAL_HREF);
}

export function pushLearningResumeTarget(
  router: Pick<Router, 'push'>,
  target: LearningResumeTarget,
  returnTo?: string,
  returnId?: string,
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
  // [BUG-551] AGENTS.md: cross-tab/cross-stack router.push must push the full
  // ancestor chain. A single push to /(app)/session synthesises a 1-deep stack,
  // so back() from session falls through to the active tab's first-route
  // (Home) instead of the caller's previous screen.
  // Preserve the legacy contract for V0/V1 callers: Home is always seeded as
  // the ancestor, while returnTo controls only Session's deterministic Back.
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
      ...(returnId ? { returnId } : {}),
    },
  } as Href);
}

export function replaceV2LearningResumeTarget(
  router: Pick<Router, 'replace'>,
  target: LearningResumeTarget,
  returnTo: typeof SUBJECTS_RETURN_TO,
  options: { preserveSubjectsHistory: boolean },
): void {
  if (options.preserveSubjectsHistory) {
    markHubToSessionTransition(target.subjectId);
  }

  router.replace({
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
      returnTo,
    },
  } as Href);
}

/**
 * Cross-tab push from the Progress tab to a linked child's monthly report.
 *
 * [BUG-524] AGENTS.md: cross-tab/cross-stack `router.push` must push the full
 * ancestor chain. A direct push to `child/[profileId]/report/[reportId]` from
 * the Progress tab synthesises a 1-deep stack containing only the leaf, so
 * `router.back()` from the leaf falls through to the Tabs first-route (Home)
 * rather than the child's index. `unstable_settings.initialRouteName` in
 * `child/[profileId]/_layout.tsx` only seeds one level, so it does NOT cover
 * this 2-segment push — push the parent first, then the leaf.
 */
export function pushChildReport(
  router: Pick<Router, 'push'>,
  profileId: string,
  reportId: string,
): void {
  router.push(childProfileHref(profileId));
  router.push({
    pathname: '/(app)/child/[profileId]/report/[reportId]',
    params: { profileId, reportId },
  } as Href);
}

/**
 * Cross-tab push from the Progress tab to a linked child's weekly report.
 * See {@link pushChildReport} for the rationale.
 */
export function pushChildWeeklyReport(
  router: Pick<Router, 'push'>,
  profileId: string,
  weeklyReportId: string,
): void {
  router.push(childProfileHref(profileId));
  router.push({
    pathname: '/(app)/child/[profileId]/weekly-report/[weeklyReportId]',
    params: { profileId, weeklyReportId },
  } as Href);
}

/**
 * Cross-tab push from the Progress or Home tab to a linked child's reports
 * LIST screen (not a single report).
 *
 * [WI-1067] Mirrors {@link pushChildReport} but targets the `reports` index
 * rather than a leaf `report/[reportId]` — so no reportId param is needed.
 * See {@link pushChildReport} for the ancestor-chain rationale.
 */
export function pushChildReports(
  router: Pick<Router, 'push'>,
  profileId: string,
): void {
  router.push(childProfileHref(profileId));
  router.push({
    pathname: '/(app)/child/[profileId]/reports',
    params: { profileId },
  } as Href);
}

/**
 * [WI-1393, renamed WI-1137] Push a managed person (an owner's linked,
 * not-yet-supported child) into the link-ceremony initiate screen.
 * `link/initiate` is a `FULL_SCREEN_ROUTES` entry with no nested dynamic
 * child (its sibling `link/[contractId]` is a separate leaf, not a
 * descendant) — a single push is enough, matching the direct-push precedent
 * already used for quiz/dictation/homework-camera from Mentor.
 *
 * `relation: 'parent'` reflects the only relationship this MVP entry point
 * expresses: the adult account owner starting a support link for their own
 * linked child. Cross-account / non-owner relations reach the same screen's
 * inline picker (WI-1137) instead.
 */
export function pushLinkInitiateForManagedPerson(
  router: Pick<Router, 'push'>,
  person: { id: string; displayName: string },
): void {
  router.push({
    pathname: '/(app)/link/initiate',
    params: {
      supporteePersonId: person.id,
      supporteeName: person.displayName,
      relation: 'parent',
    },
  } as Href);
}

/**
 * [WI-1393] Graceful degrade for the "start supporting" picker when there
 * are zero eligible managed persons: guide the owner to add a child first
 * instead of pushing `/link/initiate` param-less (which would land on that
 * screen's own inline picker instead — this helper skips straight to
 * add-child from the SupportHub anchors). Mirrors the add-child destination
 * used by `AccountAdminSheet`'s "Add child" row.
 */
export function pushAddChildForSupport(router: Pick<Router, 'push'>): void {
  router.push({
    pathname: '/create-profile',
    params: { for: 'child' },
  } as Href);
}

/**
 * [WI-1137 Codex P2] Push `/(app)/link/initiate` param-less so that screen's
 * own inline picker (managed-child list + the join-my-family existing-teen
 * entry, WI-1753) takes over. Distinct from `pushLinkInitiateForManagedPerson`,
 * which always pre-fills a specific managed child and bypasses the picker.
 */
export function pushLinkInitiatePicker(router: Pick<Router, 'push'>): void {
  router.push('/(app)/link/initiate' as Href);
}
