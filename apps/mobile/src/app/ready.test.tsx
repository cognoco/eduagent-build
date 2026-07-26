import { act, fireEvent, render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { Sentry } from '../lib/sentry';
import {
  createScreenWrapper,
  createTestProfile,
} from '../test-utils/screen-render';
import ReadyScreen from './ready';

const mockReplace = jest.fn();
let mockMentorBirthShouldThrow = false;
let mockParams: {
  subject?: string;
  subjectId?: string;
  sessionId?: string;
  topicId?: string;
  topicName?: string;
  rawInput?: string;
  returnTo?: string;
} = {
  subject: 'Marine biology',
  subjectId: 'subject-1',
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { apiUrl: 'http://localhost:8787' } },
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));

jest.mock('react-i18next', () => require('../test-utils/mock-i18n').i18nMock);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('../components/common/MentorBirthAnimation', () => ({
  ...jest.requireActual('../components/common/MentorBirthAnimation'),
  MentorBirthAnimation: ({ readyLabel }: { readyLabel: string }) => {
    if (mockMentorBirthShouldThrow) {
      throw new Error('mentor birth render failed');
    }
    const { Text, View } = require('react-native');
    return (
      <View testID="mentor-birth-animation">
        <Text>{readyLabel}</Text>
      </View>
    );
  },
}));

describe('ReadyScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.useRealTimers();
    mockParams = {
      subject: 'Marine biology',
      subjectId: 'subject-1',
    };
    mockReplace.mockClear();
    mockMentorBirthShouldThrow = false;
    jest.mocked(Sentry.captureException).mockClear();
  });

  it('contains mentor birth animation crashes and keeps the ready screen usable', () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockMentorBirthShouldThrow = true;
    const activeProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Ari',
      isOwner: true,
      birthYear: 2014,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile,
      profiles: [activeProfile],
    });

    const { getByTestId, getByText } = render(<ReadyScreen />, { wrapper });

    act(() => {
      jest.advanceTimersByTime(1700);
    });

    getByTestId('ready-start');
    getByTestId('ready-row-tone');
    getByText("You're all set.");
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'mentor birth render failed' }),
      {
        extra: { componentStack: expect.any(String) },
        tags: { component: 'ready-mentor-birth' },
      },
    );
  });

  it('uses the mentor birth animation as the onboarding handoff', () => {
    const activeProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Ari',
      isOwner: true,
      birthYear: 2014,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile,
      profiles: [activeProfile],
    });
    const { getByTestId, getByText, queryByTestId } = render(<ReadyScreen />, {
      wrapper,
    });

    getByTestId('mentor-birth-animation');
    getByText('Your mentor is ready.');
    expect(queryByTestId('ready-lamp')).toBeNull();
  });

  it('[WI-1864] keeps the primary CTA reachable on short screens', () => {
    const activeProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Ari',
      isOwner: true,
      birthYear: 2014,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile,
      profiles: [activeProfile],
    });

    const { UNSAFE_getByType } = render(<ReadyScreen />, { wrapper });

    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });

  it('does not render ellipsis subject copy when no subject is available', () => {
    jest.useFakeTimers();
    mockParams = {};
    const activeProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Ari',
      isOwner: true,
      birthYear: 2014,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile,
      profiles: [activeProfile],
    });
    const { queryByText, getByText } = render(<ReadyScreen />, {
      wrapper,
    });

    act(() => {
      jest.advanceTimersByTime(1700);
    });

    expect(queryByText('Starting with …')).toBeNull();
    getByText('Your first topic is ready');
  });

  it('forwards existing session, topic, and raw input params when the primary CTA is pressed', () => {
    mockParams = {
      subject: 'Marine biology',
      subjectId: 'subject-1',
      sessionId: 'session-1',
      topicId: 'topic-1',
      topicName: 'Coral reefs',
      rawInput: 'help me understand reefs',
      returnTo: 'subjects',
    };
    const activeProfile = createTestProfile({
      id: 'profile-1',
      displayName: 'Ari',
      isOwner: true,
      birthYear: 2014,
    });
    const { wrapper } = createScreenWrapper({
      activeProfile,
      profiles: [activeProfile],
    });
    const { getByTestId } = render(<ReadyScreen />, {
      wrapper,
    });

    fireEvent.press(getByTestId('ready-start'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(app)/session',
      params: {
        mode: 'learning',
        subjectId: 'subject-1',
        subjectName: 'Marine biology',
        sessionId: 'session-1',
        topicId: 'topic-1',
        topicName: 'Coral reefs',
        rawInput: 'help me understand reefs',
        returnTo: 'subjects',
      },
    });
  });

  it.each(['library', 'malformed-return-target'])(
    'does not forward the unsupported %s return token into the session',
    (returnTo) => {
      mockParams = {
        subject: 'Marine biology',
        subjectId: 'subject-1',
        sessionId: 'session-1',
        returnTo,
      };
      const activeProfile = createTestProfile({
        id: 'profile-1',
        displayName: 'Ari',
        isOwner: true,
        birthYear: 2014,
      });
      const { wrapper } = createScreenWrapper({
        activeProfile,
        profiles: [activeProfile],
      });
      const { getByTestId } = render(<ReadyScreen />, { wrapper });

      fireEvent.press(getByTestId('ready-start'));

      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'subject-1',
          subjectName: 'Marine biology',
          sessionId: 'session-1',
        },
      });
    },
  );

  it.each(['learner-home', 'own-learning'])(
    'preserves the supported %s return token into the session',
    (returnTo) => {
      mockParams = {
        subject: 'Marine biology',
        subjectId: 'subject-1',
        sessionId: 'session-1',
        returnTo,
      };
      const activeProfile = createTestProfile({
        id: 'profile-1',
        displayName: 'Ari',
        isOwner: true,
        birthYear: 2014,
      });
      const { wrapper } = createScreenWrapper({
        activeProfile,
        profiles: [activeProfile],
      });
      const { getByTestId } = render(<ReadyScreen />, { wrapper });

      fireEvent.press(getByTestId('ready-start'));

      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(app)/session',
        params: {
          mode: 'learning',
          subjectId: 'subject-1',
          subjectName: 'Marine biology',
          sessionId: 'session-1',
          returnTo,
        },
      });
    },
  );
});
