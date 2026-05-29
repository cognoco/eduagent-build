import { screen } from '@testing-library/react-native';
import {
  renderScreen,
  cleanupScreen,
  createTestProfile,
} from '../../test-utils/screen-render';
import { EarlyAdopterCard } from './EarlyAdopterCard';

// lib/secure-storage wraps expo-secure-store, which is
// globally stubbed in test-setup.ts; using the real wrapper here keeps the
// sanitizeSecureStoreKey logic exercised and avoids duplicating the in-memory store.
//
// The real useFeedbackContext() resolves to its default noop value when no
// FeedbackProvider is mounted — no test asserts openFeedback is invoked — so
// the real context runs without an internal mock.

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

const cardProfile = createTestProfile({ id: 'profile-1', isOwner: true });

describe('EarlyAdopterCard', () => {
  let active: ReturnType<typeof renderScreen> | null = null;

  afterEach(() => {
    if (active) active.cleanup();
    active = null;
    cleanupScreen();
  });

  function renderCard(totalSessions = 2) {
    active = renderScreen(<EarlyAdopterCard totalSessions={totalSessions} />, {
      profile: cardProfile,
    });
    return active.result;
  }

  it('renders the card when not dismissed and under session cap', async () => {
    renderCard();
    // getItemAsync resolves async so the card appears after the state update
    expect(await screen.findByTestId('early-adopter-card')).toBeTruthy();
  });

  it('renders feedback CTA and dismiss button', async () => {
    renderCard();
    expect(
      await screen.findByTestId('early-adopter-feedback-cta'),
    ).toBeTruthy();
    expect(await screen.findByTestId('early-adopter-dismiss')).toBeTruthy();
  });

  it('renders nothing when totalSessions meets the cap', () => {
    const { queryByTestId } = renderCard(5);
    expect(queryByTestId('early-adopter-card')).toBeNull();
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
      'no-hide-descendants',
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
      'no-hide-descendants',
    );
  });

  it('dismiss icon is excluded from default visible-only queries [a11y sweep]', async () => {
    renderCard();
    await screen.findByTestId('early-adopter-card');
    expect(screen.queryByTestId('early-adopter-dismiss-icon')).toBeNull();
  });
});
