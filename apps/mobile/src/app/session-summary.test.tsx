import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({
    sessionId: '660e8400-e29b-41d4-a716-446655440000',
    subjectName: 'Mathematics',
    exchangeCount: '5',
    escalationRung: '2',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSubmitMutateAsync = jest.fn();

jest.mock('../hooks/use-sessions', () => ({
  useSubmitSummary: () => ({
    mutateAsync: mockSubmitMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#a3a3a3',
    textInverse: '#0f0f0f',
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

const SessionSummaryScreen = require('./session-summary').default;

describe('SessionSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders session stats', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('summary-title')).toBeTruthy();
    expect(screen.getByText('Session Complete')).toBeTruthy();
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByTestId('session-stats')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('Exchanges')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Scaffolded')).toBeTruthy();
  });

  it('renders summary input', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Your Words')).toBeTruthy();
    expect(screen.getByTestId('summary-input')).toBeTruthy();
    expect(screen.getByTestId('submit-summary-button')).toBeTruthy();
  });

  it('disables submit when summary is too short', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('summary-input'), 'Short');

    const button = screen.getByTestId('submit-summary-button');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('submits summary and shows AI feedback', async () => {
    mockSubmitMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and how to solve them',
        aiFeedback: 'Good summary. You captured the key concepts well.',
        status: 'accepted',
      },
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and how to solve them'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      expect(mockSubmitMutateAsync).toHaveBeenCalledWith({
        content: 'I learned about quadratic equations and how to solve them',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('summary-submitted')).toBeTruthy();
      expect(screen.getByTestId('ai-feedback')).toBeTruthy();
      expect(
        screen.getByText('Good summary. You captured the key concepts well.')
      ).toBeTruthy();
    });
  });

  it('shows Continue button after submission', async () => {
    mockSubmitMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: 'I learned about quadratic equations and factoring methods',
        aiFeedback: 'Well done.',
        status: 'accepted',
      },
    });

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.changeText(
      screen.getByTestId('summary-input'),
      'I learned about quadratic equations and factoring methods'
    );
    fireEvent.press(screen.getByTestId('submit-summary-button'));

    await waitFor(() => {
      expect(screen.getByTestId('continue-button')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('continue-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
  });

  it('allows skipping summary', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    const skipButton = screen.getByTestId('skip-summary-button');
    expect(skipButton).toBeTruthy();

    fireEvent.press(skipButton);
    expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
  });
});
