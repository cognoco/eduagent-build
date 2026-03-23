import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({
    profileId: 'child-profile-001',
    sessionId: 'session-001',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: (props: Record<string, unknown>) => (
      <View testID={`icon-${props.name}`} />
    ),
  };
});

const mockUseChildSessionTranscript = jest.fn();

jest.mock('../../../../../hooks/use-dashboard', () => ({
  useChildSessionTranscript: (...args: unknown[]) =>
    mockUseChildSessionTranscript(...args),
}));

const SessionTranscriptScreen = require('./[sessionId]').default;

function makeTranscript(
  exchanges: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    escalationRung?: number | null;
  }>
) {
  return {
    session: {
      startedAt: '2026-03-20T10:00:00Z',
      exchangeCount: exchanges.length,
      sessionType: 'learning',
    },
    exchanges,
  };
}

describe('SessionTranscriptScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert');
  });

  it('renders "Guided" label with info icon when escalationRung >= 3', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'assistant',
          content: 'Let me help you with that.',
          timestamp: '2026-03-20T10:01:00Z',
          escalationRung: 3,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    expect(screen.getByText('Guided')).toBeTruthy();
    expect(screen.getByTestId('guided-info-0')).toBeTruthy();
    expect(screen.getByTestId('icon-information-circle-outline')).toBeTruthy();
  });

  it('renders "Guided" label for escalationRung > 3', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'assistant',
          content: 'Here is the answer.',
          timestamp: '2026-03-20T10:02:00Z',
          escalationRung: 5,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    expect(screen.getByText('Guided')).toBeTruthy();
    expect(screen.getByTestId('guided-info-0')).toBeTruthy();
  });

  it('does NOT render "Guided" when escalationRung < 3', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'assistant',
          content: 'Good thinking!',
          timestamp: '2026-03-20T10:01:00Z',
          escalationRung: 2,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    expect(screen.queryByText('Guided')).toBeNull();
    expect(screen.queryByTestId('guided-info-0')).toBeNull();
  });

  it('does NOT render "Guided" when escalationRung is undefined', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'assistant',
          content: 'Keep going!',
          timestamp: '2026-03-20T10:01:00Z',
          escalationRung: undefined,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    expect(screen.queryByText('Guided')).toBeNull();
    expect(screen.queryByTestId('guided-info-0')).toBeNull();
  });

  it('does NOT render "Guided" when escalationRung is null', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'assistant',
          content: 'Nice work!',
          timestamp: '2026-03-20T10:01:00Z',
          escalationRung: null,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    expect(screen.queryByText('Guided')).toBeNull();
    expect(screen.queryByTestId('guided-info-0')).toBeNull();
  });

  it('shows alert with explanation when Guided info is tapped', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'assistant',
          content: 'Let me explain step by step.',
          timestamp: '2026-03-20T10:01:00Z',
          escalationRung: 4,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    fireEvent.press(screen.getByTestId('guided-info-0'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'What does Guided mean?',
      'Your child needed extra help here, so their learning mate provided more direct guidance. This is normal — it means a tricky concept is being worked through together.',
      [{ text: 'OK' }]
    );
  });

  it('renders Guided on correct exchanges in a multi-exchange transcript', () => {
    mockUseChildSessionTranscript.mockReturnValue({
      data: makeTranscript([
        {
          role: 'user',
          content: 'What is 2+2?',
          timestamp: '2026-03-20T10:00:00Z',
          escalationRung: 0,
        },
        {
          role: 'assistant',
          content: 'Think about it!',
          timestamp: '2026-03-20T10:00:30Z',
          escalationRung: 1,
        },
        {
          role: 'user',
          content: 'I do not know.',
          timestamp: '2026-03-20T10:01:00Z',
          escalationRung: 0,
        },
        {
          role: 'assistant',
          content: 'Let me walk you through it.',
          timestamp: '2026-03-20T10:01:30Z',
          escalationRung: 3,
        },
      ]),
      isLoading: false,
    });

    render(<SessionTranscriptScreen />);

    // Exchanges 0, 1, 2 should NOT have Guided
    expect(screen.queryByTestId('guided-info-0')).toBeNull();
    expect(screen.queryByTestId('guided-info-1')).toBeNull();
    expect(screen.queryByTestId('guided-info-2')).toBeNull();

    // Exchange 3 (escalationRung=3) SHOULD have Guided
    expect(screen.getByTestId('guided-info-3')).toBeTruthy();
  });
});
