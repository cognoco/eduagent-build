import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => mockCanGoBack,
  }),
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#1f2937',
      primary: '#6366f1',
    }),
  }),
);

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

interface AssessmentEligibleTopic {
  topicId: string;
  subjectId: string;
  topicTitle: string;
  topicDescription: string;
  pedagogyMode: string;
  languageCode: string;
  subjectName: string;
  lastStudiedAt: string;
  activeAssessmentId: string | null;
}

let mockTopics: AssessmentEligibleTopic[] = [];
let mockIsLoading = false;
let mockIsError = false;
const mockRefetch = jest.fn();

jest.mock(
  '../../../hooks/use-assessments' /* gc1-allow: assessment hook fetches from API via React Query */,
  () => ({
    useAssessmentEligibleTopics: () => ({
      data: mockTopics,
      isLoading: mockIsLoading,
      isError: mockIsError,
      refetch: mockRefetch,
    }),
  }),
);

// ErrorFallback stub
jest.mock(
  '../../../components/common/ErrorFallback' /* gc1-allow: isolates fallback buttons for route-level state tests */,
  () => ({
    ErrorFallback: ({
      message,
      primaryAction,
      secondaryAction,
      testID,
    }: {
      variant?: string;
      title?: string;
      message: string;
      primaryAction: { label: string; testID?: string; onPress: () => void };
      secondaryAction?: { label: string; testID?: string; onPress: () => void };
      testID?: string;
    }) => {
      const { Pressable, Text, View } = require('react-native');
      return (
        <View testID={testID ?? 'error-fallback'}>
          <Text>{message}</Text>
          <Pressable
            onPress={primaryAction.onPress}
            testID={primaryAction.testID ?? 'error-primary'}
          >
            <Text>{primaryAction.label}</Text>
          </Pressable>
          {secondaryAction ? (
            <Pressable
              onPress={secondaryAction.onPress}
              testID={secondaryAction.testID ?? 'error-secondary'}
            >
              <Text>{secondaryAction.label}</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
  }),
);

// Button stub
jest.mock(
  '../../../components/common/Button' /* gc1-allow: isolates shared button styling from navigation behavior tests */,
  () => ({
    Button: ({
      label,
      onPress,
      testID,
    }: {
      label: string;
      onPress: () => void;
      testID?: string;
      variant?: string;
    }) => {
      const { Pressable, Text } = require('react-native');
      return (
        <Pressable onPress={onPress} testID={testID ?? `btn-${label}`}>
          <Text>{label}</Text>
        </Pressable>
      );
    },
  }),
);

const AssessmentPickerScreen = require('./assessment-picker')
  .default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssessmentPickerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockTopics = [];
    mockIsLoading = false;
    mockIsError = false;
    mockCanGoBack = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the picker screen', () => {
    const { getByTestId } = render(<AssessmentPickerScreen />);
    getByTestId('assessment-picker-screen');
  });

  it('navigates back when back button pressed', () => {
    const { getByTestId } = render(<AssessmentPickerScreen />);
    fireEvent.press(getByTestId('assessment-picker-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // [BUG-232 / X1-MED / AGENTS.md Rule 17] Cross-stack screens must not call
  // bare router.back() — when canGoBack is false (deep link, cold start into
  // this leaf), the fallback must route to the practice tab parent. Reverting
  // the goBackOrReplace wiring back to router.back() makes these red.
  describe('cross-stack back fallback when canGoBack=false', () => {
    beforeEach(() => {
      mockCanGoBack = false;
    });

    it('replaces to practice index from header back button', () => {
      const { getByTestId } = render(<AssessmentPickerScreen />);
      fireEvent.press(getByTestId('assessment-picker-back'));
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    });

    it('replaces to practice index from error fallback back button', () => {
      mockIsError = true;
      const { getByTestId } = render(<AssessmentPickerScreen />);
      fireEvent.press(getByTestId('assessment-picker-error-back'));
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    });

    it('replaces to practice index from timeout fallback back button', () => {
      mockIsLoading = true;
      const { getByTestId } = render(<AssessmentPickerScreen />);
      act(() => {
        jest.advanceTimersByTime(15_001);
      });
      fireEvent.press(getByTestId('assessment-picker-timeout-back'));
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    });
  });

  describe('loading state', () => {
    it('shows loading card while loading and timeout not reached', () => {
      mockIsLoading = true;
      const { getByTestId } = render(<AssessmentPickerScreen />);
      getByTestId('assessment-picker-loading');
    });

    it('shows timeout fallback after 15 seconds of loading', () => {
      mockIsLoading = true;
      const { getByTestId } = render(<AssessmentPickerScreen />);
      act(() => {
        jest.advanceTimersByTime(15_001);
      });
      getByTestId('assessment-picker-timeout');
    });

    it('clears timeout flag when loading finishes', () => {
      mockIsLoading = true;
      const { rerender, queryByTestId } = render(<AssessmentPickerScreen />);
      act(() => {
        jest.advanceTimersByTime(14_000);
      });
      // Loading finishes
      mockIsLoading = false;
      rerender(<AssessmentPickerScreen />);
      expect(queryByTestId('assessment-picker-timeout')).toBeNull();
    });
  });

  describe('error state', () => {
    it('shows error fallback on API error', () => {
      mockIsError = true;
      const { getByTestId } = render(<AssessmentPickerScreen />);
      getByTestId('assessment-picker-retry');
      getByTestId('assessment-picker-error-back');
    });

    it('calls refetch when retry button pressed', async () => {
      mockIsError = true;
      mockRefetch.mockResolvedValueOnce(undefined);
      const { getByTestId } = render(<AssessmentPickerScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('assessment-picker-retry'));
        await Promise.resolve();
      });
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('calls router.back when error back button pressed', () => {
      mockIsError = true;
      const { getByTestId } = render(<AssessmentPickerScreen />);
      fireEvent.press(getByTestId('assessment-picker-error-back'));
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty state', () => {
    it('shows empty state when no topics available', () => {
      mockTopics = [];
      const { getByTestId } = render(<AssessmentPickerScreen />);
      getByTestId('assessment-picker-empty');
    });

    it('navigates to library when browse button pressed', () => {
      mockTopics = [];
      const { getByTestId } = render(<AssessmentPickerScreen />);
      fireEvent.press(getByTestId('assessment-picker-browse'));
      expect(mockPush).toHaveBeenCalledWith('/(app)/library');
    });
  });

  describe('topics list', () => {
    const sampleTopics: AssessmentEligibleTopic[] = [
      {
        topicId: 'topic-1',
        subjectId: 'subject-1',
        topicTitle: 'Greetings',
        topicDescription: 'Basic greeting phrases',
        pedagogyMode: 'vocabulary',
        languageCode: 'es',
        subjectName: 'Spanish',
        lastStudiedAt: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        activeAssessmentId: null,
      },
      {
        topicId: 'topic-2',
        subjectId: 'subject-1',
        topicTitle: 'Numbers',
        topicDescription: 'Counting and numbers',
        pedagogyMode: 'vocabulary',
        languageCode: 'es',
        subjectName: 'Spanish',
        lastStudiedAt: new Date(
          Date.now() - 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        activeAssessmentId: 'assessment-42',
      },
    ];

    beforeEach(() => {
      mockTopics = sampleTopics;
    });

    it('renders topic cards for each eligible topic', () => {
      const { getByTestId } = render(<AssessmentPickerScreen />);
      getByTestId('assessment-topic-topic-1');
      getByTestId('assessment-topic-topic-2');
    });

    it('navigates to assessment screen with correct params when topic pressed', () => {
      const { getByTestId } = render(<AssessmentPickerScreen />);
      fireEvent.press(getByTestId('assessment-topic-topic-1'));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          pathname: '/(app)/practice/assessment',
          params: expect.objectContaining({
            subjectId: 'subject-1',
            topicId: 'topic-1',
            topicTitle: 'Greetings',
          }),
        }),
      );
    });
  });
});
