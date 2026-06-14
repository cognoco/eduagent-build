import { render, screen } from '@testing-library/react-native';

type MockActiveProfile = {
  id: string;
  accountId: string;
  displayName: string;
  isOwner: boolean;
  hasPremiumLlm: boolean;
  conversationLanguage: string;
  pronouns: string | null;
  consentStatus: string | null;
};

let mockActiveProfile: MockActiveProfile | null = null;
let mockProfiles: MockActiveProfile[] = [];
let mockIsGuardianProfile = false;
let mockIsParentProxy = false;

jest.mock(
  '../../lib/profile' /* gc1-allow: screen unit test isolates routing from profile provider */,
  () => ({
    ...jest.requireActual('../../lib/profile'),
    useProfile: () => ({
      activeProfile: mockActiveProfile,
      profiles: mockProfiles,
    }),
    // Keep the legacy family-capability branch stable without mounting the
    // profile provider.
    isGuardianProfile: () => mockIsGuardianProfile,
    isFamilyCapableProfile: (
      profile: { isOwner: boolean } | null | undefined,
    ) => Boolean(profile && mockIsGuardianProfile),
  }),
);

jest.mock(
  '../../hooks/use-parent-proxy' /* gc1-allow: SecureStore-backed hook */,
  () => ({
    useParentProxy: () => ({
      isParentProxy: mockIsParentProxy,
      childProfile: null,
      parentProfile: null,
    }),
  }),
);

// [BUG-135] Stub Redirect so we can assert the guard's redirect output.
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID={`mock-redirect-${href}`}>redirect:{href}</Text>;
  },
}));

jest.mock(
  '../../lib/app-context' /* gc1-allow: screen guard test controls mode state without mounting AppContextProvider */,
  () => ({
    useAppContext: () => ({
      mode: 'study',
      setMode: jest.fn(),
      familyCapable: mockIsGuardianProfile,
    }),
  }),
);

let capturedProps: Record<string, unknown> = {};

jest.mock(
  '../../components/home' /* gc1-allow: screen unit test isolates routing from heavy subtree */,
  () => {
    const { Text, View } = require('react-native');
    return {
      LearnerScreen: (props: Record<string, unknown>) => {
        capturedProps = props;
        return (
          <View testID="learner-screen">
            <Text>LearnerScreen</Text>
          </View>
        );
      },
    };
  },
);

const OwnLearningScreen = require('./own-learning').default;

describe('OwnLearningScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = {};
    mockActiveProfile = null;
    mockProfiles = [];
    mockIsGuardianProfile = true; // default to guardian for legacy tests
    mockIsParentProxy = false;
  });

  it('renders LearnerScreen', () => {
    mockActiveProfile = {
      id: 'p1',
      accountId: 'acc-1',
      displayName: 'Alex',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    };

    render(<OwnLearningScreen />);

    screen.getByTestId('learner-screen');
  });

  it('passes activeProfile as single-element profiles array', () => {
    mockActiveProfile = {
      id: 'p1',
      accountId: 'acc-1',
      displayName: 'Alex',
      isOwner: true,
      hasPremiumLlm: false,
      conversationLanguage: 'en',
      pronouns: null,
      consentStatus: null,
    };

    render(<OwnLearningScreen />);

    expect(capturedProps.profiles).toEqual([mockActiveProfile]);
    expect(capturedProps.activeProfile).toBe(mockActiveProfile);
  });

  // [CCR PR #215 / Bug 305] When activeProfile is null/unloaded,
  // resolveTabShape now returns 'learner' (safer least-privilege default
  // instead of guardian). Own-learning is a guardian-only tab, so the
  // screen must redirect rather than render LearnerScreen without a
  // confirmed profile.
  it('redirects to /home when activeProfile is null (unknown profile defaults to learner shape)', () => {
    mockActiveProfile = null;
    mockProfiles = [];

    render(<OwnLearningScreen />);

    screen.getByTestId('mock-redirect-/(app)/home');
    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // [BUG-135] Tab-shape gate — deep-link / push-notification entry must not
  // mount the LearnerScreen for accounts whose tab shape is 'learner'.
  // ---------------------------------------------------------------------------
  describe('tab-shape guard [BUG-135]', () => {
    it('redirects a learner (solo owner without children) to /home', () => {
      // Break test: an unguarded version of this screen would render the
      // LearnerScreen for a learner tab shape, which is wrong — the learner's
      // canonical home IS /home, and own-learning is a guardian-only tab.
      mockActiveProfile = {
        id: 'p1',
        accountId: 'acc-1',
        displayName: 'Alex',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      };
      mockProfiles = [mockActiveProfile];
      // Solo owner with no children → isGuardianProfile === false → shape === 'learner'
      mockIsGuardianProfile = false;

      render(<OwnLearningScreen />);

      screen.getByTestId('mock-redirect-/(app)/home');
      expect(screen.queryByTestId('learner-screen')).toBeNull();
    });

    it('redirects a parent-proxy session (impersonating a child) to /home', () => {
      // Parent in proxy mode browsing a child account → shape === 'learner'
      mockActiveProfile = {
        id: 'child-1',
        accountId: 'acc-1',
        displayName: 'Kid',
        isOwner: false,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      };
      mockProfiles = [mockActiveProfile];
      mockIsGuardianProfile = false;
      mockIsParentProxy = true;

      render(<OwnLearningScreen />);

      screen.getByTestId('mock-redirect-/(app)/home');
      expect(screen.queryByTestId('learner-screen')).toBeNull();
    });

    it('still renders LearnerScreen for a guardian (parent with linked children)', () => {
      mockActiveProfile = {
        id: 'parent-1',
        accountId: 'acc-1',
        displayName: 'Parent',
        isOwner: true,
        hasPremiumLlm: false,
        conversationLanguage: 'en',
        pronouns: null,
        consentStatus: null,
      };
      mockProfiles = [
        mockActiveProfile,
        {
          ...mockActiveProfile,
          id: 'child-1',
          displayName: 'Child',
          isOwner: false,
        },
      ];
      mockIsGuardianProfile = true;

      render(<OwnLearningScreen />);
      screen.getByTestId('learner-screen');
      expect(screen.queryByTestId('mock-redirect-/(app)/home')).toBeNull();
    });
  });
});
