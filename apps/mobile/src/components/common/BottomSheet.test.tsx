/**
 * BottomSheet — unit tests for the shared bottom-sheet primitive (WI-1080).
 *
 * Exercises: visibility gate, modal/backdrop structure, backdropDismissible,
 * testID forwarding, and onClose wiring. Does NOT test visual style values
 * (NativeWind className → style resolution is a native-layer concern); asserts
 * structural and behavioural properties instead.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, Pressable, ScrollView, Text, TextInput } from 'react-native';

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

  it('calls onClose once for Escape or Android back (onRequestClose) and keeps modal focus containment', () => {
    // Modal.onRequestClose is the cross-platform request-close seam used by
    // Android Back and, where supported, web Escape handling.
    const { UNSAFE_getByProps, UNSAFE_getByType } = render(
      <BottomSheet visible onClose={onClose} accessibilityLabel="Content">
        <Text>Content</Text>
      </BottomSheet>,
    );
    const { Modal } = require('react-native');
    const modal = UNSAFE_getByType(Modal);
    modal.props.onRequestClose?.();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(
      UNSAFE_getByProps({ accessibilityViewIsModal: true }).props
        .accessibilityViewIsModal,
    ).toBe(true);
  });

  it.each([
    ['ios', 'accessibilityViewIsModal', true],
    ['android', 'importantForAccessibility', 'yes'],
  ] as const)(
    'keeps %s modal containment on a non-grouping root while child actions remain independent',
    (os, containmentProp, containmentValue) => {
      const originalOS = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, value: os });

      try {
        const { UNSAFE_getByProps } = render(
          <BottomSheet
            visible
            onClose={onClose}
            accessibilityLabel="Topic picker"
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose Algebra"
              testID="native-child-action"
            >
              <Text>Algebra</Text>
            </Pressable>
          </BottomSheet>,
        );

        const dialog = screen.getByRole('dialog', { name: 'Topic picker' });
        screen.getByRole('button', { name: 'Choose Algebra' });
        expect(
          dialog.findAllByProps({ testID: 'native-child-action' }),
        ).toHaveLength(0);
        expect(
          UNSAFE_getByProps({ [containmentProp]: containmentValue }),
        ).toEqual(expect.anything());
      } finally {
        Object.defineProperty(Platform, 'OS', {
          configurable: true,
          value: originalOS,
        });
      }
    },
  );

  describe('backdropDismissible=false (default)', () => {
    it('does not expose a backdrop close action', () => {
      render(
        <BottomSheet
          visible
          onClose={onClose}
          accessibilityLabel="Required action"
          testID="non-dismissible-sheet"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );

      expect(screen.queryByLabelText('Close')).toBeNull();
      screen.getByRole('dialog', { name: 'Required action' });
    });

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
    it('[WI-2182] keeps the backdrop button and named dialog as accessible siblings', () => {
      render(
        <BottomSheet
          visible
          onClose={onClose}
          backdropDismissible
          accessibilityLabel="Topic picker"
          testID="sheet-surface"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose Algebra"
            testID="inner-action"
          >
            <Text>Algebra</Text>
          </Pressable>
        </BottomSheet>,
      );

      const backdrop = screen.getByLabelText('Close');
      const dialog = screen.getByRole('dialog', { name: 'Topic picker' });
      const action = screen.getByRole('button', { name: 'Choose Algebra' });

      expect(dialog.findAllByProps({ testID: 'inner-action' })).toHaveLength(0);
      expect(action).not.toBe(dialog);
      expect(backdrop.findAllByProps({ testID: 'sheet-surface' })).toHaveLength(
        0,
      );
      expect(backdrop.findAllByProps({ testID: 'inner-action' })).toHaveLength(
        0,
      );
    });

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

    it('does not dismiss for child press, typing, scroll, or touch gestures inside the dialog', () => {
      const onAction = jest.fn();
      render(
        <BottomSheet
          visible
          onClose={onClose}
          backdropDismissible
          accessibilityLabel="Topic picker"
        >
          <ScrollView testID="sheet-scroll">
            <TextInput testID="sheet-input" value="" onChangeText={jest.fn()} />
            <Pressable testID="sheet-action" onPress={onAction}>
              <Text>Choose topic</Text>
            </Pressable>
          </ScrollView>
        </BottomSheet>,
      );

      fireEvent.press(screen.getByTestId('sheet-action'));
      fireEvent.changeText(screen.getByTestId('sheet-input'), 'algebra');
      fireEvent.scroll(screen.getByTestId('sheet-scroll'), {
        nativeEvent: { contentOffset: { x: 0, y: 24 } },
      });
      fireEvent(screen.getByTestId('sheet-scroll'), 'touchStart');
      fireEvent(screen.getByTestId('sheet-scroll'), 'touchMove');
      fireEvent(screen.getByTestId('sheet-scroll'), 'touchEnd');

      expect(onAction).toHaveBeenCalledTimes(1);
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
