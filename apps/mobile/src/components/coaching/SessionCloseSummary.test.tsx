import { render, screen, fireEvent } from '@testing-library/react-native';
import { SessionCloseSummary } from './SessionCloseSummary';

describe('SessionCloseSummary', () => {
  const defaultProps = {
    headline: 'Nice work today',
    takeaways: [
      'Solid on electromagnetic forces',
      'Wave interference needs more practice',
    ],
    onDismiss: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders headline', () => {
    render(<SessionCloseSummary {...defaultProps} />);

    expect(screen.getByText('Nice work today')).toBeTruthy();
  });

  it('renders takeaway bullet points', () => {
    render(<SessionCloseSummary {...defaultProps} />);

    expect(screen.getByText('Solid on electromagnetic forces')).toBeTruthy();
    expect(
      screen.getByText('Wave interference needs more practice')
    ).toBeTruthy();
  });

  it('renders next check-in message when provided', () => {
    render(
      <SessionCloseSummary
        {...defaultProps}
        nextCheckIn="I'll check in 4 days."
      />
    );

    expect(screen.getByText("I'll check in 4 days.")).toBeTruthy();
  });

  it('does not render next check-in when not provided', () => {
    render(<SessionCloseSummary {...defaultProps} />);

    expect(screen.queryByText(/check in/)).toBeNull();
  });

  it('calls onDismiss when Done pressed', () => {
    render(<SessionCloseSummary {...defaultProps} />);

    fireEvent.press(screen.getByTestId('session-close-summary-primary'));
    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders bridge prompt as secondary when provided', () => {
    const onBridgeAccept = jest.fn();
    render(
      <SessionCloseSummary
        {...defaultProps}
        bridgePrompt="Want me to explain the pattern?"
        onBridgeAccept={onBridgeAccept}
      />
    );

    expect(screen.getByText('Want me to explain the pattern?')).toBeTruthy();

    fireEvent.press(screen.getByTestId('session-close-summary-secondary'));
    expect(onBridgeAccept).toHaveBeenCalledTimes(1);
  });

  it('does not render bridge prompt when not provided', () => {
    render(<SessionCloseSummary {...defaultProps} />);

    expect(screen.queryByTestId('session-close-summary-secondary')).toBeNull();
  });

  it('renders skeleton when loading', () => {
    render(<SessionCloseSummary {...defaultProps} isLoading />);

    expect(screen.getByTestId('coaching-card-skeleton')).toBeTruthy();
    expect(screen.queryByText('Nice work today')).toBeNull();
  });

  it('renders empty takeaways without crashing', () => {
    render(<SessionCloseSummary {...defaultProps} takeaways={[]} />);

    expect(screen.getByText('Nice work today')).toBeTruthy();
  });
});
