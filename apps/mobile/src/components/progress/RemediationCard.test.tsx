import { fireEvent, render, screen, act } from '@testing-library/react-native';
import { RemediationCard } from './RemediationCard';

jest.mock(
  './RetentionSignal' /* gc1-allow: rendering stub — visual-only sub-component; mocking keeps RemediationCard tests focused on card logic */,
  () => {
    const { Text } = require('react-native');
    return {
      RetentionSignal: ({ status }: { status: string }) => (
        <Text testID={`retention-signal-${status}`}>{status}</Text>
      ),
    };
  },
);

const NOW = new Date('2026-06-01T12:00:00Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

function renderCard(
  overrides: Partial<React.ComponentProps<typeof RemediationCard>> = {},
) {
  const props = {
    retentionStatus: 'weak' as const,
    onReviewRetest: jest.fn(),
    onRelearnTopic: jest.fn(),
    ...overrides,
  };
  render(<RemediationCard {...props} />);
  return props;
}

describe('RemediationCard', () => {
  describe('without cooldown', () => {
    it('renders the card with retention signal', () => {
      renderCard({ retentionStatus: 'fading' });

      screen.getByTestId('remediation-card');
      screen.getByTestId('retention-signal-fading');
    });

    it('calls onRelearnTopic on primary CTA press', () => {
      const props = renderCard();

      fireEvent.press(screen.getByTestId('relearn-topic-button'));
      expect(props.onRelearnTopic).toHaveBeenCalledTimes(1);
    });

    it('calls onReviewRetest when review button pressed', () => {
      const props = renderCard();

      fireEvent.press(screen.getByTestId('review-retest-button'));
      expect(props.onReviewRetest).toHaveBeenCalledTimes(1);
    });

    it('does not render cooldown message', () => {
      renderCard();

      expect(screen.queryByText(/You can try again/)).toBeNull();
      expect(screen.queryByText(/Come back tomorrow/)).toBeNull();
    });

    it('does not render library link even if onBookPress provided', () => {
      renderCard({ onBookPress: jest.fn() });

      expect(screen.queryByTestId('remediation-book-link')).toBeNull();
    });
  });

  describe('with active cooldown', () => {
    const inThirtyMinutes = new Date(NOW.getTime() + 30 * 60_000).toISOString();

    it('disables review-retest button and does not fire callback', () => {
      const props = renderCard({ cooldownEndsAt: inThirtyMinutes });

      const button = screen.getByTestId('review-retest-button');
      expect(button.props.accessibilityState?.disabled).toBe(true);

      fireEvent.press(button);
      expect(props.onReviewRetest).not.toHaveBeenCalled();
    });

    it('still fires onRelearnTopic during cooldown', () => {
      const props = renderCard({ cooldownEndsAt: inThirtyMinutes });

      fireEvent.press(screen.getByTestId('relearn-topic-button'));
      expect(props.onRelearnTopic).toHaveBeenCalledTimes(1);
    });

    it('shows minutes cooldown message for <1 hour', () => {
      renderCard({ cooldownEndsAt: inThirtyMinutes });

      screen.getByText(
        'You can try again in 30 minutes — go do something fun!',
      );
    });

    it('shows hours cooldown message for 1–4 hours', () => {
      const inTwoHours = new Date(
        NOW.getTime() + 2 * 60 * 60_000,
      ).toISOString();
      renderCard({ cooldownEndsAt: inTwoHours });

      screen.getByText(
        'You can try again in about 2 hours — your brain needs a real break!',
      );
    });

    it('shows tomorrow message for >4 hours', () => {
      const inSixHours = new Date(
        NOW.getTime() + 6 * 60 * 60_000,
      ).toISOString();
      renderCard({ cooldownEndsAt: inSixHours });

      screen.getByText('Come back tomorrow and try fresh!');
    });

    it('renders library link when onBookPress provided', () => {
      const onBookPress = jest.fn();
      renderCard({ cooldownEndsAt: inThirtyMinutes, onBookPress });

      const link = screen.getByTestId('remediation-book-link');
      fireEvent.press(link);
      expect(onBookPress).toHaveBeenCalledTimes(1);
    });

    it('does not render library link when onBookPress absent', () => {
      renderCard({ cooldownEndsAt: inThirtyMinutes });

      expect(screen.queryByTestId('remediation-book-link')).toBeNull();
    });
  });

  describe('cooldown expiry', () => {
    it('re-enables review button when cooldown expires', () => {
      const inFiveSeconds = new Date(NOW.getTime() + 5_000).toISOString();
      const props = renderCard({ cooldownEndsAt: inFiveSeconds });

      expect(
        screen.getByTestId('review-retest-button').props.accessibilityState
          ?.disabled,
      ).toBe(true);

      act(() => {
        jest.advanceTimersByTime(6_000);
      });

      expect(
        screen.getByTestId('review-retest-button').props.accessibilityState
          ?.disabled,
      ).toBeFalsy();

      fireEvent.press(screen.getByTestId('review-retest-button'));
      expect(props.onReviewRetest).toHaveBeenCalledTimes(1);
    });

    it('treats past cooldownEndsAt as immediately enabled', () => {
      const inThePast = new Date(NOW.getTime() - 10_000).toISOString();
      const props = renderCard({ cooldownEndsAt: inThePast });

      expect(
        screen.getByTestId('review-retest-button').props.accessibilityState
          ?.disabled,
      ).toBeFalsy();

      fireEvent.press(screen.getByTestId('review-retest-button'));
      expect(props.onReviewRetest).toHaveBeenCalledTimes(1);
    });
  });

  describe('retention status passthrough', () => {
    it.each(['strong', 'fading', 'weak', 'forgotten'] as const)(
      'passes %s status to RetentionSignal',
      (status) => {
        renderCard({ retentionStatus: status });
        screen.getByTestId(`retention-signal-${status}`);
      },
    );
  });
});
