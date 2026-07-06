import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// BUG-143 legacy path. PR3 must stop using this subscribe-specific endpoint
// for quota caps; keep the mock so the test can prove it is not touched.
const mockLegacySubscribeMutate = jest.fn();
jest.mock(
  '../../hooks/use-settings' /* gc1-allow: useNotifyParentSubscribe is a thin react-query wrapper around a real network mutation */,
  () => ({
    // Mocked at the hook boundary so this UI test can drive sending/sent/failed states deterministically.
    useNotifyParentSubscribe: () => ({
      mutate: mockLegacySubscribeMutate,
      isPending: false,
    }),
  }),
);

const mockNotifyMutate = jest.fn();
jest.mock(
  '../../hooks/use-child-cap-notifications' /* gc1-allow: hook wraps quota notification API boundary */,
  () => ({
    useNotifyParentChildCap: () => ({
      mutate: mockNotifyMutate,
      isPending: false,
    }),
  }),
);

const { QuotaExceededCard } = require('./QuotaExceededCard');

const ownerDetails = {
  tier: 'free' as const,
  effectiveAccessTier: 'free' as const,
  quotaModel: 'per-profile' as const,
  profileRole: 'child' as const,
  reason: 'monthly' as const,
  resetsAt: '2026-06-01T00:00:00.000Z',
  monthlyLimit: 100,
  usedThisMonth: 100,
  dailyLimit: 10,
  usedToday: 10,
  topUpCreditsRemaining: 0,
  upgradeOptions: [
    { tier: 'plus' as const, monthlyQuota: 700, priceMonthly: 9.99 },
  ],
};

describe('QuotaExceededCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('owner view: shows usage and upgrade button', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={true} />);

    screen.getByTestId('quota-exceeded-card');
    screen.getByText("You've used 100 of 100 questions this month.");
    screen.getByTestId('quota-upgrade-btn');
  });

  it('owner view: upgrade button navigates to subscription screen', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={true} />);
    fireEvent.press(screen.getByTestId('quota-upgrade-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('child view: shows quota-exceeded card and never offers owner upgrade', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    screen.getByTestId('quota-exceeded-card');
    expect(screen.queryByTestId('quota-upgrade-btn')).toBeNull();
  });

  it('child view: hides owner top-up actions even when details include credits', () => {
    render(
      <QuotaExceededCard
        details={{ ...ownerDetails, topUpCreditsRemaining: 500 }}
        isOwner={false}
      />,
    );

    screen.getByTestId('quota-notify-parent-btn');
    screen.getByTestId('quota-go-home-btn');
    expect(screen.queryByTestId('quota-upgrade-btn')).toBeNull();
    expect(screen.queryByTestId('quota-topup-btn')).toBeNull();
  });

  it('daily limit variant: shows daily message', () => {
    const dailyDetails = { ...ownerDetails, reason: 'daily' as const };
    render(<QuotaExceededCard details={dailyDetails} isOwner={true} />);

    screen.getByText('Daily limit reached');
    screen.getByText("You've used 10 of 10 questions today.");
  });

  // H5: Child variant must have a navigation escape
  it('child view: shows Go home button so child is not stuck [H5]', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    screen.getByTestId('quota-go-home-btn');
    screen.getByText('Go Home');
  });

  it('child view: Go home button navigates to home screen [H5]', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
    fireEvent.press(screen.getByTestId('quota-go-home-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
  });

  // BUG-713: child view must not surface adult/jargon copy ("upgrade", "plan")
  it('child view: never shows upgrade/plan jargon [BUG-713]', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
    expect(screen.queryByText(/upgrade/i)).toBeNull();
    expect(screen.queryByText(/plan/i)).toBeNull();
  });

  // BUG-143: child variant must offer an interactive notify-parent primary
  // action AND surface an approximate reset window. Previously the "ask
  // parent" hint was a static View with no recovery path and no time info.
  describe('BUG-143 child recovery actions', () => {
    it('renders an interactive notify-parent button (not a static View)', () => {
      render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
      const btn = screen.getByTestId('quota-notify-parent-btn');
      expect(btn).toBeTruthy();
      expect(btn.props.accessibilityRole).toBe('button');
    });

    it('shows a reset-time hint so the child knows when the limit lifts', () => {
      render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
      // monthly variant → monthly hint
      const hint = screen.getByTestId('quota-reset-hint');
      expect(hint.props.children).toMatch(/monthly limit resets/i);
    });

    it('switches to daily reset hint when reason is daily', () => {
      const daily = { ...ownerDetails, reason: 'daily' as const };
      render(<QuotaExceededCard details={daily} isOwner={false} />);
      const hint = screen.getByTestId('quota-reset-hint');
      expect(hint.props.children).toMatch(/daily limit resets/i);
    });

    it('tapping notify-parent invokes the mutation', () => {
      render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
      fireEvent.press(screen.getByTestId('quota-notify-parent-btn'));
      expect(mockNotifyMutate).toHaveBeenCalledWith(
        {
          kind: 'monthly_exceeded',
          resetsAt: '2026-06-01T00:00:00.000Z',
        },
        expect.any(Object),
      );
      expect(mockLegacySubscribeMutate).not.toHaveBeenCalled();
    });

    it('shows confirmation copy after successful notify', async () => {
      mockNotifyMutate.mockImplementation((_v, opts) => {
        opts?.onSuccess?.();
      });
      render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
      fireEvent.press(screen.getByTestId('quota-notify-parent-btn'));
      await waitFor(() => {
        expect(
          screen.getByText('Sent — parent has been notified'),
        ).toBeTruthy();
      });
    });

    it('offers a retry when notify fails (transient error must be recoverable)', async () => {
      mockNotifyMutate.mockImplementation((_v, opts) => {
        opts?.onError?.(new Error('network down'));
      });
      render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
      fireEvent.press(screen.getByTestId('quota-notify-parent-btn'));
      await waitFor(() => {
        expect(
          screen.getByText('Could not send — tap to try again'),
        ).toBeTruthy();
      });
    });

    it('keeps Go home as a secondary navigation escape (H5 preserved)', () => {
      render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
      expect(screen.getByTestId('quota-go-home-btn')).toBeTruthy();
    });
  });
});
