import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ValuePropScreen from './value-prop';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Preview ValuePropScreen', () => {
  const push = jest.fn();
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push });
    push.mockReset();
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'algebra',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('learner variant renders sample dialogue marked as sample', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    expect(screen.getByTestId('preview-value-prop-learner')).toBeTruthy();
    expect(screen.getByTestId('preview-sample-marker')).toBeTruthy();
  });

  it('renders geography-specific learner copy without formula text', async () => {
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'self',
      path: 'learner_value_prop',
      topicText: 'Geography: why deserts form',
      createdAt: new Date().toISOString(),
    });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);

    expect(
      await screen.findByText(/desert is defined by low rainfall/i),
    ).toBeTruthy();
    expect(screen.queryByText(/formula/i)).toBeNull();
  });

  it('parent variant renders sample weekly insight marked as sample', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'parent' });
    render(<ValuePropScreen />);
    expect(screen.getByTestId('preview-value-prop-parent')).toBeTruthy();
    expect(screen.getByTestId('preview-sample-marker')).toBeTruthy();
  });

  it('does not render a chat shell or any LLM-driven element', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    expect(screen.queryByTestId('chat-shell')).toBeNull();
    expect(screen.queryByTestId('message-input')).toBeNull();
  });

  it('CTA routes to sign-up', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'learner' });
    render(<ValuePropScreen />);
    fireEvent.press(screen.getByTestId('preview-signup-cta'));
    expect(push).toHaveBeenCalledWith('/sign-up');
  });

  it('parent variant offers a path into the preview lesson', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ variant: 'parent' });
    render(<ValuePropScreen />);

    fireEvent.press(screen.getByTestId('preview-try-lesson-cta'));

    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'learner_lesson' }),
      );
      expect(push).toHaveBeenCalledWith('/preview/topic');
    });
  });
});
