import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoutedMockFetch } from '../../../test-utils/mock-api-routes';

const mockFetch = createRoutedMockFetch({
  '/progress/sessions': { sessions: [], nextCursor: null },
});
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock(
  '../../../lib/api-client' /* gc1-allow: screen test drives production hooks through the fetch boundary */,
  () =>
    require('../../../test-utils/mock-api-routes').mockApiClientFactory(
      mockFetch,
    ),
);

jest.mock(
  '../../../lib/profile' /* gc1-allow: screen test isolates profile context */,
  () => ({
    useProfile: () => ({
      activeProfile: {
        id: 'a0000000-0000-4000-a000-000000000001',
        accountId: 'account-1',
        displayName: 'Zuzana',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      },
    }),
  }),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => false,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const MyNotesHubScreen = require('./index').default;

describe('MyNotesHubScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the three archive doors and opens a selected list', () => {
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    screen.getByText('Sessions');
    screen.getByText('Notes');
    screen.getByText('Bookmarks');

    fireEvent.press(screen.getByTestId('my-notes-notes'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/my-notes/notes');
  });

  it('falls back to Home when back has no stack', () => {
    render(<MyNotesHubScreen />, { wrapper: createWrapper() });

    fireEvent.press(screen.getByTestId('my-notes-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });
});
