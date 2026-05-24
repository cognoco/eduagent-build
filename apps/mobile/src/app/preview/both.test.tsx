import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import BothScreen from './both';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Preview BothScreen', () => {
  const push = jest.fn();
  const replace = jest.fn();
  let focusCallback: (() => void) | undefined;

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ push, replace });
    (useFocusEffect as jest.Mock).mockImplementation((callback: () => void) => {
      focusCallback = callback;
    });
    push.mockReset();
    replace.mockReset();
    focusCallback = undefined;
    jest.spyOn(state, 'getPreviewState').mockResolvedValue({
      intent: 'both',
      path: 'parent_value_prop',
      bothPriority: 'child_first',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('renders both priority options and the back-to-sign-in escape', () => {
    render(<BothScreen />);
    expect(screen.getByTestId('preview-both')).toBeTruthy();
    expect(screen.getByTestId('both-priority-child-first')).toBeTruthy();
    expect(screen.getByTestId('both-priority-self-first')).toBeTruthy();
    expect(screen.getByTestId('preview-both-back')).toBeTruthy();
  });

  it('child_first → value-prop parent variant with bothPriority=child_first', async () => {
    render(<BothScreen />);
    fireEvent.press(screen.getByTestId('both-priority-child-first'));
    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'both',
          path: 'parent_value_prop',
          bothPriority: 'child_first',
        }),
      );
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('self_first → topic with bothPriority=self_first', async () => {
    render(<BothScreen />);
    fireEvent.press(screen.getByTestId('both-priority-self-first'));
    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'both',
          path: 'learner_value_prop',
          bothPriority: 'self_first',
        }),
      );
    });
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });

  it('back-to-sign-in escape replaces the route to sign-in', () => {
    render(<BothScreen />);
    fireEvent.press(screen.getByTestId('preview-both-back'));
    expect(replace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('falls back to a fresh state shape when getPreviewState returns null', async () => {
    (state.getPreviewState as jest.Mock).mockResolvedValueOnce(null);
    render(<BothScreen />);
    fireEvent.press(screen.getByTestId('both-priority-child-first'));
    await waitFor(() => {
      expect(state.setPreviewState).toHaveBeenCalledWith(
        expect.objectContaining({
          intent: 'both',
          path: 'parent_value_prop',
          bothPriority: 'child_first',
        }),
      );
    });
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('double-tap guard: both options disable immediately after first press', () => {
    render(<BothScreen />);
    fireEvent.press(screen.getByTestId('both-priority-child-first'));
    for (const testID of [
      'both-priority-child-first',
      'both-priority-self-first',
    ]) {
      expect(
        screen.getByTestId(testID).props.accessibilityState?.disabled,
      ).toBe(true);
    }
  });

  it('reenables options when the user returns to the screen', () => {
    render(<BothScreen />);
    fireEvent.press(screen.getByTestId('both-priority-child-first'));
    expect(
      screen.getByTestId('both-priority-child-first').props.accessibilityState
        ?.disabled,
    ).toBe(true);

    act(() => {
      focusCallback?.();
    });

    expect(
      screen.getByTestId('both-priority-child-first').props.accessibilityState
        ?.disabled,
    ).toBe(false);
  });
});
