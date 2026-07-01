import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock(
  '../../../lib/theme' /* gc1-allow: theme hook requires native ColorScheme unavailable in JSDOM */,
  () => ({
    useThemeColors: () => ({
      danger: '#ef4444',
      success: '#22c55e',
      textSecondary: '#6b7280',
      primary: '#6366f1',
    }),
  }),
);

const mockGoBackOrReplace = jest.fn();
jest.mock(
  '../../../lib/navigation' /* gc1-allow: imports expo-router Router type */,
  () => ({
    goBackOrReplace: (...args: unknown[]) => mockGoBackOrReplace(...args),
  }),
);

const mockPlatformAlert = jest.fn();
jest.mock(
  '../../../lib/platform-alert' /* gc1-allow: wraps RN Alert.alert and Platform.OS — requires native Alert shim */,
  () => ({
    platformAlert: (...args: unknown[]) => mockPlatformAlert(...args),
  }),
);

const mockRecordMutateAsync = jest.fn();
let mockRecordIsPending = false;

jest.mock(
  '../../../hooks/use-dictation-api' /* gc1-allow: wraps api-client fetch boundary — needs network stub in unit tests */,
  () => ({
    useRecordDictationResult: () => ({
      mutateAsync: mockRecordMutateAsync,
      isPending: mockRecordIsPending,
    }),
  }),
);

// DictationData context — controlled per-test
const mockSetData = jest.fn();

interface ReviewResultMistake {
  original: string;
  written: string;
  error: string;
  correction: string;
  explanation: string;
}

interface ReviewResult {
  mistakes: ReviewResultMistake[];
  correctCount: number;
  totalSentences: number;
}

let mockReviewResult: ReviewResult | undefined = undefined;
let mockSentences: { text: string }[] = [
  { text: 'The quick brown fox.' },
  { text: 'Hello world.' },
];
const COMPLETION_KEY = '00000000-0000-4000-8000-000000000001';

jest.mock(
  './_layout' /* gc1-allow: layout depends on expo-router Stack and native theme */,
  () => ({
    useDictationData: () => ({
      data: {
        completionKey: COMPLETION_KEY,
        sentences: mockSentences,
        language: 'en',
        mode: 'homework',
        reviewResult: mockReviewResult,
      },
      setData: mockSetData,
      clear: jest.fn(),
    }),
  }),
);

