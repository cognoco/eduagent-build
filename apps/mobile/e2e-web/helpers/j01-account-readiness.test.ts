import type { Locator, Page, Request, Response } from '@playwright/test';
import { armJ01AccountReadiness } from './j01-account-readiness';

type PageListener = (value: never) => void;

function requestFor(pathname: string): Request {
  return {
    method: () => 'GET',
    url: () => `https://api.example.test${pathname}`,
  } as unknown as Request;
}

function pageWith(options: {
  pathname: string;
  visibleTestIds?: readonly string[];
  moreTitleVisible?: boolean;
}): {
  page: Page;
  setReadinessState(next: {
    pathname: string;
    visibleTestIds?: readonly string[];
  }): void;
  emitRequest(request: Request): void;
  emitRequestFailed(request: Request): void;
  emitResponse(response: Response): void;
} {
  const listeners = new Map<string, PageListener>();
  let pathname = options.pathname;
  let visibleTestIds = new Set(options.visibleTestIds ?? []);
  const locator = (visible: boolean) =>
    ({
      isVisible: async () => visible,
      first: () => locator(visible),
    }) as unknown as Locator;
  const page = {
    url: () => `https://app.example.test${pathname}`,
    getByTestId: (testId: string) => locator(visibleTestIds.has(testId)),
    getByText: () => locator(options.moreTitleVisible ?? false),
    getByRole: () => locator(false),
    on: (event: string, listener: PageListener) => {
      listeners.set(event, listener);
    },
    off: (event: string, listener: PageListener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
  } as unknown as Page;

  return {
    page,
    setReadinessState(next) {
      pathname = next.pathname;
      visibleTestIds = new Set(next.visibleTestIds ?? []);
    },
    emitRequest(request) {
      listeners.get('request')?.(request as never);
    },
    emitRequestFailed(request) {
      listeners.get('requestfailed')?.(request as never);
    },
    emitResponse(response) {
      listeners.get('response')?.(response as never);
    },
  };
}

describe('armJ01AccountReadiness', () => {
  it('retains an auth redirect that clears before the avatar timeout is reported', async () => {
    jest.useFakeTimers();
    try {
      const state = pageWith({
        pathname: '/sign-in?redirectTo=%2Fmore&ticket=secret',
        visibleTestIds: ['sign-in-email'],
      });
      const observation = armJ01AccountReadiness(state.page);

      await jest.advanceTimersByTimeAsync(250);
      state.setReadinessState({ pathname: '/more?ticket=secret' });

      await expect(observation.failureMessage(60_000)).resolves.toBe(
        '[J-01 account-readiness:auth-redirect] account-avatar-shell remained absent within 60000ms; committedPath=/more; profiles=not-requested',
      );

      observation.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('retains the first visible phase across later visible and unknown phases', async () => {
    jest.useFakeTimers();
    try {
      const state = pageWith({
        pathname: '/sign-in?redirectTo=%2Fmore&ticket=secret',
        visibleTestIds: ['sign-in-email'],
      });
      const observation = armJ01AccountReadiness(state.page);

      await jest.advanceTimersByTimeAsync(250);
      state.setReadinessState({
        pathname: '/more?ticket=secret',
        visibleTestIds: ['profile-loading'],
      });
      await jest.advanceTimersByTimeAsync(250);
      state.setReadinessState({ pathname: '/more?ticket=secret' });

      await expect(observation.failureMessage(60_000)).resolves.toBe(
        '[J-01 account-readiness:auth-redirect] account-avatar-shell remained absent within 60000ms; committedPath=/more; profiles=not-requested',
      );

      observation.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  it('distinguishes profile-pending from auth-redirect when the avatar is absent in both', async () => {
    const profilePending = pageWith({
      pathname: '/more?private=value',
      visibleTestIds: ['profile-loading'],
    });
    const profileObservation = armJ01AccountReadiness(profilePending.page);
    profilePending.emitRequest(requestFor('/v1/profiles'));

    const authRedirect = pageWith({
      pathname: '/sign-in?redirectTo=%2Fmore&ticket=secret',
      visibleTestIds: ['sign-in-email'],
    });
    const authObservation = armJ01AccountReadiness(authRedirect.page);

    await expect(
      profilePending.page.getByTestId('account-avatar-shell').isVisible(),
    ).resolves.toBe(false);
    await expect(
      authRedirect.page.getByTestId('account-avatar-shell').isVisible(),
    ).resolves.toBe(false);
    await expect(profileObservation.failureMessage(60_000)).resolves.toBe(
      '[J-01 account-readiness:profile-pending] account-avatar-shell remained absent within 60000ms; committedPath=/more; profiles=pending',
    );
    await expect(authObservation.failureMessage(60_000)).resolves.toBe(
      '[J-01 account-readiness:auth-redirect] account-avatar-shell remained absent within 60000ms; committedPath=/sign-in; profiles=not-requested',
    );

    profileObservation.dispose();
    authObservation.dispose();
  });

  it('reports the primary profile response status without reading sensitive response data', async () => {
    const profileError = pageWith({
      pathname: '/more?ticket=secret',
      visibleTestIds: ['profile-load-error'],
    });
    const request = requestFor('/v1/profiles');
    const response = {
      request: () => request,
      status: () => 503,
      headers: jest.fn(() => {
        throw new Error('headers must remain unread');
      }),
      text: jest.fn(async () => {
        throw new Error('body must remain unread');
      }),
    } as unknown as Response;
    const observation = armJ01AccountReadiness(profileError.page);
    profileError.emitRequest(request);
    profileError.emitResponse(response);

    await expect(observation.failureMessage(60_000)).resolves.toBe(
      '[J-01 account-readiness:profile-error] account-avatar-shell remained absent within 60000ms; committedPath=/more; profiles=response-503',
    );
    expect(response.headers).not.toHaveBeenCalled();
    expect(response.text).not.toHaveBeenCalled();

    observation.dispose();
  });

  it('reports a failed primary profile request without exposing transport details', async () => {
    const profileError = pageWith({
      pathname: '/more',
      visibleTestIds: ['profile-load-error'],
    });
    const request = requestFor('/v1/profiles');
    const observation = armJ01AccountReadiness(profileError.page);
    profileError.emitRequest(request);
    profileError.emitRequestFailed(request);

    await expect(observation.failureMessage(60_000)).resolves.toBe(
      '[J-01 account-readiness:profile-error] account-avatar-shell remained absent within 60000ms; committedPath=/more; profiles=request-failed',
    );

    observation.dispose();
  });

  it.each([
    ['auth-redirect-replay', 'auth-redirect-replay'],
    ['auth-redirect-timeout', 'auth-redirect-timeout'],
    ['profile-loading-timeout', 'profile-timeout'],
    ['preview-state-loading', 'preview-probe'],
    ['save-wizard-gate', 'preview-wizard'],
    ['create-profile-gate', 'profile-gate'],
    ['consent-pending-gate', 'consent-pending'],
    ['consent-withdrawn-gate', 'consent-withdrawn'],
  ])('labels visible %s as %s', async (testId, expectedPhase) => {
    const state = pageWith({ pathname: '/more', visibleTestIds: [testId] });
    const observation = armJ01AccountReadiness(state.page);

    await expect(observation.failureMessage(60_000)).resolves.toContain(
      `[J-01 account-readiness:${expectedPhase}]`,
    );

    observation.dispose();
  });

  it('labels committed More content without the avatar separately from upstream gates', async () => {
    const state = pageWith({ pathname: '/more', moreTitleVisible: true });
    const observation = armJ01AccountReadiness(state.page);

    await expect(observation.failureMessage(60_000)).resolves.toContain(
      '[J-01 account-readiness:more-title-without-avatar]',
    );

    observation.dispose();
  });
});
