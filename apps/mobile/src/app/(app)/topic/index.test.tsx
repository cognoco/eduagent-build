import { render } from '@testing-library/react-native';
import TopicIndexRedirect from './index';

const mockReplace = jest.fn();
const mockUseFocusEffect = jest.fn();
const mockUsePathname = jest.fn(() => '/topic');
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockUsePathname(),
  useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
}));

describe('TopicIndexRedirect [BUG-685]', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUseFocusEffect.mockClear();
    mockUsePathname.mockReturnValue('/topic');
  });

  it('renders the placeholder view', () => {
    const { getByTestId } = render(<TopicIndexRedirect />);
    getByTestId('topic-index-redirect');
  });

  it('does not replace while mounted behind a deep-linked sibling route', () => {
    mockUsePathname.mockReturnValue('/topic/recall-test');
    render(<TopicIndexRedirect />);

    const focusCallback = mockUseFocusEffect.mock.calls[0]?.[0] as () => void;
    focusCallback();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not replace while mounted behind direct relearn route', () => {
    mockUsePathname.mockReturnValue('/topic/relearn');
    render(<TopicIndexRedirect />);

    const focusCallback = mockUseFocusEffect.mock.calls[0]?.[0] as () => void;
    focusCallback();

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('replaces with /(app)/library on focus (not /home — closes the BUG-685 fall-through)', () => {
    render(<TopicIndexRedirect />);

    const focusCallback = mockUseFocusEffect.mock.calls[0]?.[0] as () => void;
    focusCallback();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });
});
