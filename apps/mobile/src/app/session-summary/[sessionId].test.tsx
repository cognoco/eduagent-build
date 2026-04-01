import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockParams = {
  sessionId: '660e8400-e29b-41d4-a716-446655440000',
  subjectName: 'Mathematics',
  exchangeCount: '5',
  escalationRung: '2',
} as Record<string, string | undefined>;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockSubmitMutateAsync = jest.fn();
const mockSkipMutateAsync = jest.fn();
const mockUpdateLearningModeMutateAsync = jest.fn();

jest.mock('../../hooks/use-sessions', () => ({
  useSubmitSummary: () => ({
    mutateAsync: mockSubmitMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSkipSummary: () => ({
    mutateAsync: mockSkipMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
  useSessionTranscript: () => ({
    data: null,
    isLoading: false,
  }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useUpdateLearningMode: () => ({
    mutateAsync: mockUpdateLearningModeMutateAsync,
  }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#a3a3a3',
    textInverse: '#0f0f0f',
  }),
  useTheme: () => ({ persona: 'teen' }),
}));

jest.mock('../../lib/sentry', () => ({
  Sentry: {
    addBreadcrumb: jest.fn(),
  },
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const SessionSummaryScreen = require('./[sessionId]').default;

describe('SessionSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSkipMutateAsync.mockResolvedValue({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
      shouldPromptCasualSwitch: false,
    });
    mockParams.subjectName = 'Mathematics';
    mockParams.exchangeCount = '5';
    mockParams.escalationRung = '2';
    mockParams.wallClockSeconds = undefined;
    mockParams.milestones = undefined;
    mockParams.fastCelebrations = undefined;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders session takeaways', () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('summary-title')).toBeTruthy();
    expect(screen.getByText('Session Complete')).toBeTruthy();
    expect(screen.getByText('Mathematics')).toBeTruthy();
    expect(screen.getByTestId('session-takeaways')).toBeTruthy();
    expect(screen.getByText('What happened')).toBeTruthy();
    // 5 exchanges, rung 2 → "strong independent thinking"
    expect(screen.getByText(/worked through 5 exchanges/)).toBeTruthy();
    expect(screen.getByText(/strong independent thinking/)).toBeTruthy();
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

  it('persists skip before leaving the screen', async () => {
    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    const skipButton = screen.getByTestId('skip-summary-button');
    expect(skipButton).toBeTruthy();

    fireEvent.press(skipButton);

    await waitFor(() => {
      expect(mockSkipMutateAsync).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
  });

  it('prompts to switch to Casual Explorer when skip threshold is reached', async () => {
    mockSkipMutateAsync.mockResolvedValueOnce({
      summary: {
        id: 'summary-1',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        content: '',
        aiFeedback: null,
        status: 'skipped',
      },
      shouldPromptCasualSwitch: true,
    });
    mockUpdateLearningModeMutateAsync.mockResolvedValueOnce('casual');

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('skip-summary-button'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Try Casual Explorer?',
        'You can keep learning without writing a summary each time. Switch now?',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Not now' }),
          expect.objectContaining({ text: 'Switch' }),
        ])
      );
    });
    expect(mockReplace).not.toHaveBeenCalled();

    const promptButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    const switchButton = promptButtons?.find(
      (button) => button.text === 'Switch'
    );
    expect(switchButton?.onPress).toBeDefined();

    switchButton?.onPress?.();

    await waitFor(() => {
      expect(mockUpdateLearningModeMutateAsync).toHaveBeenCalledWith('casual');
      expect(mockReplace).toHaveBeenCalledWith('/(learner)/home');
    });
  });

  it('renders milestone recap and fast celebrations when provided', () => {
    mockParams.wallClockSeconds = '900';
    mockParams.milestones = encodeURIComponent(
      JSON.stringify(['polar_star', 'persistent'])
    );
    mockParams.fastCelebrations = encodeURIComponent(
      JSON.stringify([
        { reason: 'topic_mastered', detail: 'Quadratic Equations' },
      ])
    );

    render(<SessionSummaryScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('milestone-recap')).toBeTruthy();
    expect(screen.getByText(/Polar Star/)).toBeTruthy();
    expect(screen.getByText(/Persistent/)).toBeTruthy();
    expect(screen.getByTestId('fast-celebrations')).toBeTruthy();
    expect(screen.getByText('Quadratic Equations')).toBeTruthy();
    expect(screen.getByText(/15 minutes - great session!/)).toBeTruthy();
  });
});
