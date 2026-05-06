import { fireEvent, render, screen } from '@testing-library/react-native';

import { WithdrawalCountdownBanner } from './WithdrawalCountdownBanner';

const mockUseDashboard = jest.fn();
const mockMutate = jest.fn();

jest.mock('../../hooks/use-dashboard', () => ({ // gc1-allow: WithdrawalCountdownBanner reads dashboard data; mocking isolates banner rendering from real API calls.
  useDashboard: () => mockUseDashboard(),
}));

jest.mock('../../hooks/use-restore-consent', () => ({ // gc1-allow: restore-consent mutation is a network side effect; mocking lets tests verify CTA wiring without real API calls.
  useRestoreConsent: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

jest.mock('react-i18next', () => ({ // gc1-allow: i18next is an external library boundary; mocking gives stable translation output for snapshot assertions.
  useTranslation: () => require('../../test-utils/mock-i18n').i18nMock.useTranslation(),
}));

jest.mock('../../lib/platform-alert', () => ({
  platformAlert: jest.fn(),
}));

describe('WithdrawalCountdownBanner', () => {
  const respondedAt = '2026-05-06T10:00:00.000Z';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-07T10:00:00Z'));
    jest.clearAllMocks();
    mockUseDashboard.mockReturnValue({ data: { children: [] } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when no child is withdrawn in grace', () => {
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'c1',
            displayName: 'Liam',
            consentStatus: 'CONSENTED',
            respondedAt,
          },
        ],
      },
    });

    render(<WithdrawalCountdownBanner />);

    expect(screen.queryByTestId('withdrawal-countdown-banner')).toBeNull();
  });

  it('renders the single-child countdown and Reverse CTA', () => {
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'c1',
            displayName: 'Liam',
            consentStatus: 'WITHDRAWN',
            respondedAt,
          },
        ],
      },
    });

    render(<WithdrawalCountdownBanner />);

    expect(
      screen.getByText("Liam's account closes in 6 days")
    ).toBeTruthy();
    expect(screen.getByText('Reverse')).toBeTruthy();
  });

  it('renders multi-child summary with per-child rows', () => {
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'c1',
            displayName: 'Liam',
            consentStatus: 'WITHDRAWN',
            respondedAt,
          },
          {
            profileId: 'c2',
            displayName: 'Mia',
            consentStatus: 'WITHDRAWN',
            respondedAt,
          },
        ],
      },
    });

    render(<WithdrawalCountdownBanner />);

    expect(screen.getByText('2 accounts closing soon')).toBeTruthy();
    expect(screen.getByTestId('withdrawal-countdown-row-c1')).toBeTruthy();
    expect(screen.getByTestId('withdrawal-countdown-row-c2')).toBeTruthy();
  });

  it('calls useRestoreConsent.mutate with the right id when Reverse is pressed', () => {
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'c1',
            displayName: 'Liam',
            consentStatus: 'WITHDRAWN',
            respondedAt,
          },
        ],
      },
    });

    render(<WithdrawalCountdownBanner />);
    fireEvent.press(screen.getByTestId('withdrawal-countdown-reverse-c1'));

    expect(mockMutate).toHaveBeenCalledWith(
      { childProfileId: 'c1' },
      expect.objectContaining({
        onError: expect.any(Function),
        onSettled: expect.any(Function),
        onSuccess: expect.any(Function),
      })
    );
  });

  it('uses singular day when 1 day is left', () => {
    jest.setSystemTime(new Date('2026-05-12T10:00:00Z'));
    mockUseDashboard.mockReturnValue({
      data: {
        children: [
          {
            profileId: 'c1',
            displayName: 'Liam',
            consentStatus: 'WITHDRAWN',
            respondedAt,
          },
        ],
      },
    });

    render(<WithdrawalCountdownBanner />);

    expect(screen.getByText(/in 1 day$/)).toBeTruthy();
  });
});
