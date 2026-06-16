import { render } from '@testing-library/react-native';
import {
  createScreenWrapper,
  createTestProfile,
} from '../test-utils/screen-render';
import ReadyScreen from './ready';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({
    subject: 'Marine biology',
    subjectId: 'subject-1',
  }),
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

describe('ReadyScreen', () => {
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
});
