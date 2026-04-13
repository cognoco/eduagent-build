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
    // Simulate non-owner (child self-registering or first-time user).
    // isParentAddingChild will be false when activeProfile is null.
    activeProfile: null,
    profiles: [],
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

describe('CreateProfileScreen', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    datePickerOnChange = null;
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('renders form fields (persona picker hidden, auto-detected)', () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('create-profile-name')).toBeTruthy();
    expect(screen.getByTestId('create-profile-birthdate')).toBeTruthy();
    expect(screen.getByTestId('create-profile-submit')).toBeTruthy();
    // Birth date explanatory copy is visible
    expect(
      screen.getByText(/personalise how your mentor talks to you/)
    ).toBeTruthy();
    // Persona picker buttons are hidden (auto-detected from birth date)
    expect(screen.queryByTestId('persona-teen')).toBeNull();
    expect(screen.queryByTestId('persona-learner')).toBeNull();
    expect(screen.queryByTestId('persona-parent')).toBeNull();
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

  it('renders a web birthdate input fallback', () => {
    const RN = require('react-native');
    const originalOs = Object.getOwnPropertyDescriptor(RN.Platform, 'OS');

    Object.defineProperty(RN.Platform, 'OS', {
      configurable: true,
      get: () => 'web',
    });

    try {
      render(<CreateProfileScreen />, { wrapper: Wrapper });

      expect(screen.getByTestId('create-profile-birthdate-input')).toBeTruthy();

      fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
      fireEvent.changeText(
        screen.getByTestId('create-profile-birthdate-input'),
        '2010-06-15'
      );

      const button = screen.getByTestId('create-profile-submit');
      expect(
        button.props.accessibilityState?.disabled ?? button.props.disabled
      ).toBeFalsy();
    } finally {
      if (originalOs) {
        Object.defineProperty(RN.Platform, 'OS', originalOs);
      }
    }
  });

  it('calls POST and navigates back on successful submit (adult, no consent needed)', async () => {
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthYear: 2000,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: null,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');

    // Open date picker and select a date (26-year-old → no consent)
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2000, 5, 15));
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

  it('redirects to consent screen for child under 16', async () => {
    const newProfile = {
      id: 'child-id',
      accountId: 'a1',
      displayName: 'Kid',
      avatarUrl: null,
      birthYear: 2014,
      location: null,
      isOwner: false,
      hasPremiumLlm: false,
      consentStatus: 'PENDING',
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Kid');

    // Open date picker and select a date (12-year-old → consent required)
    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      datePickerOnChange?.({ type: 'set' }, new Date(2014, 5, 15));
    });

    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/consent',
        params: { profileId: 'child-id' },
      });
    });
  });

  it('auto-detects persona from birthdate (no picker shown)', async () => {
    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-birthdate'));
    await act(() => {
      // Set birthdate to a 10-year-old → TEEN detected silently
      datePickerOnChange?.({ type: 'set' }, new Date(2016, 0, 1));
    });

    // No persona picker or hint shown — detection is invisible to the user
    expect(screen.queryByTestId('persona-auto-hint')).toBeNull();
    expect(screen.queryByTestId('persona-teen')).toBeNull();
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

  it('replaces home on cancel when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false);

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('create-profile-cancel'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });
});
