import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import TopicScreen from './topic';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Preview TopicScreen', () => {
  const push = jest.fn();
  const replace = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push, replace });
    push.mockReset();
    replace.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('stores a selected geography sample and navigates to value-prop learner variant', async () => {
    render(<TopicScreen />);
    fireEvent.press(screen.getByTestId('preview-topic-sample-geography'));

    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({
          topicText: 'Geography: why deserts form',
          intent: 'self',
          path: 'learner_value_prop',
        }),
      );
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'learner' },
    });
  });

  it('does not render arbitrary free-text topic input', () => {
    render(<TopicScreen />);
    expect(screen.queryByTestId('preview-topic-input')).toBeNull();
    expect(screen.queryByText(/sun glasses/i)).toBeNull();
  });

  it('sends Back to sign in directly', () => {
    render(<TopicScreen />);
    fireEvent.press(screen.getByTestId('preview-topic-back'));
    expect(replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
