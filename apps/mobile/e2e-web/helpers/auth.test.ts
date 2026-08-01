import type { Page } from '@playwright/test';

import { waitForSignedInReady } from './auth';
import { createOwnerJourneyPhaseDiagnostics } from './owner-journey-phase-diagnostics';

jest.mock('@clerk/testing/playwright', () => ({
  setupClerkTestingToken: jest.fn(),
}));

describe('owner journey sign-in readiness diagnostics', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retains sign-in-readiness while the landing marker is delayed', async () => {
    const output: string[] = [];
    const diagnostics = createOwnerJourneyPhaseDiagnostics({
      emit: (line) => output.push(line),
    });
    let elapsed = 0;
    const hidden = { isVisible: jest.fn(async () => false) };
    const landing = {
      isVisible: jest.fn(async () => elapsed >= 6_000),
    };
    const page = {
      url: () => 'https://app.test/mentor?ticket=forbidden-query',
      getByTestId: (testId: string) =>
        testId === 'mentor-screen' ? landing : hidden,
      getByRole: () => hidden,
      getByText: () => hidden,
      waitForTimeout: async (milliseconds: number) => {
        elapsed += milliseconds;
        await jest.advanceTimersByTimeAsync(milliseconds);
      },
    } as unknown as Page;

    await expect(
      waitForSignedInReady(
        page,
        {
          email: 'owner@example.test',
          password: 'forbidden-password',
          landingPath: '/mentor',
          landingTestId: 'mentor-screen',
          diagnostics,
          diagnosticReadinessMarker: 'mentor-screen',
        },
        { allowPostApproval: false },
      ),
    ).resolves.toBe('landing');

    expect(output).toContain(
      '[V2 owner journey] phase=sign-in-readiness elapsedMs=5000 pathname=/mentor readiness=mentor-screen',
    );
    expect(output.join('\n')).not.toContain('forbidden-query');
    expect(output.join('\n')).not.toContain('forbidden-password');

    diagnostics.dispose();
  });
});
