import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import TopicScreen from './topic';
import * as state from '../../lib/preview-onboarding-state';

let capturedFocusCallback: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useFocusEffect: (cb: () => void) => {
    capturedFocusCallback = cb;
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Preview TopicScreen', () => {
  const push = jest.fn();
  const replace = jest.fn();
  beforeEach(() => {
    capturedFocusCallback = null;
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

  it('[F-160] resets submitting state when screen regains focus', async () => {
    // Arrange: setPreviewState never resolves — leaves submitting=true permanently.
    jest
      .spyOn(state, 'setPreviewState')
      .mockReturnValue(new Promise(() => undefined));

    render(<TopicScreen />);

    // Act: press a button — this sets submitting=true
    fireEvent.press(screen.getByTestId('preview-topic-sample-geography'));

    // Assert: button is disabled while submitting
    await waitFor(() => {
      expect(
        screen.getByTestId('preview-topic-sample-geography').props
          .accessibilityState,
      ).toMatchObject({ disabled: true });
    });

    // Act: simulate screen regaining focus (useFocusEffect callback fires)
    act(() => {
      capturedFocusCallback?.();
    });

    // Assert: button is enabled again after focus reset
    expect(
      screen.getByTestId('preview-topic-sample-geography').props
        .accessibilityState,
    ).toMatchObject({ disabled: false });
  });

  it('[WI-514] re-enables topic cards when setPreviewState rejects (storage failure)', async () => {
    // Arrange: setPreviewState rejects to simulate a locked/unavailable Keychain write.
    // getPreviewState resolves normally (from beforeEach) so the component loads current
    // state. The rejection happens inside onSelect, proving any storage failure is caught.
    jest
      .spyOn(state, 'setPreviewState')
      .mockRejectedValue(new Error('storage unavailable'));

    render(<TopicScreen />);

    // Act: press a topic card
    fireEvent.press(screen.getByTestId('preview-topic-sample-geography'));

    // Assert: cards re-enable after the error (setSubmitting(false) in catch)
    await waitFor(() => {
      expect(
        screen.getByTestId('preview-topic-sample-geography').props
          .accessibilityState,
      ).toMatchObject({ disabled: false });
    });

    // Assert: navigation did NOT occur
    expect(push).not.toHaveBeenCalled();
  });
});
