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

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ],
    activeProfile: { id: 'p1', displayName: 'Maria', isOwner: true },
    switchProfile: jest.fn(),
  }),
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

jest.mock('../../hooks/use-dashboard', () => ({
  useDashboard: () => ({ data: mockDashboardData }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

const { ParentGateway } = require('./ParentGateway');

describe('ParentGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 720, profileId: 'c1' },
      ],
    };
  });

  it('renders greeting with active profile name', () => {
    render(<ParentGateway />);

    expect(screen.getByText('Good morning, Maria!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  it('renders both intent cards', () => {
    render(<ParentGateway />);

    expect(screen.getByText("Check child's progress")).toBeTruthy();
    expect(screen.getByText('Learn something')).toBeTruthy();
  });

  it('shows child activity highlight with time', () => {
    render(<ParentGateway />);

    expect(screen.getByText('Emma practiced 12 min this week')).toBeTruthy();
  });

  it('shows fallback highlight when no activity', () => {
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 0, profileId: 'c1' },
      ],
    };

    render(<ParentGateway />);

    expect(screen.getByText('No activity today')).toBeTruthy();
  });

  it('shows fallback highlight when dashboard not loaded', () => {
    mockDashboardData = undefined;

    render(<ParentGateway />);

    expect(screen.getByText("See how they're doing")).toBeTruthy();
  });

  it('picks most active child for highlight', () => {
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 300, profileId: 'c1' },
        { displayName: 'Tomas', totalTimeThisWeek: 900, profileId: 'c2' },
      ],
    };

    render(<ParentGateway />);

    expect(screen.getByText('Tomas practiced 15 min this week')).toBeTruthy();
  });

  it('navigates to parent dashboard on "Check child\'s progress"', () => {
    render(<ParentGateway />);

    fireEvent.press(screen.getByTestId('gateway-check-progress'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/dashboard');
  });

  it('navigates to learn route on "Learn something"', () => {
    render(<ParentGateway />);

    fireEvent.press(screen.getByTestId('gateway-learn'));
    expect(mockPush).toHaveBeenCalledWith('/(learner)/learn');
  });
});
