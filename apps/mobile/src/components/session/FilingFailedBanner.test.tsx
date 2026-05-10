import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ConflictError, RateLimitedError } from '@eduagent/schemas';

import { FilingFailedBanner } from './FilingFailedBanner';

// Mock Sentry before any component import
jest.mock('../../lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
}));

// Mock useRetryFiling hook
const mockMutateAsync = jest.fn();
jest.mock('../../hooks/use-retry-filing', () => ({
  useRetryFiling: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

function makeSession(
  filingStatus: 'filing_pending' | 'filing_failed' | 'filing_recovered' | null,
  filingRetryCount = 0,
  id = 'session-1',
) {
  return { id, filingStatus, filingRetryCount };
}

describe('FilingFailedBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('does not render when filingStatus is null', () => {
    render(<FilingFailedBanner session={makeSession(null)} />);
    expect(screen.queryByTestId('filing-failed-banner')).toBeNull();
  });

  it('renders pending state with spinner when filingStatus is filing_pending', () => {
    render(<FilingFailedBanner session={makeSession('filing_pending')} />);
    screen.getByTestId('filing-failed-banner');
    screen.getByText('Retrying topic placement...');
    expect(screen.queryByTestId('filing-retry-button')).toBeNull();
  });

  it('renders Try again button when filingStatus is filing_failed and retry_count < 3', () => {
    render(<FilingFailedBanner session={makeSession('filing_failed', 0)} />);
    screen.getByTestId('filing-failed-banner');
    screen.getByTestId('filing-retry-button');
    screen.getByText('Try again');
    screen.getByText('Topic placement needs attention');
  });

  it('disables retry button when filing_retry_count >= 3', () => {
    render(<FilingFailedBanner session={makeSession('filing_failed', 3)} />);
    const button = screen.getByTestId('filing-retry-button');
    // Pressable in the test renderer surfaces disabled state via accessibilityState,
    // which the component sets explicitly alongside the native disabled prop.
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('calls retry mutation and shows ConflictError inline message on conflict', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new ConflictError('Retry already in progress.'),
    );

    render(<FilingFailedBanner session={makeSession('filing_failed', 0)} />);

    fireEvent.press(screen.getByTestId('filing-retry-button'));

    await screen.findByText('A retry is already in progress.');
    expect(mockMutateAsync).toHaveBeenCalledWith({ sessionId: 'session-1' });
  });

  it('shows RateLimitedError inline message when rate limited', async () => {
    mockMutateAsync.mockRejectedValueOnce(
      new RateLimitedError('Retry limit reached for this session.'),
    );

    render(<FilingFailedBanner session={makeSession('filing_failed', 0)} />);

    fireEvent.press(screen.getByTestId('filing-retry-button'));

    expect(
      await screen.findByText('Retry limit reached. Please try again later.'),
    ).toBeTruthy();
  });

  it('auto-dismisses after 3 s when filingStatus transitions to filing_recovered', () => {
    jest.useFakeTimers();

    render(<FilingFailedBanner session={makeSession('filing_recovered')} />);

    // Banner should be visible immediately on filing_recovered
    expect(screen.queryByTestId('filing-failed-banner')).toBeTruthy();
    screen.getByText('Topic placement recovered.');

    // Advance past 3 000 ms — timer fires, setHidden(true), banner unmounts
    act(() => {
      jest.advanceTimersByTime(3100);
    });

    expect(screen.queryByTestId('filing-failed-banner')).toBeNull();

    jest.useRealTimers();
  });

  it('has accessibilityRole="alert" on the banner wrapper', () => {
    render(<FilingFailedBanner session={makeSession('filing_failed', 0)} />);
    const banner = screen.getByTestId('filing-failed-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
  });
});
