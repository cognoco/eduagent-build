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
const mockMutate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => ({
    topicId: 'topic-1',
    subjectId: 'sub-1',
  }),
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
  useProfile: () => ({ activeProfile: { birthYear: null } }),
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
      expect(screen.getByText('Different Method')).toBeTruthy();
      expect(
        screen.getByText(
          'Choose a new teaching style that might work better for you'
        )
      ).toBeTruthy();
      expect(screen.getByText('Same Method')).toBeTruthy();
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
      expect(screen.getByText('Visual Diagrams')).toBeTruthy();
      expect(screen.getByText('Step-by-Step')).toBeTruthy();
      expect(screen.getByText('Real-World Examples')).toBeTruthy();
      expect(screen.getByText('Practice Problems')).toBeTruthy();
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
      expect(screen.getByText('Try Something New')).toBeTruthy();
      expect(
        screen.getByText("Let's try learning this a different way!")
      ).toBeTruthy();
      expect(screen.getByText('Same Method')).toBeTruthy();
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
      expect(screen.getByText('Show Me Pictures')).toBeTruthy();
      expect(screen.getByText('Walk Me Through It')).toBeTruthy();
      expect(screen.getByText('Show Me How It Works')).toBeTruthy();
      expect(screen.getByText('Let Me Try It')).toBeTruthy();
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

      expect(screen.getByText('Different Method')).toBeTruthy();
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
      expect(screen.getByTestId('relearn-error')).toBeTruthy();
      expect(
        screen.getByText('Could not start relearn right now')
      ).toBeTruthy();
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
    expect(screen.getByTestId('relearn-cancel')).toBeTruthy();

    // Tap cancel → spinner + cancel button should disappear
    fireEvent.press(screen.getByTestId('relearn-cancel'));
    expect(screen.queryByTestId('relearn-cancel')).toBeNull();

    // Clean up hanging mock
    resolveSubmit?.();
  });
});
