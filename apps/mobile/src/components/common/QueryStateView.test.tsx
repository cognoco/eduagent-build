import { Text, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { QueryStateView } from './QueryStateView';

describe('QueryStateView', () => {
  const noop = jest.fn();

  it('renders children when not loading and no error', () => {
    const { getByText, queryByTestId } = render(
      <QueryStateView isLoading={false} retry={{ onPress: noop }}>
        <Text>ready content</Text>
      </QueryStateView>,
    );
    getByText('ready content');
    expect(queryByTestId('spinner')).toBeNull();
  });

  it('renders the spinner while loading', () => {
    const { getByTestId, queryByText } = render(
      <QueryStateView isLoading retry={{ onPress: noop }} testID="spinner">
        <Text>ready content</Text>
      </QueryStateView>,
    );
    getByTestId('spinner');
    expect(queryByText('ready content')).toBeNull();
  });

  it('renders the error fallback with default labels when error is truthy', () => {
    const { getByText } = render(
      <QueryStateView
        isLoading={false}
        error={new Error('boom')}
        retry={{ onPress: noop }}
        back={{ onPress: noop }}
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    getByText('Retry');
    getByText('Go Back');
  });

  it('error takes precedence over isLoading', () => {
    const { getByText, queryByText } = render(
      <QueryStateView
        isLoading
        error={new Error('boom')}
        retry={{ onPress: noop }}
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    // Error branch renders the Retry button; success children are not shown.
    getByText('Retry');
    expect(queryByText('ready content')).toBeNull();
  });

  it('fires retry.onPress when the primary action is pressed in error state', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(
      <QueryStateView
        isLoading={false}
        error={new Error('boom')}
        retry={{ onPress: onRetry, testID: 'retry-btn' }}
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    fireEvent.press(getByTestId('retry-btn'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('fires back.onPress when the secondary action is pressed in error state', () => {
    const onBack = jest.fn();
    const { getByTestId } = render(
      <QueryStateView
        isLoading={false}
        error={new Error('boom')}
        retry={{ onPress: noop }}
        back={{ onPress: onBack, testID: 'back-btn' }}
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    fireEvent.press(getByTestId('back-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('honors custom action labels', () => {
    const { getByText } = render(
      <QueryStateView
        isLoading={false}
        error={new Error('boom')}
        retry={{ label: 'Try again', onPress: noop }}
        back={{ label: 'Home', onPress: noop }}
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    getByText('Try again');
    getByText('Home');
  });

  it('honors custom error title and message', () => {
    const { getByText } = render(
      <QueryStateView
        isLoading={false}
        error={new Error('boom')}
        retry={{ onPress: noop }}
        errorTitle="Something happened"
        errorMessage="Please try again in a moment"
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    getByText('Something happened');
    getByText('Please try again in a moment');
  });

  it('renders the default spinner when loading and no loadingFallback is provided', () => {
    const { getByTestId, queryByTestId } = render(
      <QueryStateView isLoading retry={{ onPress: noop }} testID="qsv-spinner">
        <Text>ready content</Text>
      </QueryStateView>,
    );
    // The default loading path renders TimeoutLoader's spinner View, which
    // forwards the QSV testID. The custom-fallback testID must not be present.
    getByTestId('qsv-spinner');
    expect(queryByTestId('custom-skeleton')).toBeNull();
  });

  it('renders the custom loadingFallback before the timeout fires', () => {
    const { getByTestId, queryByText } = render(
      <QueryStateView
        isLoading
        retry={{ onPress: noop }}
        loadingFallback={<View testID="custom-skeleton" />}
      >
        <Text>ready content</Text>
      </QueryStateView>,
    );
    getByTestId('custom-skeleton');
    // Success children must not render while loading.
    expect(queryByText('ready content')).toBeNull();
  });

  it('replaces loadingFallback with the timeout error UI after timeoutMs', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId, getByText, queryByTestId } = render(
        <QueryStateView
          isLoading
          retry={{ onPress: noop, testID: 'qsv-retry' }}
          loadingFallback={<View testID="custom-skeleton" />}
          timeoutMs={1_000}
          errorTitle="Took too long"
        >
          <Text>ready content</Text>
        </QueryStateView>,
      );
      // Fallback visible before timeout.
      getByTestId('custom-skeleton');
      // Advance past the timeout — fallback is replaced by the error UI.
      act(() => {
        jest.advanceTimersByTime(1_200);
      });
      getByText('Took too long');
      getByTestId('qsv-retry');
      expect(queryByTestId('custom-skeleton')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