const DictationReviewScreen = require('./review')
  .default as React.ComponentType;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DictationReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordIsPending = false;
    mockReviewResult = undefined;
    mockSentences = [
      { text: 'The quick brown fox.' },
      { text: 'Hello world.' },
    ];
  });

  describe('no-data guard', () => {
    it('shows no-data fallback when reviewResult is undefined', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      getByTestId('review-no-data');
      getByTestId('review-go-back');
    });

    it('navigates back from no-data fallback', () => {
      render(<DictationReviewScreen />);
      fireEvent.press(
        require('@testing-library/react-native').screen.getByTestId(
          'review-go-back',
        ),
      );
      expect(mockGoBackOrReplace).toHaveBeenCalled();
    });
  });

  describe('perfect score (no mistakes)', () => {
    beforeEach(() => {
      mockReviewResult = {
        mistakes: [],
        correctCount: 2,
        totalSentences: 2,
      };
    });

    it('shows celebration screen immediately', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      getByTestId('review-celebration');
    });

    it('shows done button and navigates to practice on press', async () => {
      mockRecordMutateAsync.mockResolvedValueOnce(undefined);
      const { getByTestId } = render(<DictationReviewScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('review-done'));
        await Promise.resolve();
      });
      expect(mockRecordMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          completionKey: COMPLETION_KEY,
          reviewed: true,
        }),
      );
      expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');
    });

    it('ignores a synchronous double-press while saving the result', () => {
      mockRecordMutateAsync.mockReturnValue(new Promise(() => undefined));
      const { getByTestId } = render(<DictationReviewScreen />);
      const done = getByTestId('review-done');

      act(() => {
        fireEvent.press(done);
        fireEvent.press(done);
      });

      expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('keeps Done locked after a successful save while navigation is pending', async () => {
      mockRecordMutateAsync.mockResolvedValue(undefined);
      const { getByTestId } = render(<DictationReviewScreen />);
      const done = getByTestId('review-done');

      await act(async () => {
        fireEvent.press(done);
        await Promise.resolve();
      });
      expect(mockReplace).toHaveBeenCalledWith('/(app)/practice');

      await act(async () => {
        fireEvent.press(done);
        await Promise.resolve();
      });

      expect(mockRecordMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('disables Done accessibly while the result save is pending', () => {
      mockRecordIsPending = true;
      const { getByTestId } = render(<DictationReviewScreen />);

      expect(
        getByTestId('review-done').props.accessibilityState?.disabled,
      ).toBe(true);
    });
  });

  describe('remediation flow (with mistakes)', () => {
    beforeEach(() => {
      mockReviewResult = {
        mistakes: [
          {
            original: 'The quick brown fox.',
            written: 'The quik browne fox.',
            error: 'Spelling error',
            correction: 'The quick brown fox.',
            explanation: 'Quick is spelled q-u-i-c-k.',
          },
          {
            original: 'Hello world.',
            written: 'Helo world.',
            error: 'Spelling error',
            correction: 'Hello world.',
            explanation: 'Hello has two Ls.',
          },
        ],
        correctCount: 0,
        totalSentences: 2,
      };
    });

    it('shows the remediation screen with first mistake', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      getByTestId('review-remediation-screen');
      getByTestId('review-mistake-card');
      getByTestId('review-correction-input');
      getByTestId('review-submit-correction');
    });

    it('submit button is disabled when input is empty', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      const submitBtn = getByTestId('review-submit-correction');
      expect(submitBtn.props.accessibilityState?.disabled).toBeTruthy();
    });

    it('submit button enables when correction is typed', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      fireEvent.changeText(
        getByTestId('review-correction-input'),
        'The quick brown fox.',
      );
      const submitBtn = getByTestId('review-submit-correction');
      // disabled prop should be false when text is present
      expect(submitBtn.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('advances to next mistake after submitting correction', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      // Type something and submit
      fireEvent.changeText(
        getByTestId('review-correction-input'),
        'The quick brown fox.',
      );
      fireEvent.press(getByTestId('review-submit-correction'));
      // Should still show remediation screen for second mistake
      getByTestId('review-remediation-screen');
    });

    it('submits the typed correction from the keyboard return key', () => {
      mockReviewResult = {
        mistakes: [
          {
            original: 'Test sentence.',
            written: 'Tset sentence.',
            error: 'Spelling',
            correction: 'Test sentence.',
            explanation: 'Test is t-e-s-t.',
          },
        ],
        correctCount: 0,
        totalSentences: 1,
      };

      const { getByTestId } = render(<DictationReviewScreen />);
      const input = getByTestId('review-correction-input');
      fireEvent.changeText(input, 'Test sentence.');
      fireEvent(input, 'submitEditing');

      getByTestId('review-celebration');
    });

    it('does not advance or celebrate when the return key is pressed with an empty input', () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <DictationReviewScreen />,
      );
      const input = getByTestId('review-correction-input');
      // Input is left empty — no changeText call.
      fireEvent(input, 'submitEditing');

      // Still on the remediation screen, still showing the first mistake
      // (its unique "written" text, not shared with the second mistake).
      getByTestId('review-remediation-screen');
      getByTestId('review-correction-input');
      getByText('The quik browne fox.');
      expect(queryByTestId('review-celebration')).toBeNull();
    });

    it('shows celebration after all mistakes are corrected', () => {
      const { getByTestId } = render(<DictationReviewScreen />);
      // First mistake
      fireEvent.changeText(
        getByTestId('review-correction-input'),
        'The quick brown fox.',
      );
      fireEvent.press(getByTestId('review-submit-correction'));
      // Second mistake
      fireEvent.changeText(
        getByTestId('review-correction-input'),
        'Hello world.',
      );
      fireEvent.press(getByTestId('review-submit-correction'));
      // Should now show celebration
      getByTestId('review-celebration');
    });

    it('shows error alert and retry option when save fails', async () => {
      // First complete all corrections to reach celebration + done button
      const { getByTestId } = render(<DictationReviewScreen />);
      fireEvent.changeText(
        getByTestId('review-correction-input'),
        'The quick brown fox.',
      );
      fireEvent.press(getByTestId('review-submit-correction'));
      fireEvent.changeText(
        getByTestId('review-correction-input'),
        'Hello world.',
      );
      fireEvent.press(getByTestId('review-submit-correction'));

      mockRecordMutateAsync.mockRejectedValueOnce(new Error('Network error'));
      await act(async () => {
        fireEvent.press(getByTestId('review-done'));
        await Promise.resolve();
        await Promise.resolve();
      });

      // The save-failure body now routes through formatApiError (classify
      // before format) instead of rendering err.message verbatim. A plain
      // Error whose message contains "network" classifies as a network error,
      // so the friendly networkError copy is shown and the raw "Network error"
      // string never leaks to the user.
      expect(mockPlatformAlert).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("you're offline"),
        expect.arrayContaining([
          expect.objectContaining({ text: expect.any(String) }),
        ]),
      );
      const body = mockPlatformAlert.mock.calls.at(-1)?.[1] as string;
      expect(body).not.toBe('Network error');
    });
  });

  describe('back navigation', () => {
    it('calls goBackOrReplace when back link pressed in remediation', () => {
      mockReviewResult = {
        mistakes: [
          {
            original: 'Test sentence.',
            written: 'Tset sentence.',
            error: 'Spelling',
            correction: 'Test sentence.',
            explanation: 'Test is t-e-s-t.',
          },
        ],
        correctCount: 0,
        totalSentences: 1,
      };
      const { getByTestId } = render(<DictationReviewScreen />);
      fireEvent.press(getByTestId('review-back'));
      expect(mockGoBackOrReplace).toHaveBeenCalled();
    });
  });
});
