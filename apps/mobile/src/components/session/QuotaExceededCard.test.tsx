import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const { QuotaExceededCard } = require('./QuotaExceededCard');

const ownerDetails = {
  tier: 'free' as const,
  reason: 'monthly' as const,
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

    expect(screen.getByTestId('quota-exceeded-card')).toBeTruthy();
    expect(screen.getByText(/used 100 of 100/i)).toBeTruthy();
    expect(screen.getByTestId('quota-upgrade-btn')).toBeTruthy();
  });

  it('owner view: upgrade button navigates to subscription screen', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={true} />);
    fireEvent.press(screen.getByTestId('quota-upgrade-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('child view: shows ask-your-parent message', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    expect(screen.getByTestId('quota-exceeded-card')).toBeTruthy();
    expect(screen.getByText(/ask your parent/i)).toBeTruthy();
    expect(screen.queryByTestId('quota-upgrade-btn')).toBeNull();
  });

  it('daily limit variant: shows daily message', () => {
    const dailyDetails = { ...ownerDetails, reason: 'daily' as const };
    render(<QuotaExceededCard details={dailyDetails} isOwner={true} />);

    expect(screen.getByText(/today's limit/i)).toBeTruthy();
    expect(screen.getByText(/used 10 of 10/i)).toBeTruthy();
  });

  // H5: Child variant must have a navigation escape
  it('child view: shows Go home button so child is not stuck [H5]', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    expect(screen.getByTestId('quota-go-home-btn')).toBeTruthy();
    expect(screen.getByText(/go home/i)).toBeTruthy();
  });

  it('child view: Go home button navigates to home screen [H5]', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);
    fireEvent.press(screen.getByTestId('quota-go-home-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/home');
  });
});
