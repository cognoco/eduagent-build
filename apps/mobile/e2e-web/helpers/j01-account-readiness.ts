import type { Page, Request, Response } from '@playwright/test';

type J01AccountReadinessPhase =
  | 'auth-redirect'
  | 'auth-redirect-replay'
  | 'auth-redirect-timeout'
  | 'profile-pending'
  | 'profile-loading'
  | 'profile-timeout'
  | 'profile-error'
  | 'preview-probe'
  | 'preview-wizard'
  | 'profile-gate'
  | 'consent-pending'
  | 'consent-withdrawn'
  | 'more-title-without-avatar'
  | 'unknown';

export interface J01AccountReadinessObservation {
  failureMessage(timeout: number): Promise<string>;
  dispose(): void;
}

export function armJ01AccountReadiness(
  page: Page,
): J01AccountReadinessObservation {
  let profileRequestState = 'not-requested';
  let primaryProfileRequest: Request | null = null;
  const onRequest = (request: Request): void => {
    const url = new URL(request.url());
    if (
      profileRequestState === 'not-requested' &&
      request.method() === 'GET' &&
      url.pathname === '/v1/profiles'
    ) {
      primaryProfileRequest = request;
      profileRequestState = 'pending';
    }
  };
  const onResponse = (response: Response): void => {
    if (response.request() === primaryProfileRequest) {
      profileRequestState = `response-${response.status()}`;
    }
  };
  const onRequestFailed = (request: Request): void => {
    if (request === primaryProfileRequest) {
      profileRequestState = 'request-failed';
    }
  };
  page.on('request', onRequest);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  async function testIdIsVisible(testId: string): Promise<boolean> {
    return page
      .getByTestId(testId)
      .isVisible()
      .catch(() => false);
  }

  async function visiblePhase(
    committedPath: string,
  ): Promise<J01AccountReadinessPhase> {
    if (
      committedPath === '/sign-in' ||
      (await testIdIsVisible('sign-in-email'))
    ) {
      return 'auth-redirect';
    }

    const gatePhases = [
      ['auth-redirect-timeout', 'auth-redirect-timeout'],
      ['auth-redirect-replay', 'auth-redirect-replay'],
      ['profile-loading-timeout', 'profile-timeout'],
      ['profile-load-error', 'profile-error'],
    ] as const;
    for (const [testId, phase] of gatePhases) {
      if (await testIdIsVisible(testId)) return phase;
    }

    if (await testIdIsVisible('profile-loading')) {
      return profileRequestState === 'pending'
        ? 'profile-pending'
        : 'profile-loading';
    }

    const appGatePhases = [
      ['preview-state-loading', 'preview-probe'],
      ['save-wizard-gate', 'preview-wizard'],
      ['create-profile-gate', 'profile-gate'],
      ['consent-pending-gate', 'consent-pending'],
      ['consent-withdrawn-gate', 'consent-withdrawn'],
    ] as const;
    for (const [testId, phase] of appGatePhases) {
      if (await testIdIsVisible(testId)) return phase;
    }

    if (
      await page
        .getByText('More', { exact: true })
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return 'more-title-without-avatar';
    }

    return 'unknown';
  }

  return {
    async failureMessage(timeout) {
      const committedPath = new URL(page.url()).pathname;
      const phase = await visiblePhase(committedPath);

      return (
        `[J-01 account-readiness:${phase}] account-avatar-shell remained absent within ${timeout}ms; ` +
        `committedPath=${committedPath}; profiles=${profileRequestState}`
      );
    },
    dispose() {
      page.off('request', onRequest);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    },
  };
}
