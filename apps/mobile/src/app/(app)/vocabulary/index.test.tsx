import { render } from '@testing-library/react-native';
import VocabularyIndexRedirect from './index';

const mockReplace = jest.fn();
const mockUseFocusEffect = jest.fn();
const mockUsePathname = jest.fn(() => '/vocabulary');
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
}));

describe('VocabularyIndexRedirect [CR-2026-05-19-H23]', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUseFocusEffect.mockClear();
    mockUsePathname.mockReturnValue('/vocabulary');
  });

  it('renders the placeholder view', () => {
    const { getByTestId } = render(<VocabularyIndexRedirect />);
    getByTestId('vocabulary-index-redirect');
  });

  it('does not replace while mounted behind a deep-linked sibling route', () => {
    mockUsePathname.mockReturnValue('/vocabulary/math');
    render(<VocabularyIndexRedirect />);

    const focusCallback = mockUseFocusEffect.mock.calls[0]?.[0] as () => void;
    focusCallback();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces with /(app)/progress on focus (closes the cross-tab back fall-through)', () => {
    render(<VocabularyIndexRedirect />);

    const focusCallback = mockUseFocusEffect.mock.calls[0]?.[0] as () => void;
    focusCallback();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/progress');
  });
});
