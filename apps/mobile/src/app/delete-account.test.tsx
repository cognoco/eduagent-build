import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('react-i18next', () => require('../test-utils/mock-i18n').i18nMock);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockDeleteMutateAsync = jest.fn();
const mockCancelMutateAsync = jest.fn();
let mockDeleteIsPending = false;

jest.mock('../hooks/use-account', () => ({
  useDeleteAccount: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: mockDeleteIsPending,
  }),
  useCancelDeletion: () => ({
    mutateAsync: mockCancelMutateAsync,
    isPending: false,
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const DeleteAccountScreen = require('./delete-account').default;

/**
 * Helper: drive the screen from the initial warning into the typed-
 * confirmation stage and type the exact phrase. Used by tests that
 * exercise the post-confirm path (mutation fires, error shown, etc.).
 */
function advanceToConfirmedState(phrase = 'DELETE') {
  fireEvent.press(screen.getByTestId('delete-account-confirm'));
  fireEvent.changeText(
    screen.getByTestId('delete-account-confirm-input'),
    phrase
  );
}

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockDeleteIsPending = false;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders warning and delete button', () => {
    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    screen.getByText('Delete account');
    screen.getByTestId('delete-account-confirm');
    screen.getByTestId('delete-account-cancel');
    screen.getByText(/7-day grace period/);
  });

  it('schedules deletion and shows grace period after typed confirmation', async () => {
    mockDeleteMutateAsync.mockResolvedValue({
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    advanceToConfirmedState();
    fireEvent.press(screen.getByTestId('delete-account-confirm-final'));

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      screen.getByTestId('delete-account-scheduled');
    });

    screen.getByTestId('delete-account-keep');
  });

  it('cancels deletion and navigates back', async () => {
    mockDeleteMutateAsync.mockResolvedValue({
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });
    mockCancelMutateAsync.mockResolvedValue({ message: 'Deletion cancelled' });

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    advanceToConfirmedState();
    fireEvent.press(screen.getByTestId('delete-account-confirm-final'));

    await waitFor(() => {
      screen.getByTestId('delete-account-scheduled');
    });

    fireEvent.press(screen.getByTestId('delete-account-keep'));

    await waitFor(() => {
      expect(mockCancelMutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('displays error on deletion failure', async () => {
    mockDeleteMutateAsync.mockRejectedValue(new Error('API error: 500'));

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    advanceToConfirmedState();
    fireEvent.press(screen.getByTestId('delete-account-confirm-final'));

    await waitFor(() => {
      screen.getByTestId('delete-account-error');
      screen.getByText('API error: 500');
    });
  });

  it('navigates back on cancel', () => {
    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('delete-account-cancel'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('navigates back on close', () => {
    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('delete-account-close'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('replaces more when cancelling without back history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('delete-account-cancel'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/more');
  });

  // [BUG-820] Double-tap of the destructive button must result in exactly
  // ONE deleteAccount mutation. After [BUG-910] the destructive button moved
  // from the native alert to an in-screen "Permanently delete" button — the
  // ref-based race guard still applies.
  it('fires exactly one mutation when the final delete button is double-pressed', async () => {
    let resolveMutation: ((v: unknown) => void) | undefined;
    mockDeleteMutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        })
    );

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    advanceToConfirmedState();
    const finalBtn = screen.getByTestId('delete-account-confirm-final');
    fireEvent.press(finalBtn);
    fireEvent.press(finalBtn);

    expect(mockDeleteMutateAsync).toHaveBeenCalledTimes(1);

    resolveMutation?.({
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });

    await waitFor(() => {
      screen.getByTestId('delete-account-scheduled');
    });
  });

  // ---------------------------------------------------------------------
  // [BUG-910] Second-stage typed confirmation, family-pool warning, and
  // active-subscription advisory.
  // ---------------------------------------------------------------------

  describe('typed confirmation stage [BUG-910]', () => {
    it('does NOT fire the mutation when the initial "I understand" button is pressed', () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });

      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
      screen.getByTestId('delete-account-confirming');
    });

    it('shows the family-pool warning in the confirming stage', () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      expect(screen.getByTestId('delete-account-family-warning')).toBeTruthy();
      screen.getByText(/linked child profiles/i);
      expect(
        screen.getByText(/permanently deleted along with your account/i)
      ).toBeTruthy();
    });

    it('shows the App Store / Play Store subscription advisory', () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      expect(
        screen.getByTestId('delete-account-subscription-warning')
      ).toBeTruthy();
      screen.getByText(/App Store or Play Store/i);
      screen.getByText(/not.*automatically cancelled/i);
    });

    it('disables the final delete button until "DELETE" is typed exactly', () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      const finalBtn = screen.getByTestId('delete-account-confirm-final');
      // Initial: empty input → disabled.
      expect(finalBtn.props.accessibilityState.disabled).toBe(true);

      // Wrong text → still disabled.
      fireEvent.changeText(
        screen.getByTestId('delete-account-confirm-input'),
        'delete'
      );
      expect(finalBtn.props.accessibilityState.disabled).toBe(true);

      // Wrong text (typo) → still disabled.
      fireEvent.changeText(
        screen.getByTestId('delete-account-confirm-input'),
        'DELET'
      );
      expect(finalBtn.props.accessibilityState.disabled).toBe(true);

      // Exact match → enabled.
      fireEvent.changeText(
        screen.getByTestId('delete-account-confirm-input'),
        'DELETE'
      );
      expect(finalBtn.props.accessibilityState.disabled).toBe(false);
    });

    it('does not fire the mutation when the final button is pressed without exact phrase', async () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      // Type a near-miss.
      fireEvent.changeText(
        screen.getByTestId('delete-account-confirm-input'),
        'delete'
      );

      // Pressing a disabled Pressable in RN test renderer still fires
      // onPress; the screen-side guard inside onConfirmDelete must short-
      // circuit. This is the regression test for the guard.
      await act(async () => {
        fireEvent.press(screen.getByTestId('delete-account-confirm-final'));
      });

      expect(mockDeleteMutateAsync).not.toHaveBeenCalled();
    });

    it('returns to the initial warning when "Go back" is pressed', () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      screen.getByTestId('delete-account-confirming');

      fireEvent.press(screen.getByTestId('delete-account-back-to-warning'));

      expect(screen.queryByTestId('delete-account-confirming')).toBeNull();
      screen.getByTestId('delete-account-confirm');
    });

    it('clears the typed phrase when the user goes back to the warning', () => {
      render(<DeleteAccountScreen />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      fireEvent.changeText(
        screen.getByTestId('delete-account-confirm-input'),
        'DELETE'
      );
      fireEvent.press(screen.getByTestId('delete-account-back-to-warning'));
      fireEvent.press(screen.getByTestId('delete-account-confirm'));

      // Re-entering the confirming stage starts fresh — input is empty,
      // final button disabled.
      expect(
        screen.getByTestId('delete-account-confirm-input').props.value
      ).toBe('');
      expect(
        screen.getByTestId('delete-account-confirm-final').props
          .accessibilityState.disabled
      ).toBe(true);
    });
  });
});
