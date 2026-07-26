import type { Page, Response } from '@playwright/test';
import {
  armEmptySelfNowFeedObservation,
  describeMentorRenderedBranch,
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

describe('armEmptySelfNowFeedObservation', () => {
  it('does not start the bounded response wait during pre-request account readiness', async () => {
    let onResponse!: (response: Response) => void;
    const page = {
      on: jest.fn((event: string, listener: (response: Response) => void) => {
        if (event === 'response') onResponse = listener;
      }),
      off: jest.fn(),
      waitForResponse: jest.fn(() => new Promise<Response>(() => undefined)),
    } as unknown as Page;

    const observer = armEmptySelfNowFeedObservation(page);

    // Account bootstrap may consume the full default response timeout before
    // the authenticated request is issued under hosted-suite contention.
    await Promise.resolve();
    expect(page.waitForResponse).not.toHaveBeenCalled();
    onResponse(
      responseWith({}, { url: 'https://example.test/v1/now?scope=person' }),
    );

    const response = responseWith();
    onResponse(response);

    await expect(observer.settle()).resolves.toEqual({
      status: 200,
      authenticated: true,
      classification: {
        scope: 'self',
        cardCount: 0,
        overflowCount: 0,
        generatedAtPresent: true,
      },
    });
    expect(page.waitForResponse).not.toHaveBeenCalled();
    observer.dispose();
  });

  it('reports a non-empty feed without retaining card content', async () => {
    const secretCardText = 'credential-shaped card content';
    const page = {
      on: jest.fn(),
      off: jest.fn(),
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

    const firstObserver = armEmptySelfNowFeedObservation(page);
    await expect(firstObserver.settle()).rejects.toThrow(
      '[now:semantic] Expected an empty self feed, received 1 card(s)',
    );
    firstObserver.dispose();
    const secondObserver = armEmptySelfNowFeedObservation(page);
    await expect(secondObserver.settle()).rejects.not.toThrow(secretCardText);
    secondObserver.dispose();
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
