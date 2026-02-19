import { render, screen, fireEvent } from '@testing-library/react-native';
import { ParentDashboardSummary } from './ParentDashboardSummary';

describe('ParentDashboardSummary', () => {
  const defaultProps = {
    childName: 'Alex',
    summary: 'Alex: Math strong, Science fading. 4 sessions this week.',
    subjects: [
      { name: 'Mathematics', retentionStatus: 'strong' as const },
      { name: 'Science', retentionStatus: 'fading' as const },
    ],
    trend: 'up' as const,
    sessionsThisWeek: 4,
    sessionsLastWeek: 2,
    onDrillDown: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders child name as headline', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(screen.getByText('Alex')).toBeTruthy();
  });

  it('renders summary as subtext', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(
      screen.getByText(
        'Alex: Math strong, Science fading. 4 sessions this week.'
      )
    ).toBeTruthy();
  });

  it('renders temporal comparison with trend arrow', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(
      screen.getByText('4 sessions this week (\u2191 up from 2 last week)')
    ).toBeTruthy();
  });

  it('renders down trend correctly', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        trend="down"
        sessionsThisWeek={1}
        sessionsLastWeek={4}
      />
    );

    expect(
      screen.getByText('1 sessions this week (\u2193 down from 4 last week)')
    ).toBeTruthy();
  });

  it('renders stable trend correctly', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        trend="stable"
        sessionsThisWeek={3}
        sessionsLastWeek={3}
      />
    );

    expect(
      screen.getByText('3 sessions this week (\u2192 same as 3 last week)')
    ).toBeTruthy();
  });

  it('renders subject retention signals', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByText('Science')).toBeTruthy();
    // RetentionSignal renders labels like "Strong", "Fading"
    expect(screen.getByText('Strong')).toBeTruthy();
    expect(screen.getByText('Fading')).toBeTruthy();
  });

  it('calls onDrillDown when card pressed', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    fireEvent.press(screen.getByTestId('parent-dashboard-summary'));
    expect(defaultProps.onDrillDown).toHaveBeenCalledTimes(1);
  });

  it('calls onDrillDown when View details pressed', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    fireEvent.press(screen.getByTestId('parent-dashboard-summary-primary'));
    expect(defaultProps.onDrillDown).toHaveBeenCalled();
  });

  it('renders skeleton when loading', () => {
    render(<ParentDashboardSummary {...defaultProps} isLoading />);

    expect(screen.getByTestId('coaching-card-skeleton')).toBeTruthy();
    expect(screen.queryByText('Alex')).toBeNull();
  });

  it('handles empty subjects array', () => {
    render(<ParentDashboardSummary {...defaultProps} subjects={[]} />);

    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.queryByText('Mathematics')).toBeNull();
  });
});
