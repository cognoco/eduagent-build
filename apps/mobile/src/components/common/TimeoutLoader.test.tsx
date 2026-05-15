import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TimeoutLoader } from './TimeoutLoader';

describe('TimeoutLoader', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows contextual loading copy before the timeout fallback', () => {
    render(
      <TimeoutLoader
        isLoading
        loadingLabel="Loading history..."
        loadingDescription="Checking recent quiz rounds."
        primaryAction={{ label: 'Retry', onPress: jest.fn() }}
        testID="loader"
      />,
    );

    screen.getByTestId('loader');
    screen.getByText('Loading history...');
    screen.getByText('Checking recent quiz rounds.');
  });

  it('replaces the spinner with actionable fallback after timeout', () => {
    jest.useFakeTimers();
    const retry = jest.fn();
    const goBack = jest.fn();

    render(
      <TimeoutLoader
        isLoading
        timeoutMs={1000}
        title="Could not load history"
        message="Check your connection and try again."
        primaryAction={{
          label: 'Retry',
          onPress: retry,
          testID: 'loader-retry',
        }}
        secondaryAction={{
          label: 'Go Back',
          onPress: goBack,
          testID: 'loader-back',
        }}
        testID="loader"
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    screen.getByText('Could not load history');
    fireEvent.press(screen.getByTestId('loader-retry'));
    fireEvent.press(screen.getByTestId('loader-back'));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
