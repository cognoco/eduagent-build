import type { Page, Response } from '@playwright/test';
import {
  describeMentorRenderedBranch,
  observeEmptySelfNowFeed,
} from './now-observation';

function responseWith(
  payload: Record<string, unknown> = {},
  options: {
    status?: number;
    url?: string;
    method?: string;
    authenticated?: boolean;
  } = {},
): Response {
  const status = options.status ?? 200;
  return {
    request: () => ({
      method: () => options.method ?? 'GET',
      headers: () =>
        options.authenticated === false
          ? {}
          : { authorization: 'Bearer credential-must-not-be-retained' },
    }),
    url: () => options.url ?? 'https://example.test/v1/now?scope=self',
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: async () => ({
      scope: 'self',
      cards: [],
      overflowCount: 0,
      generatedAt: '2026-07-26T18:00:00.000Z',
      ...payload,
    }),
  } as unknown as Response;
}

describe('observeEmptySelfNowFeed', () => {
  it('stays pending at shell readiness until the exact authenticated empty feed arrives', async () => {
    let resolveResponse!: (response: Response) => void;
    let responsePredicate!: (response: Response) => boolean;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const page = {
      waitForResponse: jest.fn((predicate: (response: Response) => boolean) => {
        responsePredicate = predicate;
        return responsePromise;
      }),
    } as unknown as Page;

    const observation = observeEmptySelfNowFeed(page);
    let settled = false;
    void observation.then(() => {
      settled = true;
    });

    // The Mentor shell can already be visible while this response is held.
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(
      responsePredicate(
        responseWith({}, { url: 'https://example.test/v1/now?scope=person' }),
      ),
    ).toBe(false);

    const response = responseWith();
    expect(responsePredicate(response)).toBe(true);
    resolveResponse(response);

    await expect(observation).resolves.toEqual({
      status: 200,
      authenticated: true,
      classification: {
        scope: 'self',
        cardCount: 0,
        overflowCount: 0,
        generatedAtPresent: true,
      },
    });
  });

  it('reports a non-empty feed without retaining card content', async () => {
    const secretCardText = 'credential-shaped card content';
    const page = {
      waitForResponse: jest.fn().mockResolvedValue(
        responseWith({
          cards: [
            {
              kind: 'retention_due',
              templateKey: secretCardText,
              params: {},
              deepLink: { route: 'retention.review', params: {}, chain: [] },
              scope: 'self',
            },
          ],
        }),
      ),
    } as unknown as Page;

    await expect(observeEmptySelfNowFeed(page)).rejects.toThrow(
      '[now:semantic] Expected an empty self feed, received 1 card(s)',
    );
    await expect(observeEmptySelfNowFeed(page)).rejects.not.toThrow(
      secretCardText,
    );
  });
});

describe('describeMentorRenderedBranch', () => {
  it('classifies a mounted shell with no terminal feed surface', async () => {
    const visibility: Record<string, boolean> = {
      'mentor-cold-start-card': false,
      'mentor-feed-error': false,
      'mentor-screen': true,
    };
    const page = {
      getByTestId: jest.fn((testId: string) => ({
        isVisible: jest.fn().mockResolvedValue(visibility[testId] ?? false),
      })),
    } as unknown as Page;

    await expect(describeMentorRenderedBranch(page)).resolves.toBe(
      'shell-without-terminal-feed',
    );
  });
});
