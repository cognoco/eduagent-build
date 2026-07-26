import { nowResponseSchema } from '@eduagent/schemas';
import type { Page, Response } from '@playwright/test';

export interface EmptyNowFeedObservation {
  status: number;
  authenticated: true;
  classification: {
    scope: 'self';
    cardCount: 0;
    overflowCount: number;
    generatedAtPresent: boolean;
  };
}

export type MentorRenderedBranch =
  | 'cold-start'
  | 'feed-error'
  | 'shell-without-terminal-feed'
  | 'mentor-not-mounted';

export async function describeMentorRenderedBranch(
  page: Page,
): Promise<MentorRenderedBranch> {
  if (await page.getByTestId('mentor-cold-start-card').isVisible()) {
    return 'cold-start';
  }
  if (await page.getByTestId('mentor-feed-error').isVisible()) {
    return 'feed-error';
  }
  if (await page.getByTestId('mentor-screen').isVisible()) {
    return 'shell-without-terminal-feed';
  }
  return 'mentor-not-mounted';
}

function isSelfNowResponse(response: Response): boolean {
  const url = new URL(response.url());
  return (
    response.request().method() === 'GET' &&
    url.pathname.endsWith('/v1/now') &&
    url.searchParams.get('scope') === 'self'
  );
}

/** Arm before the action that can issue the initial authenticated Now request. */
export async function observeEmptySelfNowFeed(
  page: Page,
): Promise<EmptyNowFeedObservation> {
  let response: Response;
  try {
    response = await page.waitForResponse(isSelfNowResponse);
  } catch (cause) {
    throw new Error('[now:transport] No exact self-feed response arrived', {
      cause,
    });
  }

  const authenticated = Boolean(response.request().headers().authorization);
  if (!authenticated) {
    throw new Error(
      '[now:auth] Exact self-feed request carried no authorization header',
    );
  }
  if (!response.ok()) {
    throw new Error(
      `[now:transport] Exact self-feed request returned ${response.status()}`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new Error('[now:api-payload] Self-feed response was not JSON', {
      cause,
    });
  }

  const parsed = nowResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `[now:api-payload] Self-feed response was invalid at ${parsed.error.issues
        .map((issue) => issue.path.join('.'))
        .join(', ')}`,
    );
  }
  if (parsed.data.scope !== 'self') {
    throw new Error(
      `[now:semantic] Expected self scope, received ${parsed.data.scope}`,
    );
  }
  if (parsed.data.cards.length !== 0) {
    throw new Error(
      `[now:semantic] Expected an empty self feed, received ${parsed.data.cards.length} card(s)`,
    );
  }

  return {
    status: response.status(),
    authenticated: true,
    classification: {
      scope: 'self',
      cardCount: 0,
      overflowCount: parsed.data.overflowCount,
      generatedAtPresent: parsed.data.generatedAt.length > 0,
    },
  };
}
