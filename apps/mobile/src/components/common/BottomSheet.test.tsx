/**
 * BottomSheet — unit tests for the shared bottom-sheet primitive (WI-1080).
 *
 * Exercises: visibility gate, modal/backdrop structure, backdropDismissible,
 * testID forwarding, and onClose wiring. Does NOT test visual style values
 * (NativeWind className → style resolution is a native-layer concern); asserts
 * structural and behavioural properties instead.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { BottomSheet } from './BottomSheet';

const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BottomSheet', () => {
  it('renders children when visible=true', () => {
    render(
      <BottomSheet visible onClose={onClose}>
        <Text testID="child">Sheet content</Text>
      </BottomSheet>,
    );
    screen.getByTestId('child');
    screen.getByText('Sheet content');
  });

  it('does not render children when visible=false', () => {
    render(
      <BottomSheet visible={false} onClose={onClose}>
        <Text testID="child">Sheet content</Text>
      </BottomSheet>,
    );
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('forwards testID to the surface container', () => {
    render(
      <BottomSheet visible onClose={onClose} testID="my-sheet">
        <Text>Content</Text>
      </BottomSheet>,
    );
    screen.getByTestId('my-sheet');
  });

  it('calls onClose on hardware back (onRequestClose) — always wired', () => {
    // Modal.onRequestClose is the Android back-button handler. BottomSheet
    // must wire it unconditionally so sheets are dismissible on Android.
    const { UNSAFE_getByType } = render(
      <BottomSheet visible onClose={onClose}>
        <Text>Content</Text>
      </BottomSheet>,
    );
    const { Modal } = require('react-native');
    const modal = UNSAFE_getByType(Modal);
    modal.props.onRequestClose?.();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('backdropDismissible=false (default)', () => {
    it('does NOT call onClose when pressing inside the content area', () => {
      // Without backdropDismissible, the backdrop is a non-pressable View.
      // Pressing a child should never fire onClose.
      render(
        <BottomSheet visible onClose={onClose}>
          <Text testID="inner">Inner content</Text>
        </BottomSheet>,
      );
      fireEvent.press(screen.getByTestId('inner'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('backdropDismissible=true', () => {
    it('renders a pressable backdrop', () => {
      render(
        <BottomSheet visible onClose={onClose} backdropDismissible>
          <Text>Content</Text>
        </BottomSheet>,
      );
      // The backdrop Pressable has accessibilityRole="button"
      // getByLabelText finds the close button by its default label.
      screen.getByLabelText('Close');
    });

    it('calls onClose when backdrop is pressed', () => {
      render(
        <BottomSheet visible onClose={onClose} backdropDismissible>
          <Text>Content</Text>
        </BottomSheet>,
      );
      fireEvent.press(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when pressing inside the content area', () => {
      render(
        <BottomSheet visible onClose={onClose} backdropDismissible>
          <Text testID="inner">Inner content</Text>
        </BottomSheet>,
      );
      fireEvent.press(screen.getByTestId('inner'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('accepts a custom backdropAccessibilityLabel', () => {
      render(
        <BottomSheet
          visible
          onClose={onClose}
          backdropDismissible
          backdropAccessibilityLabel="Close topic picker"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
      screen.getByLabelText('Close topic picker');
    });
  });
});
