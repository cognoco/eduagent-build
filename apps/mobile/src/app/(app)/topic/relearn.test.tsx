import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockMutate = jest.fn();
let mockSearchParams: Record<string, string> = {
  topicId: 'topic-1',
  subjectId: 'sub-1',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/use-retention', () => ({
  useStartRelearn: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

let mockPersona = 'teen';

jest.mock('../../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [{ id: 'owner-id', isOwner: true, birthYear: null }],
    activeProfile: { id: 'owner-id', isOwner: true, birthYear: null },
  }),
  personaFromBirthYear: () => mockPersona,
}));

function createWrapper(): React.ComponentType<{ children: React.ReactNode }> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    );
  };
}

const RelearnScreen = require('./relearn').default;

describe('RelearnScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersona = 'teen';
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
    };
  });

  // ---------------------------------------------------------------------------
  // Default (teen) persona — uses standard copy
  // ---------------------------------------------------------------------------

  describe('teen persona (default copy)', () => {
    it('shows default phase 1 intro and choice labels', () => {
      render(<RelearnScreen />, { wrapper: createWrapper() });

      expect(
        screen.getByText(
          "Every topic needs its own approach. Let's find what clicks for you!"
        )
      ).toBeTruthy();
      screen.getByText('Different Method');
      expect(
        screen.getByText(
          'Choose a new teaching style that might work better for you'
        )
      ).toBeTruthy();
      screen.getByText('Same Method');
      expect(
        screen.getByText(
          'Review the topic again using your current learning approach'
        )
      ).toBeTruthy();
    });

    it('shows default method labels in phase 2', () => {
      render(<RelearnScreen />, { wrapper: createWrapper() });

      // Transition to method picker phase
      fireEvent.press(screen.getByTestId('relearn-different-method'));

      expect(
        screen.getByText('Pick a teaching style that works best for you:')
      ).toBeTruthy();
      screen.getByText('Visual Diagrams');
      screen.getByText('Step-by-Step');
      screen.getByText('Real-World Examples');
      screen.getByText('Practice Problems');
    });
  });

  // ---------------------------------------------------------------------------
  // Learner persona — child-friendly copy
  // ---------------------------------------------------------------------------

  describe('learner persona (child-friendly copy)', () => {
    beforeEach(() => {
      mockPersona = 'learner';
    });

    it('shows child-friendly phase 1 intro and choice labels', () => {
      render(<RelearnScreen />, { wrapper: createWrapper() });

      expect(
        screen.getByText("Let's find what works best for you!")
      ).toBeTruthy();
      screen.getByText('Try Something New');
      expect(
        screen.getByText("Let's try learning this a different way!")
      ).toBeTruthy();
      screen.getByText('Same Method');
      expect(
        screen.getByText("Let's go over it again the same way")
      ).toBeTruthy();
    });

    it('shows child-friendly method labels in phase 2', () => {
      render(<RelearnScreen />, { wrapper: createWrapper() });

      // Transition to method picker phase
      fireEvent.press(screen.getByTestId('relearn-different-method'));

      expect(
        screen.getByText('How would you like to learn this time?')
      ).toBeTruthy();
      screen.getByText('Show Me Pictures');
      screen.getByText('Walk Me Through It');
      screen.getByText('Show Me How It Works');
      screen.getByText('Let Me Try It');
    });

    it('does not show default teen labels', () => {
      render(<RelearnScreen />, { wrapper: createWrapper() });

      expect(screen.queryByText('Different Method')).toBeNull();
      expect(
        screen.queryByText(
          "Every topic needs its own approach. Let's find what clicks for you!"
        )
      ).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Parent persona — uses default (same as teen) copy
  // ---------------------------------------------------------------------------

  describe('parent persona (default copy)', () => {
    beforeEach(() => {
      mockPersona = 'parent';
    });

    it('shows default phase 1 labels, not child-friendly', () => {
      render(<RelearnScreen />, { wrapper: createWrapper() });

      screen.getByText('Different Method');
      expect(
        screen.getByText(
          "Every topic needs its own approach. Let's find what clicks for you!"
        )
      ).toBeTruthy();
      expect(screen.queryByText('Try Something New')).toBeNull();
    });
  });

  it('shows an error when starting relearn fails', async () => {
    mockMutate.mockImplementation(
      (
        _input: unknown,
        callbacks?: {
          onError?: (error: Error) => void;
          onSettled?: () => void;
        }
      ) => {
        callbacks?.onError?.(new Error('Could not start relearn right now'));
        callbacks?.onSettled?.();
      }
    );

    render(<RelearnScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('relearn-same-method'));

    await waitFor(() => {
      screen.getByTestId('relearn-error');
      expect(
        screen.getByText('Could not start relearn right now')
      ).toBeTruthy();
    });
  });

  it('returns to the learner home view when opened from learner home', () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      returnTo: 'learner-home',
    };

    render(<RelearnScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('relearn-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home?view=learner');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('keeps the learner home return target when starting a relearn session', async () => {
    mockSearchParams = {
      topicId: 'topic-1',
      subjectId: 'sub-1',
      topicName: 'Algebra',
      returnTo: 'learner-home',
    };
    mockMutate.mockImplementation(
      (
        _input: unknown,
        callbacks?: {
          onSuccess?: (result: { sessionId: string }) => void;
          onSettled?: () => void;
        }
      ) => {
        callbacks?.onSuccess?.({ sessionId: 'sess-1' });
        callbacks?.onSettled?.();
      }
    );

    render(<RelearnScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('relearn-same-method'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          sessionId: 'sess-1',
          subjectId: 'sub-1',
          topicId: 'topic-1',
          topicName: 'Algebra',
          mode: 'relearn',
          returnTo: 'learner-home',
        },
      });
    });
  });

  // [UX-DE-L1] Retry pressable meets 44×44 tap target
  it('retry pressable has min-h-[44px] class after an error', async () => {
    mockMutate.mockImplementation(
      (
        _input: unknown,
        callbacks?: {
          onError?: (error: Error) => void;
          onSettled?: () => void;
        }
      ) => {
        callbacks?.onError?.(new Error('Network error'));
        callbacks?.onSettled?.();
      }
    );

    render(<RelearnScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('relearn-same-method'));

    await waitFor(() => {
      const retryBtn = screen.getByTestId('relearn-retry');
      expect(retryBtn.props.className).toContain('min-h-[44px]');
    });
  });

  // [UX-DE-M1] Cancel button is visible during submit so user isn't trapped
  it('shows a cancel button while the relearn API call is pending', async () => {
    let resolveSubmit!: () => void;
    mockMutate.mockImplementation(
      (
        _input: unknown,
        callbacks?: {
          onSuccess?: (result: { sessionId: string }) => void;
          onSettled?: () => void;
        }
      ) => {
        // Hang indefinitely until resolveSubmit is called
        resolveSubmit = () => {
          callbacks?.onSuccess?.({ sessionId: 'sess-1' });
          callbacks?.onSettled?.();
        };
      }
    );

    render(<RelearnScreen />, { wrapper: createWrapper() });
    fireEvent.press(screen.getByTestId('relearn-same-method'));

    // Cancel button should appear while pending
    screen.getByTestId('relearn-cancel');

    // Tap cancel → spinner + cancel button should disappear
    fireEvent.press(screen.getByTestId('relearn-cancel'));
    expect(screen.queryByTestId('relearn-cancel')).toBeNull();

    // Clean up hanging mock
    resolveSubmit?.();
  });
});
