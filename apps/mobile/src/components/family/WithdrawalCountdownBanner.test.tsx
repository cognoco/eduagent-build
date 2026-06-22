import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WithdrawalCountdownBanner } from './WithdrawalCountdownBanner';

const mockMutate = jest.fn();

jest.mock(
  '../../hooks/use-restore-consent' /* gc1-allow: restore-consent is a network side effect; mocked for CTA wiring tests */,
  () => ({
    useRestoreConsent: () => ({ mutate: mockMutate, isPending: false }),
  }),
);

jest.mock('react-i18next', () => ({
  // gc1-allow: i18next is an external library boundary; mocking gives stable translation output for snapshot assertions.
  useTranslation: () =>
    require('../../test-utils/mock-i18n').i18nMock.useTranslation(),
}));

jest.mock(
  '../../lib/platform-alert' /* gc1-allow: platformAlert is a native display side effect; mocked for safe CTA assertions */,
  () => ({ platformAlert: jest.fn() }),
);

describe('WithdrawalCountdownBanner', () => {
  const respondedAt = '2026-05-06T10:00:00.000Z';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-07T10:00:00Z'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when childrenInGracePeriod is empty', () => {
    render(<WithdrawalCountdownBanner childrenInGracePeriod={[]} />);

    expect(screen.queryByTestId('withdrawal-countdown-banner')).toBeNull();
  });

  it('renders the single-child countdown and Reverse CTA', () => {
    render(
      <WithdrawalCountdownBanner
        childrenInGracePeriod={[
          { profileId: 'c1', displayName: 'Liam', respondedAt },
        ]}
      />,
    );

    expect(screen.getByText("Liam's account closes in 6 days"));
    expect(screen.getByText('Reverse'));
  });

  it('renders multi-child summary with per-child rows', () => {
    render(
      <WithdrawalCountdownBanner
        childrenInGracePeriod={[
          { profileId: 'c1', displayName: 'Liam', respondedAt },
          { profileId: 'c2', displayName: 'Mia', respondedAt },
        ]}
      />,
    );

    expect(screen.getByText('2 accounts closing soon'));
    expect(screen.getByTestId('withdrawal-countdown-row-c1'));
    expect(screen.getByTestId('withdrawal-countdown-row-c2'));
  });

  it('calls useRestoreConsent.mutate with the right id when Reverse is pressed', () => {
    render(
      <WithdrawalCountdownBanner
        childrenInGracePeriod={[
          { profileId: 'c1', displayName: 'Liam', respondedAt },
        ]}
      />,
    );
    fireEvent.press(screen.getByTestId('withdrawal-countdown-reverse-c1'));

    expect(mockMutate).toHaveBeenCalledWith(
      { childProfileId: 'c1' },
      expect.objectContaining({
        onError: expect.any(Function),
        onSettled: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('clears restore success when the child list changes', () => {
    const { rerender } = render(
      <WithdrawalCountdownBanner
        childrenInGracePeriod={[
          { profileId: 'c1', displayName: 'Liam', respondedAt },
        ]}
      />,
    );
    fireEvent.press(screen.getByTestId('withdrawal-countdown-reverse-c1'));
    const callbacks = mockMutate.mock.calls[0][1];
    act(() => {
      callbacks.onSuccess();
      callbacks.onSettled();
    });
    expect(screen.getByText('Withdrawal reversed for Liam'));

    rerender(
      <WithdrawalCountdownBanner
        childrenInGracePeriod={[
          { profileId: 'c2', displayName: 'Mia', respondedAt },
        ]}
      />,
    );

    expect(screen.queryByText('Withdrawal reversed for Liam')).toBeNull();
  });

  it('uses singular day when 1 day is left', () => {
    jest.setSystemTime(new Date('2026-05-12T10:00:00Z'));

    render(
      <WithdrawalCountdownBanner
        childrenInGracePeriod={[
          { profileId: 'c1', displayName: 'Liam', respondedAt },
        ]}
      />,
    );

    expect(screen.getByText(/in 1 day$/));
  });
});
