import { render } from '@testing-library/react-native';
import TopicIndexRedirect from './index';

const mockReplace = jest.fn();
const mockUseFocusEffect = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
}));

describe('TopicIndexRedirect [BUG-685]', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUseFocusEffect.mockClear();
  });

  it('renders the placeholder view', () => {
    const { getByTestId } = render(<TopicIndexRedirect />);
    getByTestId('topic-index-redirect');
  });

  it('does not replace while mounted behind a deep-linked sibling route', () => {
    render(<TopicIndexRedirect />);
    expect(mockUseFocusEffect).toHaveBeenCalledTimes(1);
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
