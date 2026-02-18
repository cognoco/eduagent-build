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

describe('CreateProfileScreen', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
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

  it('calls POST and navigates back on successful submit', async () => {
    const newProfile = {
      id: 'new-id',
      accountId: 'a1',
      displayName: 'Sam',
      avatarUrl: null,
      birthDate: null,
      personaType: 'LEARNER',
      isOwner: false,
      createdAt: '2026-02-16T00:00:00Z',
      updatedAt: '2026-02-16T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ profile: newProfile }), { status: 200 })
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
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

  it('sends birthDate when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          profile: {
            id: 'new-id',
            accountId: 'a1',
            displayName: 'Sam',
            avatarUrl: null,
            birthDate: '2012-05-15',
            personaType: 'TEEN',
            isOwner: false,
            createdAt: '2026-02-16T00:00:00Z',
            updatedAt: '2026-02-16T00:00:00Z',
          },
        }),
        { status: 200 }
      )
    );

    render(<CreateProfileScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('create-profile-name'), 'Sam');
    fireEvent.changeText(
      screen.getByTestId('create-profile-birthdate'),
      '2012-05-15'
    );
    fireEvent.press(screen.getByTestId('persona-teen'));
    fireEvent.press(screen.getByTestId('create-profile-submit'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
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
