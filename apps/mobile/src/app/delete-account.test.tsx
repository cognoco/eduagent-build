import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

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

jest.mock('../hooks/use-account', () => ({
  useDeleteAccount: () => ({
    mutateAsync: mockDeleteMutateAsync,
    isPending: false,
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

// Mock Alert.alert to auto-press the destructive "Delete" button
const alertSpy = jest.spyOn(Alert, 'alert');

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    // By default, auto-press the destructive button in the confirmation alert
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const deleteBtn = buttons?.find((b) => b.style === 'destructive');
      deleteBtn?.onPress?.();
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders warning and delete button', () => {
    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Delete account')).toBeTruthy();
    expect(screen.getByTestId('delete-account-confirm')).toBeTruthy();
    expect(screen.getByTestId('delete-account-cancel')).toBeTruthy();
    expect(screen.getByText(/7-day grace period/)).toBeTruthy();
  });

  it('schedules deletion and shows grace period', async () => {
    mockDeleteMutateAsync.mockResolvedValue({
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('delete-account-confirm'));

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-scheduled')).toBeTruthy();
    });

    expect(screen.getByTestId('delete-account-keep')).toBeTruthy();
  });

  it('cancels deletion and navigates back', async () => {
    mockDeleteMutateAsync.mockResolvedValue({
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });
    mockCancelMutateAsync.mockResolvedValue({ message: 'Deletion cancelled' });

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    // First, schedule deletion
    fireEvent.press(screen.getByTestId('delete-account-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-scheduled')).toBeTruthy();
    });

    // Then cancel
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

    fireEvent.press(screen.getByTestId('delete-account-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-error')).toBeTruthy();
      expect(screen.getByText('API error: 500')).toBeTruthy();
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

  // [BUG-820] Double-tap of the alert's destructive button must result in
  // exactly ONE deleteAccount mutation. Prior to the ref-based guard, a fast
  // re-press could fire the mutation twice and create a server-side race.
  it('fires exactly one mutation when alert destructive button is double-pressed', async () => {
    let resolveMutation: ((v: unknown) => void) | undefined;
    mockDeleteMutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = resolve;
        })
    );

    // Override the alert mock for this test only — fire the destructive
    // onPress twice in rapid succession before the mutation resolves.
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const deleteBtn = buttons?.find((b) => b.style === 'destructive');
      // Simulate a double-tap on the alert's Delete button.
      void deleteBtn?.onPress?.();
      void deleteBtn?.onPress?.();
    });

    render(<DeleteAccountScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('delete-account-confirm'));

    // Both alert taps fire synchronously; the second must short-circuit.
    expect(mockDeleteMutateAsync).toHaveBeenCalledTimes(1);

    // Resolve so the test cleans up cleanly.
    resolveMutation?.({
      message: 'Deletion scheduled',
      gracePeriodEnds: '2026-02-24T00:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-scheduled')).toBeTruthy();
    });
  });
});
