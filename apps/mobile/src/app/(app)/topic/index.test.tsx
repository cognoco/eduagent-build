import { render } from '@testing-library/react-native';
import TopicIndexRedirect from './index';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

describe('TopicIndexRedirect [BUG-685]', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it('renders the placeholder view', () => {
    const { getByTestId } = render(<TopicIndexRedirect />);
    expect(getByTestId('topic-index-redirect')).toBeTruthy();
  });

  it('replaces with /(app)/library on mount (not /home — closes the BUG-685 fall-through)', () => {
    render(<TopicIndexRedirect />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(app)/library');
  });
});
