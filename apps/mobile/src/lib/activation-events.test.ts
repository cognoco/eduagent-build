import { renderHook, waitFor } from '@testing-library/react-native';
import { createRoutedMockFetch } from '../test-utils/mock-api-routes';
import { Sentry } from './sentry';

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.2.3' },
}));

jest.mock('expo-updates', () => ({
  channel: 'preview',
}));

const mockFetch = createRoutedMockFetch();

// Pattern A: spread the real module, override only useApiClient so the
// typed Hono RPC client is bound to the routed mock fetch instead of a real
// network call.
jest.mock('./api-client', () => ({
  ...jest.requireActual('./api-client'),
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

// [WI-1689] Late `require()`, not a top-level `import` — ES imports are
// hoisted above the `const mockFetch = ...` above, which would make the
// `jest.mock('./api-client', ...)` factory close over `mockFetch` before it
// exists. A `require()` here runs in its actual textual position, after
// `mockFetch` is assigned. Same pattern as `require('./relearn').default` in
// relearn.test.tsx.

const { useReportActivationEvent } = require('./activation-events') as {
  useReportActivationEvent: typeof import('./activation-events').useReportActivationEvent;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  mockFetch.mockClear();
});

describe('useReportActivationEvent', () => {
  it('posts the event with anonymousId/appVersion/platform/environment populated', async () => {
    mockFetch.setRoute('/activation-events', { recorded: true });

    const { result } = renderHook(() => useReportActivationEvent());
    result.current('app_opened', { route: 'app_launch' });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      eventType: 'app_opened',
      anonymousId: expect.stringMatching(UUID_PATTERN),
      appVersion: '1.2.3',
      platform: 'ios',
      environment: 'preview',
      route: 'app_launch',
    });
  });

  it('includes occurrenceId and metadata when supplied', async () => {
    mockFetch.setRoute('/activation-events', { recorded: true });

    const { result } = renderHook(() => useReportActivationEvent());
    result.current('review_card_seen', {
      occurrenceId: 'topic-42',
      route: 'topic.relearn',
      metadata: { subjectId: 'sub-1' },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      eventType: 'review_card_seen',
      occurrenceId: 'topic-42',
      route: 'topic.relearn',
      metadata: { subjectId: 'sub-1' },
    });
  });

  it('never throws when the network call fails', async () => {
    mockFetch.setRoute('/activation-events', () => {
      throw new Error('network down');
    });
    const captureSpy = jest.spyOn(Sentry, 'addBreadcrumb');

    const { result } = renderHook(() => useReportActivationEvent());

    expect(() => result.current('app_opened')).not.toThrow();

    await waitFor(() => {
      expect(captureSpy).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'activation-events' }),
      );
    });
  });
});
