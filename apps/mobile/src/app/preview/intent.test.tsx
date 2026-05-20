import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import IntentScreen from './intent';
import * as state from '../../lib/preview-onboarding-state';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('Preview IntentScreen', () => {
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
    jest.spyOn(state, 'setPreviewState').mockResolvedValue();
  });

  it('routes Me → topic with intent self', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-self'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'self', path: 'learner_value_prop' }),
    );
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });

  it('routes My child → value-prop parent variant', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-child'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'child', path: 'parent_value_prop' }),
    );
    expect(push).toHaveBeenCalledWith({
      pathname: '/preview/value-prop',
      params: { variant: 'parent' },
    });
  });

  it('routes Both → both-priority screen', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-both'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'both',
        bothPriority: 'child_first',
        path: 'parent_value_prop',
      }),
    );
    expect(push).toHaveBeenCalledWith('/preview/both');
  });

  it('routes Not sure → topic (lesson fork) with intent not_sure', async () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-not-sure'));
    await Promise.resolve();
    expect(state.setPreviewState).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'not_sure' }),
    );
    expect(push).toHaveBeenCalledWith('/preview/topic');
  });

  it('double-tap guard: option buttons are disabled immediately after the first press', () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-self'));
    // All option buttons must become disabled immediately so the OS cannot
    // deliver a second tap event before the screen unmounts.
    for (const testID of [
      'intent-self',
      'intent-child',
      'intent-both',
      'intent-not-sure',
    ]) {
      expect(
        screen.getByTestId(testID).props.accessibilityState?.disabled,
      ).toBe(true);
    }
  });

  it('reenables options when the user returns to the screen', () => {
    render(<IntentScreen />);
    fireEvent.press(screen.getByTestId('intent-self'));
    expect(
      screen.getByTestId('intent-self').props.accessibilityState?.disabled,
    ).toBe(true);

    act(() => {
      focusCallback?.();
    });

    expect(
      screen.getByTestId('intent-self').props.accessibilityState?.disabled,
    ).toBe(false);
  });
});
