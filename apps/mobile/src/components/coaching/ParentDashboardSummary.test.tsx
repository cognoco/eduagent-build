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
    totalTimeThisWeek: 85,
    totalTimeLastWeek: 40,
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
      screen.getByText(
        '4 sessions, 1h 25m this week (\u2191 up from 2 sessions, 40m last week)'
      )
    ).toBeTruthy();
  });

  it('renders down trend correctly', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        trend="down"
        sessionsThisWeek={1}
        sessionsLastWeek={4}
        totalTimeThisWeek={12}
        totalTimeLastWeek={90}
      />
    );

    expect(
      screen.getByText(
        '1 sessions, 12m this week (\u2193 down from 4 sessions, 1h 30m last week)'
      )
    ).toBeTruthy();
  });

  it('renders stable trend correctly', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        trend="stable"
        sessionsThisWeek={3}
        sessionsLastWeek={3}
        totalTimeThisWeek={60}
        totalTimeLastWeek={60}
      />
    );

    expect(
      screen.getByText(
        '3 sessions, 1h this week (\u2192 same as 3 sessions, 1h last week)'
      )
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
    expect(screen.getByTestId('aggregate-signal-empty')).toBeTruthy();
  });

  it('renders retention trend badge when improving', () => {
    render(
      <ParentDashboardSummary {...defaultProps} retentionTrend="improving" />
    );

    expect(screen.getByTestId('retention-trend-badge')).toBeTruthy();
    expect(screen.getByText(/Improving/)).toBeTruthy();
  });

  it('renders retention trend badge when declining', () => {
    render(
      <ParentDashboardSummary {...defaultProps} retentionTrend="declining" />
    );

    expect(screen.getByTestId('retention-trend-badge')).toBeTruthy();
    expect(screen.getByText(/Declining/)).toBeTruthy();
  });

  it('renders retention trend badge when stable', () => {
    render(
      <ParentDashboardSummary {...defaultProps} retentionTrend="stable" />
    );

    expect(screen.getByTestId('retention-trend-badge')).toBeTruthy();
    expect(screen.getByText(/Stable/)).toBeTruthy();
  });

  it('shows "No data yet" when retention trend not provided', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(screen.queryByTestId('retention-trend-badge')).toBeNull();
    expect(screen.getByTestId('retention-trend-empty')).toBeTruthy();
  });

  it('renders "Needs Attention" aggregate signal when any subject is fading', () => {
    render(<ParentDashboardSummary {...defaultProps} />);

    expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
    expect(screen.getByText('Needs Attention')).toBeTruthy();
  });

  it('renders "On Track" aggregate signal when all subjects are strong', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        subjects={[
          { name: 'Mathematics', retentionStatus: 'strong' },
          { name: 'Science', retentionStatus: 'strong' },
        ]}
      />
    );

    expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
    expect(screen.getByText('On Track')).toBeTruthy();
  });

  it('renders "Falling Behind" aggregate signal when any subject is weak', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        subjects={[
          { name: 'Mathematics', retentionStatus: 'strong' },
          { name: 'Science', retentionStatus: 'weak' },
        ]}
      />
    );

    expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
    expect(screen.getByText('Falling Behind')).toBeTruthy();
  });

  it('renders "Falling Behind" aggregate signal when any subject is forgotten', () => {
    render(
      <ParentDashboardSummary
        {...defaultProps}
        subjects={[{ name: 'Mathematics', retentionStatus: 'forgotten' }]}
      />
    );

    expect(screen.getByTestId('aggregate-signal')).toBeTruthy();
    expect(screen.getByText('Falling Behind')).toBeTruthy();
  });

  it('renders "No data yet" for aggregate signal when no subjects', () => {
    render(<ParentDashboardSummary {...defaultProps} subjects={[]} />);

    expect(screen.getByTestId('aggregate-signal-empty')).toBeTruthy();
    expect(screen.queryByTestId('aggregate-signal')).toBeNull();
  });
});
