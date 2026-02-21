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

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let datePickerOnChange: ((event: unknown, date?: Date) => void) | null = null;

jest.mock('@react-native-community/datetimepicker', () => {
  const RN = require('react-native');
  const ReactReq = require('react');
  return {
    __esModule: true,
    default: (props: {
      onChange?: (event: unknown, date?: Date) => void;
      testID?: string;
    }) => {
      datePickerOnChange = props.onChange ?? null;
      return ReactReq.createElement(RN.View, { testID: props.testID });
    },
  };
});

const mockFetch = jest.fn();
jest.mock('../lib/api-client', () => ({
  useApiClient: () => {
    const { hc } = require('hono/client');
    return hc('http://localhost', { fetch: mockFetch });
  },
}));

const mockSwitchProfile = jest.fn().mockResolvedValue(undefined);

jest.mock('../lib/profile', () => ({
  useProfile: () => ({
    switchProfile: mockSwitchProfile,
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

const CreateProfileScreen = require('./create-profile').default;
const { detectPersona } = require('./create-profile');

describe('CreateProfileScreen', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    datePickerOnChange = null;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders form fields', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('create-profile-name')).toBeTruthy();
    expect(screen.getByTestId('create-profile-birthdate')).toBeTruthy();
    expect(screen.getByTestId('persona-teen')).toBeTruthy();
    expect(screen.getByTestId('persona-learner')).toBeTruthy();
    expect(screen.getByTestId('persona-parent')).toBeTruthy();
    expect(screen.getByTestId('create-profile-submit')).toBeTruthy();
  });

  it('disables submit when name is empty', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    const button = screen.getByTestId('create-profile-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('disables submit when birthdate is not selected', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    const button = screen.getByTestId('create-profile-submit');
    expect(
      button.props.accessibilityState?.disabled ?? button.props.disabled
    ).toBeTruthy();
  });

  it('opens date picker when birthdate field is pressed', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));

    expect(screen.getByTestId('date-picker')).toBeTruthy();
  });

  it('calls POST and navigates back on successful submit', async () => {
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthDate: '2010-06-15',
      personaType: 'TEEN',
      isOwner: false,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Open date picker and select a date
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2010, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockSwitchProfile).toHaveBeenCalledWith('new-id');
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('auto-detects persona from birthdate and shows hint', async () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      // Set birthdate to a 10-year-old → TEEN
      datePickerOnChange?.({ type: 'set' }, new Date(2016, 0, 1));
    });

    const hint = screen.getByTestId('persona-auto-hint');
    expect(hint).toBeTruthy();
    expect(hint.props.children).toBeDefined();
  });

  it('allows manual persona override after auto-detection', async () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2016, 0, 1));
    });

    // Override: select LEARNER manually
    fireEvent.press(screen.getByTestId('persona-learner'));

    // Auto-hint should disappear after manual override
    expect(screen.queryByTestId('persona-auto-hint')).toBeNull();
  });

  it('displays error on API failure', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('API error: 422', {
        status: 422,
        statusText: 'Unprocessable Entity',
      })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Select a birthdate so submit is enabled
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2010, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('create-profile-error')).toBeTruthy();
    });
  });

  it('navigates back on cancel', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-cancel'));

    expect(mockBack).toHaveBeenCalled();
  });
});

describe('detectPersona', () => {
  it('returns TEEN for age < 13', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    expect(detectPersona(tenYearsAgo)).toBe('TEEN');
  });

  it('returns LEARNER for age 13-17', () => {
    const fifteenYearsAgo = new Date();
    fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
    expect(detectPersona(fifteenYearsAgo)).toBe('LEARNER');
  });

  it('returns PARENT for age >= 18', () => {
    const twentyFiveYearsAgo = new Date();
    twentyFiveYearsAgo.setFullYear(twentyFiveYearsAgo.getFullYear() - 25);
    expect(detectPersona(twentyFiveYearsAgo)).toBe('PARENT');
  });
});
