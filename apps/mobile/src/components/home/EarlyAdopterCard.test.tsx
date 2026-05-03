import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EarlyAdopterCard } from './EarlyAdopterCard';

// External boundaries only
jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#007AFF',
    textSecondary: '#666',
    textMuted: '#999',
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({ activeProfile: { id: 'profile-1' } }),
}));

jest.mock('../../lib/secure-storage', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../feedback/FeedbackProvider', () => ({
  useFeedbackContext: () => ({ openFeedback: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({
      name,
      testID,
      ...rest
    }: {
      name: string;
      testID?: string;
    }) => (
      <Text testID={testID} {...rest}>
        {name}
      </Text>
    ),
  };
});

describe('EarlyAdopterCard', () => {
  let testQueryClient: QueryClient;

  function renderCard() {
    return render(<EarlyAdopterCard />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={testQueryClient}>
          {children}
        </QueryClientProvider>
      ),
    });
  }

  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    // Pre-populate the cache with the data the component reads via getQueryData.
    // Profile ID 'profile-1' matches the useProfile mock above.
    testQueryClient.setQueryData(['progress', 'inventory', 'profile-1'], {
      global: { totalSessions: 2 },
    });
  });

  it('renders the card when not dismissed and under session cap', async () => {
    renderCard();
    // getItemAsync resolves async so the card appears after the state update
    expect(await screen.findByTestId('early-adopter-card')).toBeTruthy();
  });

  it('renders feedback CTA and dismiss button', async () => {
    renderCard();
    expect(
      await screen.findByTestId('early-adopter-feedback-cta')
    ).toBeTruthy();
    expect(await screen.findByTestId('early-adopter-dismiss')).toBeTruthy();
  });

  // [a11y sweep] Break tests: decorative icons must be hidden from screen
  // readers — both Pressables carry accessibilityLabel for the action.
  it('marks the feedback icon wrapper as accessibility-hidden [a11y sweep]', async () => {
    renderCard();
    await screen.findByTestId('early-adopter-card');
    const iconWrapper = screen.getByTestId('early-adopter-feedback-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });

  it('feedback icon is excluded from default visible-only queries [a11y sweep]', async () => {
    renderCard();
    await screen.findByTestId('early-adopter-card');
    expect(screen.queryByTestId('early-adopter-feedback-icon')).toBeNull();
  });

  it('marks the dismiss icon wrapper as accessibility-hidden [a11y sweep]', async () => {
    renderCard();
    await screen.findByTestId('early-adopter-card');
    const iconWrapper = screen.getByTestId('early-adopter-dismiss-icon', {
      includeHiddenElements: true,
    });
    expect(iconWrapper.props.accessibilityElementsHidden).toBe(true);
    expect(iconWrapper.props.importantForAccessibility).toBe(
      'no-hide-descendants'
    );
  });

  it('dismiss icon is excluded from default visible-only queries [a11y sweep]', async () => {
    renderCard();
    await screen.findByTestId('early-adopter-card');
    expect(screen.queryByTestId('early-adopter-dismiss-icon')).toBeNull();
  });
});
