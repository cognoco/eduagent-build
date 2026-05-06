import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../common', () => ({
  ProfileSwitcher: () => null,
}));

jest.mock('../family/WithdrawalCountdownBanner', () => ({
  WithdrawalCountdownBanner: () => null,
}));

let mockDashboardData:
  | {
      children: Array<{
        displayName: string;
        totalTimeThisWeek: number;
        profileId: string;
      }>;
    }
  | undefined;
let mockDashboardIsError = false;
const mockRefetch = jest.fn();

jest.mock('../../hooks/use-dashboard', () => ({
  useDashboard: () => ({
    data: mockDashboardData,
    isError: mockDashboardIsError,
    refetch: mockRefetch,
  }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

const { ParentGateway } = require('./ParentGateway');

const defaultProps = {
  profiles: [
    { id: 'p1', displayName: 'Maria', isOwner: true },
    { id: 'c1', displayName: 'Emma', isOwner: false },
  ],
  activeProfile: { id: 'p1', displayName: 'Maria', isOwner: true },
  switchProfile: jest.fn(),
};

describe('ParentGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDashboardIsError = false;
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 45, profileId: 'c1' },
      ],
    };
  });

  it('renders greeting with active profile name', () => {
    render(<ParentGateway {...defaultProps} />);

    screen.getByText('Good morning, Maria!');
    screen.getByText('Fresh mind, fresh start');
  });

  it('renders both intent cards', () => {
    render(<ParentGateway {...defaultProps} />);

    screen.getByText("Check child's progress");
    screen.getByText('Learn something');
  });

  it('shows child activity highlight with time', () => {
    render(<ParentGateway {...defaultProps} />);

    screen.getByText('Emma practiced 45 min this week');
  });

  it('shows fallback highlight when no activity', () => {
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 0, profileId: 'c1' },
      ],
    };

    render(<ParentGateway {...defaultProps} />);

    screen.getByText("Emma hasn't practiced this week");
  });

  it('shows fallback highlight when dashboard not loaded', () => {
    mockDashboardData = undefined;

    render(<ParentGateway {...defaultProps} />);

    screen.getByText("See how they're doing");
  });

  it('picks most active child for highlight', () => {
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 300, profileId: 'c1' },
        { displayName: 'Tomas', totalTimeThisWeek: 900, profileId: 'c2' },
      ],
    };

    render(<ParentGateway {...defaultProps} />);

    screen.getByText('Tomas practiced 900 min this week');
  });

  it('navigates to parent dashboard on "Check child\'s progress" with returnTo=home [BUG-905]', () => {
    render(<ParentGateway {...defaultProps} />);

    fireEvent.press(screen.getByTestId('gateway-check-progress'));
    // [BUG-905] Pass returnTo=home so the dashboard back button lands the
    // parent on Home, not on the More tab.
    expect(mockPush).toHaveBeenCalledWith('/(app)/family?returnTo=home');
  });

  it('calls onLearn when "Learn something" is pressed', () => {
    const onLearn = jest.fn();
    render(<ParentGateway {...defaultProps} onLearn={onLearn} />);

    fireEvent.press(screen.getByTestId('gateway-learn'));
    expect(onLearn).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to /create-subject when onLearn is not provided', () => {
    render(<ParentGateway {...defaultProps} />);

    fireEvent.press(screen.getByTestId('gateway-learn'));
    expect(mockPush).toHaveBeenCalledWith('/create-subject');
  });

  it('shows error banner and calls refetch on press when dashboard fails', () => {
    mockDashboardIsError = true;
    mockDashboardData = undefined;

    render(<ParentGateway {...defaultProps} />);

    screen.getByTestId('parent-dashboard-error');
    screen.getByText("We couldn't load the dashboard");
    screen.getByText('Retry');

    fireEvent.press(screen.getByTestId('parent-dashboard-error'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('does not show error banner when dashboard loads successfully', () => {
    render(<ParentGateway {...defaultProps} />);

    expect(screen.queryByTestId('parent-dashboard-error')).toBeNull();
  });
});
