import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { RetentionStatus } from './RetentionSignal';
import { RemediationCard } from './RemediationCard';

const defaultProps = {
  retentionStatus: 'fading' as RetentionStatus,
  onReviewRetest: jest.fn(),
  onRelearnTopic: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('without cooldown', () => {
  it('renders the card with retention signal', () => {
    render(<RemediationCard {...defaultProps} />);
    expect(screen.getByTestId('remediation-card')).toBeTruthy();
    expect(screen.getByTestId('retention-signal-fading')).toBeTruthy();
  });

  it('calls onRelearnTopic on primary CTA press', () => {
    render(<RemediationCard {...defaultProps} />);
    fireEvent.press(screen.getByTestId('relearn-topic-button'));
    expect(defaultProps.onRelearnTopic).toHaveBeenCalledTimes(1);
  });

  it('calls onReviewRetest when review button pressed', () => {
    render(<RemediationCard {...defaultProps} />);
    fireEvent.press(screen.getByTestId('review-retest-button'));
    expect(defaultProps.onReviewRetest).toHaveBeenCalledTimes(1);
  });

  it('does not render cooldown message', () => {
    const { queryByText } = render(<RemediationCard {...defaultProps} />);
    expect(queryByText(/You can try again/)).toBeNull();
    expect(queryByText(/Come back tomorrow/)).toBeNull();
  });

  it('does not render library link even if onBookPress provided', () => {
    const { queryByTestId } = render(
      <RemediationCard {...defaultProps} onBookPress={jest.fn()} />,
    );
    expect(queryByTestId('remediation-book-link')).toBeNull();
  });
});

describe('with active cooldown', () => {
  const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

  it('disables review-retest button and does not fire callback during cooldown', () => {
    const onReviewRetest = jest.fn();
    render(
      <RemediationCard
        {...defaultProps}
        onReviewRetest={onReviewRetest}
        cooldownEndsAt={inFuture(30 * 60_000)}
      />,
    );
    const btn = screen.getByTestId('review-retest-button');
    fireEvent.press(btn);
    expect(onReviewRetest).not.toHaveBeenCalled();
  });

  it('still fires onRelearnTopic during cooldown', () => {
    render(
      <RemediationCard
        {...defaultProps}
        cooldownEndsAt={inFuture(30 * 60_000)}
      />,
    );
    fireEvent.press(screen.getByTestId('relearn-topic-button'));
    expect(defaultProps.onRelearnTopic).toHaveBeenCalledTimes(1);
  });

  it('shows minutes cooldown message for <1 hour', () => {
    render(
      <RemediationCard
        {...defaultProps}
        cooldownEndsAt={inFuture(30 * 60_000)}
      />,
    );
    expect(screen.getByText(/You can try again in 30 minutes/)).toBeTruthy();
  });

  it('shows hours cooldown message for 1-4 hours', () => {
    render(
      <RemediationCard
        {...defaultProps}
        cooldownEndsAt={inFuture(2 * 60 * 60_000)}
      />,
    );
    expect(screen.getByText(/You can try again in about 2 hours/)).toBeTruthy();
  });

  it('shows tomorrow message for >4 hours', () => {
    render(
      <RemediationCard
        {...defaultProps}
        cooldownEndsAt={inFuture(5 * 60 * 60_000)}
      />,
    );
    expect(screen.getByText(/Come back tomorrow/)).toBeTruthy();
  });

  it('renders library link when onBookPress provided and fires it', () => {
    const onBookPress = jest.fn();
    render(
      <RemediationCard
        {...defaultProps}
        cooldownEndsAt={inFuture(30 * 60_000)}
        onBookPress={onBookPress}
      />,
    );
    const link = screen.getByTestId('remediation-book-link');
    fireEvent.press(link);
    expect(onBookPress).toHaveBeenCalledTimes(1);
  });

  it('does not render library link when onBookPress absent', () => {
    const { queryByTestId } = render(
      <RemediationCard
        {...defaultProps}
        cooldownEndsAt={inFuture(30 * 60_000)}
      />,
    );
    expect(queryByTestId('remediation-book-link')).toBeNull();
  });
});

describe('cooldown expiry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('re-enables review button when cooldown expires', () => {
    const onReviewRetest = jest.fn();
    const cooldownEndsAt = new Date(Date.now() + 5_000).toISOString();
    render(
      <RemediationCard
        {...defaultProps}
        onReviewRetest={onReviewRetest}
        cooldownEndsAt={cooldownEndsAt}
      />,
    );

    fireEvent.press(screen.getByTestId('review-retest-button'));
    expect(onReviewRetest).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(6_000);
    });

    fireEvent.press(screen.getByTestId('review-retest-button'));
    expect(onReviewRetest).toHaveBeenCalledTimes(1);
  });

  it('treats past cooldownEndsAt as immediately enabled', () => {
    const onReviewRetest = jest.fn();
    const past = new Date(Date.now() - 60_000).toISOString();
    render(
      <RemediationCard
        {...defaultProps}
        onReviewRetest={onReviewRetest}
        cooldownEndsAt={past}
      />,
    );
    fireEvent.press(screen.getByTestId('review-retest-button'));
    expect(onReviewRetest).toHaveBeenCalledTimes(1);
  });
});

describe('retention status passthrough', () => {
  it.each<RetentionStatus>(['strong', 'fading', 'weak', 'forgotten'])(
    'passes %s through to RetentionSignal',
    (status) => {
      render(<RemediationCard {...defaultProps} retentionStatus={status} />);
      expect(screen.getByTestId(`retention-signal-${status}`)).toBeTruthy();
    },
  );
});
