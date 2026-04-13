import { fireEvent, render, screen } from '@testing-library/react-native';
import LanguageSetup from './language-setup';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
  }),
  useLocalSearchParams: () => ({
    languageCode: 'es',
    languageName: 'Spanish',
    subjectId: 'test-id',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../../hooks/use-subjects', () => ({
  useConfigureLanguageSubject: () => ({
    mutateAsync: jest.fn().mockResolvedValue({
      subject: { id: 'test-id' },
    }),
    isPending: false,
  }),
}));

describe('LanguageSetup', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockReplace.mockReset();
  });

  it('renders language confirmation card', () => {
    render(<LanguageSetup />);
    expect(
      screen.getByText(/Looks like you're learning Spanish!/i)
    ).toBeTruthy();
    expect(screen.getByText(/language-focused approach/i)).toBeTruthy();
  });

  it('renders level selection options', () => {
    render(<LanguageSetup />);
    expect(screen.getByText(/Complete beginner/i)).toBeTruthy();
    expect(screen.getByText(/I know some basics/i)).toBeTruthy();
    expect(screen.getByText(/Conversational/i)).toBeTruthy();
    expect(screen.getByText(/Advanced/i)).toBeTruthy();
  });

  it('lets the learner choose a native language', () => {
    render(<LanguageSetup />);
    fireEvent.press(screen.getByTestId('native-language-fr'));
    expect(screen.getByTestId('native-language-fr')).toBeTruthy();
  });
});
