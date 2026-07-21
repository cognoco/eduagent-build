import type { Href, Router } from 'expo-router';
import {
  nowDeepLinkRouteSchema,
  type NowCard,
  type NowDeepLink,
  type NowDeepLinkRoute,
  type ScopeDescriptor,
} from '@eduagent/schemas';

export type SubjectHubTarget = 'legacy-shelf' | 'v2-subject-hub';

interface NowPathOptions {
  subjectHubTarget?: SubjectHubTarget;
}

export interface PushNowDeepLinkOptions extends NowPathOptions {
  // WI-2223: a support.hub pointer must select the Support-hub scope before
  // the Mentor tab opens, or the learner Mentor surface renders instead
  // (activeScope is otherwise unchanged by the push). Callers that hold
  // useScopeContext pass their setActiveScope through here.
  setActiveScope?: (scope: ScopeDescriptor) => void;
}

type PathBuilder = (
  params: Record<string, string>,
  options: Required<NowPathOptions>,
) => string;

const DEFAULT_OPTIONS: Required<NowPathOptions> = {
  subjectHubTarget: 'legacy-shelf',
};

function ledgerKind(card: NowCard): string {
  return typeof card.params['ledgerKind'] === 'string'
    ? card.params['ledgerKind']
    : card.templateKey.replace('now.ledger_moment.', '');
}

export function withJournalSectionIntent(card: NowCard): NowCard {
  if (card.deepLink.route !== 'journal') return card;

  if (ledgerKind(card) === 'quiz_personal_best') {
    return {
      ...card,
      deepLink: {
        ...card.deepLink,
        params: { ...card.deepLink.params, section: 'practice' },
      },
    };
  }

  // TODO: Map a future Journal-routed ledger kind only after product assigns
  // it to one of the existing Journal sections; unknown kinds stay at root.
  if (!('section' in card.deepLink.params)) return card;
  const rootParams = { ...card.deepLink.params };
  delete rootParams['section'];
  return {
    ...card,
    deepLink: { ...card.deepLink, params: rootParams },
  };
}

const PATH_BUILDERS: Partial<Record<NowDeepLinkRoute, PathBuilder>> = {
  'settings.more': () => '/(app)/more',
  'settings.account': () => '/(app)/more/account',
  'billing.manage': () => '/(app)/subscription',
  'session.resume': (params) =>
    `/(app)/session?sessionId=${encodeURIComponent(
      requiredParam(params, 'sessionId', 'session.resume'),
    )}`,
  // [WI-1121 review fix] Matches the path buildSessionDetailHref() builds for
  // a completed session (session-detail-navigation.ts) — the recap/summary
  // screen, distinct from 'session.resume' (the live session chat).
  'session.summary': (params) =>
    `/session-summary/${encodeURIComponent(
      requiredParam(params, 'sessionId', 'session.summary'),
    )}`,
  'subject.hub': (params, options) => {
    const subjectId = encodeURIComponent(
      requiredParam(params, 'subjectId', 'subject.hub'),
    );
    return options.subjectHubTarget === 'v2-subject-hub'
      ? `/(app)/subject-hub/${subjectId}`
      : `/(app)/shelf/${subjectId}`;
  },
  'subject.topic': (params) =>
    `/(app)/topic/${encodeURIComponent(
      requiredParam(params, 'topicId', 'subject.topic'),
    )}`,
  'retention.review': (params) =>
    `/(app)/topic/${encodeURIComponent(
      requiredParam(params, 'topicId', 'retention.review'),
    )}?mode=review`,
  'challenge.start': (params) =>
    `/(app)/topic/${encodeURIComponent(
      requiredParam(params, 'topicId', 'challenge.start'),
    )}?mode=challenge`,
  'support.hub': () => '/(app)/mentor',
  journal: (params) =>
    params['section']
      ? `/(app)/journal?section=${encodeURIComponent(params['section'])}`
      : '/(app)/journal',
};

function assertSupportedRoute(
  route: string,
): asserts route is NowDeepLinkRoute {
  if (!nowDeepLinkRouteSchema.safeParse(route).success) {
    throw new Error(`Unsupported route in now deep link: ${route}`);
  }
}

function requiredParam(
  params: Record<string, string>,
  key: string,
  route: NowDeepLinkRoute,
): string {
  const value = params[key];
  if (!value) {
    throw new Error(
      `Missing '${key}' param for now deep-link route '${route}'`,
    );
  }
  return value;
}

export function buildNowPath(
  route: NowDeepLinkRoute,
  params: Record<string, string>,
  options: NowPathOptions = {},
): string {
  if (route === 'notice.recheck') {
    throw new Error('notice.recheck is an action route, not a navigation path');
  }
  const builder = PATH_BUILDERS[route];
  if (!builder) throw new Error(`Unsupported now path route: ${route}`);
  return builder(params, { ...DEFAULT_OPTIONS, ...options });
}

export function pushNowDeepLink(
  router: Pick<Router, 'push'>,
  deepLink: NowDeepLink,
  options: PushNowDeepLinkOptions = {},
): void {
  for (const route of [...deepLink.chain, deepLink.route]) {
    assertSupportedRoute(route);
    if (route === 'support.hub') {
      options.setActiveScope?.({ kind: 'supporter-hub' });
    }
    router.push(buildNowPath(route, deepLink.params, options) as Href);
  }
}
