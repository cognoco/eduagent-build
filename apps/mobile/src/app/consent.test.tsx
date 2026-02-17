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
  useLocalSearchParams: () => ({
    profileId: '550e8400-e29b-41d4-a716-446655440000',
    consentType: 'GDPR',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockMutateAsync = jest.fn();

jest.mock('../hooks/use-consent', () => ({
  useRequestConsent: () => ({
    mutateAsync: mockMutateAsync,
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

const ConsentScreen = require('./consent').default;

describe('ConsentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders consent form', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Parental consent required')).toBeTruthy();
    expect(screen.getByTestId('consent-email')).toBeTruthy();
    expect(screen.getByTestId('consent-submit')).toBeTruthy();
  });

  it('shows GDPR regulation text', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    expect(screen.getByText(/EU GDPR/)).toBeTruthy();
  });

  it('disables submit with invalid email', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    const button = screen.getByTestId('consent-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('submits consent request and shows success', async () => {
    mockMutateAsync.mockResolvedValue({
      message: 'Consent request sent',
      consentType: 'GDPR',
    });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        childProfileId: '550e8400-e29b-41d4-a716-446655440000',
        parentEmail: 'parent@example.com',
        consentType: 'GDPR',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('consent-success')).toBeTruthy();
    });
  });

  it('displays error on failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('API error: 500'));

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('consent-error')).toBeTruthy();
      expect(screen.getByText('API error: 500')).toBeTruthy();
    });
  });

  it('navigates back on Done button', async () => {
    mockMutateAsync.mockResolvedValue({ message: 'sent', consentType: 'GDPR' });

    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('consent-email'),
      'parent@example.com'
    );
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('consent-done')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('consent-done'));
    expect(mockBack).toHaveBeenCalled();
  });
});
