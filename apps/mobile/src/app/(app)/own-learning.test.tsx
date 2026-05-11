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

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: mockActiveProfile,
  }),
}));

let capturedProps: Record<string, unknown> = {};

jest.mock('../../components/home', () => {
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
});

const OwnLearningScreen = require('./own-learning').default;

describe('OwnLearningScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedProps = {};
    mockActiveProfile = null;
  });

  it('renders LearnerScreen with showParentHome=false', () => {
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
    expect(capturedProps.showParentHome).toBe(false);
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

  it('passes empty profiles array when activeProfile is null', () => {
    mockActiveProfile = null;

    render(<OwnLearningScreen />);

    screen.getByTestId('learner-screen');
    expect(capturedProps.profiles).toEqual([]);
    expect(capturedProps.activeProfile).toBeNull();
  });
});
