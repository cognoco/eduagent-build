import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
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

describe('DeleteAccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
