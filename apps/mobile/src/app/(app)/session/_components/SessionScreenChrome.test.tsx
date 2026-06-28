import { fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';

import {
  SessionScreenChrome,
  type SessionScreenChromeProps,
} from './SessionScreenChrome';

function makeProps(
  overrides: Partial<SessionScreenChromeProps> = {},
): SessionScreenChromeProps {
  return {
    activeSessionId: 'session-1',
    isClosing: false,
    isStreaming: false,
    modeSubtitle: 'Homework help',
    showTimer: false,
    milestoneCount: 0,
    pendingClassification: false,
    classifyError: null,
    sessionExpired: false,
    resumedBanner: false,
    topicName: undefined,
    apiChecked: true,
    isApiReachable: true,
    showSkipWarmup: false,
    isSkippingWarmup: false,
    onEndSession: jest.fn(),
    onHomeBack: jest.fn(),
    onRetryClassification: jest.fn(),
    onChangeTopic: jest.fn(),
    onSkipWarmup: jest.fn(),
    ...overrides,
  };
}

describe('SessionScreenChrome', () => {
  it('keeps subtitle precedence stable', () => {
    expect(
      SessionScreenChrome(makeProps({ pendingClassification: true })).subtitle,
    ).toBe('Figuring out what this is about...');

    expect(
      SessionScreenChrome(
        makeProps({ classifyError: 'Could not classify this yet' }),
      ).subtitle,
    ).toBe('Could not classify this yet');

    expect(
      SessionScreenChrome(makeProps({ sessionExpired: true })).subtitle,
    ).toBe('Session expired - start a new one.');

    expect(
      SessionScreenChrome(
        makeProps({
          resumedBanner: true,
          topicName: 'Linear equations',
        }),
      ).subtitle,
    ).toContain('Linear equations');

    expect(
      SessionScreenChrome(
        makeProps({ apiChecked: true, isApiReachable: false }),
      ).subtitle,
    ).toBe('Server unreachable - messages may fail');
  });

  it('renders the end-session button with active-session and pre-session behavior', () => {
    const onEndSession = jest.fn();
    const activeChrome = SessionScreenChrome(makeProps({ onEndSession }));
    const activeScreen = render(<View>{activeChrome.headerRight}</View>);

    fireEvent.press(activeScreen.getByTestId('end-session-button'));

    expect(onEndSession).toHaveBeenCalledTimes(1);
    expect(activeScreen.getByText('Done')).toBeTruthy();

    const onHomeBack = jest.fn();
    const preSessionChrome = SessionScreenChrome(
      makeProps({ activeSessionId: null, onHomeBack }),
    );
    const preSessionScreen = render(
      <View>{preSessionChrome.headerRight}</View>,
    );

    fireEvent.press(preSessionScreen.getByTestId('end-session-button'));

    expect(onHomeBack).toHaveBeenCalledTimes(1);
    expect(preSessionScreen.getByText('Exit')).toBeTruthy();
  });

  it('wires retry classification and skip warm-up chips', () => {
    const onRetryClassification = jest.fn();
    const onSkipWarmup = jest.fn();
    const chrome = SessionScreenChrome(
      makeProps({
        classifyError: 'Could not classify this yet',
        showSkipWarmup: true,
        onRetryClassification,
        onSkipWarmup,
      }),
    );
    const testScreen = render(<View>{chrome.headerBelow}</View>);

    fireEvent.press(testScreen.getByTestId('classify-error-retry'));
    fireEvent.press(testScreen.getByTestId('session-skip-warmup'));

    expect(onRetryClassification).toHaveBeenCalledTimes(1);
    expect(onSkipWarmup).toHaveBeenCalledTimes(1);
  });
});
