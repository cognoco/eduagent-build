import { render, fireEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { ShimmerSkeleton } from './ShimmerSkeleton';

// useReducedMotion returns false by default (see test-setup.ts mock)

describe('ShimmerSkeleton', () => {
  it('renders children', () => {
    const { getByText } = render(
      <ShimmerSkeleton>
        <Text>Placeholder</Text>
      </ShimmerSkeleton>,
    );
    getByText('Placeholder');
  });

  it('passes testID to container', () => {
    const { getByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <View />
      </ShimmerSkeleton>,
    );
    getByTestId('skel');
  });

  it('renders shimmer overlay in normal mode', () => {
    const { getByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <View />
      </ShimmerSkeleton>,
    );
    const container = getByTestId('skel');
    expect(container.props.style).not.toBeNull();
  });

  it('skips shimmer overlay when reduced motion is enabled', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId, queryByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <Text>Content</Text>
      </ShimmerSkeleton>,
    );

    getByTestId('skel');
    expect(queryByTestId('skel-shimmer')).toBeNull();

    reanimated.useReducedMotion = original;
  });

  it('accepts custom duration prop without crashing', () => {
    const { getByText } = render(
      <ShimmerSkeleton duration={2000}>
        <Text>Fast shimmer</Text>
      </ShimmerSkeleton>,
    );
    getByText('Fast shimmer');
  });

  // BR-01: animation must be cancelled on unmount to prevent leaked UI-thread work.
  // The animation only starts after onLayout fires (containerWidth > 0), so we
  // simulate a layout event to trigger the effect, then verify cleanup runs.
  it('cancels animation on unmount after layout (BR-01)', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount, getByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <View />
      </ShimmerSkeleton>,
    );

    // Simulate a layout event so containerWidth > 0, triggering the animation effect
    const container = getByTestId('skel');
    fireEvent(container, 'layout', {
      nativeEvent: { layout: { width: 300, height: 40, x: 0, y: 0 } },
    });

    unmount();

    // translateX shared value should be cancelled
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });
});
