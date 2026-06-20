import type { Router } from 'expo-router';
import {
  nowDeepLinkRouteSchema,
  type NowDeepLink,
  type NowDeepLinkRoute,
} from '@eduagent/schemas';

export type SubjectHubTarget = 'legacy-shelf' | 'v2-subject-hub';

export interface PushNowDeepLinkOptions {
  subjectHubTarget?: SubjectHubTarget;
}

type PathBuilder = (
  params: Record<string, string>,
  options: Required<PushNowDeepLinkOptions>,
) => string;

const DEFAULT_OPTIONS: Required<PushNowDeepLinkOptions> = {
  subjectHubTarget: 'legacy-shelf',
};

const PATH_BUILDERS: Record<NowDeepLinkRoute, PathBuilder> = {
  'session.resume': (params) =>
    `/(app)/session?sessionId=${encodeURIComponent(
      requiredParam(params, 'sessionId', 'session.resume'),
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
    )}`,
  'challenge.start': (params) =>
    `/(app)/topic/${encodeURIComponent(
      requiredParam(params, 'topicId', 'challenge.start'),
    )}`,
  'support.hub': () => '/(app)/mentor',
  journal: () => '/(app)/journal',
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
  options: PushNowDeepLinkOptions = {},
): string {
  return PATH_BUILDERS[route](params, { ...DEFAULT_OPTIONS, ...options });
}

export function pushNowDeepLink(
  router: Pick<Router, 'push'>,
  deepLink: NowDeepLink,
  options: PushNowDeepLinkOptions = {},
): void {
  for (const route of [...deepLink.chain, deepLink.route]) {
    assertSupportedRoute(route);
    router.push(buildNowPath(route, deepLink.params, options) as never);
  }
}
