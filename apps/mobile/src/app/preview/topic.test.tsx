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

// prettier-ignore
jest.mock('../../lib/theme', /* gc1-allow: nativewind vars() does not resolve 'react' in jest; stub theme hooks so screen tests don't blow up on import */ () => ({
  useThemeColors: () => ({ muted: '#71717a' }),
  useTheme: () => ({ colorScheme: 'dark' }),
  useTokenVars: () => ({}),
}));

describe('Preview TopicScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('stores topic and navigates to value-prop learner variant', async () => {
    render(<TopicScreen />);
    fireEvent.changeText(
      screen.getByTestId('preview-topic-input'),
      'algebra basics',
    );
    fireEvent.press(screen.getByTestId('preview-topic-continue'));

    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({
          topicText: 'algebra basics',
          intent: 'self',
        }),
      );
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'learner' },
    });
  });

  it('disables continue when topic is empty', () => {
    render(<TopicScreen />);
    const cta = screen.getByTestId('preview-topic-continue');
    expect(cta.props.accessibilityState?.disabled).toBe(true);
  });
});
