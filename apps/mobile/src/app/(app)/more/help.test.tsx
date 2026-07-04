import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOpenFeedback = jest.fn();
jest.mock(
  '../../../components/feedback/FeedbackProvider' /* gc1-allow: FeedbackProvider requires native shake detection and modal host */,
  () => ({
    useFeedbackContext: () => ({ openFeedback: mockOpenFeedback }),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps native Alert.alert */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

// Mock Linking
const mockOpenURL = jest.fn().mockResolvedValue(undefined);
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    Linking: {
      ...actual.Linking,
      openURL: (...args: unknown[]) => mockOpenURL(...args),
    },
  };
});

// SettingsRow / SectionHeader stubs
jest.mock(
  '../../../components/more/settings-rows' /* gc1-allow: isolates settings rows from NativeWind styling in screen test */,
  () => {
    const { Pressable, Text } = require('react-native');
    return {
      SectionHeader: ({ children }: { children: React.ReactNode }) => (
        <Text>{children}</Text>
      ),
      SettingsRow: ({
        label,
        onPress,
        testID,
      }: {
        label: string;
        onPress?: () => void;
        testID?: string;
      }) => (
        <Pressable onPress={onPress} testID={testID ?? `row-${label}`}>
          <Text>{label}</Text>
        </Pressable>
      ),
    };
  },
);

const HelpScreen = require('./help').default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HelpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenURL.mockResolvedValue(undefined);
  });

  it('renders help scroll and both rows', () => {
    const { getByTestId } = render(<HelpScreen />);
    getByTestId('more-help-scroll');
    getByTestId('more-row-help-support');
    getByTestId('more-row-report-problem');
  });

  it('renders the shake-to-report discovery hint', () => {
    const { getByTestId } = render(<HelpScreen />);
    getByTestId('more-help-shake-hint');
  });

  it('opens support email link when help row pressed', async () => {
    const { getByTestId } = render(<HelpScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('more-row-help-support'));
      await Promise.resolve();
    });
    expect(mockOpenURL).toHaveBeenCalledWith(
      expect.stringContaining('mailto:'),
    );
  });

  it('shows fallback alert when Linking.openURL fails', async () => {
    mockOpenURL.mockRejectedValueOnce(new Error('Cannot open URL'));
    const { getByTestId } = render(<HelpScreen />);
    await act(async () => {
      fireEvent.press(getByTestId('more-row-help-support'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockPlatformAlert).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
    );
  });

  it('calls openFeedback when report-a-problem row pressed', () => {
    const { getByTestId } = render(<HelpScreen />);
    fireEvent.press(getByTestId('more-row-report-problem'));
    expect(mockOpenFeedback).toHaveBeenCalledTimes(1);
  });
});
