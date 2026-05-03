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

    screen.getByTestId('quota-exceeded-card');
    screen.getByText(/used 100 of 100/i);
    screen.getByTestId('quota-upgrade-btn');
  });

  it('owner view: upgrade button navigates to subscription screen', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={true} />);
    fireEvent.press(screen.getByTestId('quota-upgrade-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/subscription');
  });

  it('child view: shows ask-your-parent message', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    screen.getByTestId('quota-exceeded-card');
    screen.getByText(/ask your parent/i);
    expect(screen.queryByTestId('quota-upgrade-btn')).toBeNull();
  });

  it('daily limit variant: shows daily message', () => {
    const dailyDetails = { ...ownerDetails, reason: 'daily' as const };
    render(<QuotaExceededCard details={dailyDetails} isOwner={true} />);

    screen.getByText(/today's limit/i);
    screen.getByText(/used 10 of 10/i);
  });

  // H5: Child variant must have a navigation escape
  it('child view: shows Go home button so child is not stuck [H5]', () => {
    render(<QuotaExceededCard details={ownerDetails} isOwner={false} />);

    screen.getByTestId('quota-go-home-btn');
    screen.getByText(/go home/i);
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
});
