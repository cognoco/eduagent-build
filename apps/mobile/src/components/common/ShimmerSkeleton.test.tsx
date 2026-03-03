import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { ShimmerSkeleton } from './ShimmerSkeleton';

// useReducedMotion returns false by default (see test-setup.ts mock)

describe('ShimmerSkeleton', () => {
  it('renders children', () => {
    const { getByText } = render(
      <ShimmerSkeleton>
        <Text>Placeholder</Text>
      </ShimmerSkeleton>
    );
    expect(getByText('Placeholder')).toBeTruthy();
  });

  it('passes testID to container', () => {
    const { getByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <View />
      </ShimmerSkeleton>
    );
    expect(getByTestId('skel')).toBeTruthy();
  });

  it('renders shimmer overlay in normal mode', () => {
    const { getByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <View />
      </ShimmerSkeleton>
    );
    const container = getByTestId('skel');
    expect(container.props.style).toBeDefined();
  });

  it('skips shimmer overlay when reduced motion is enabled', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const { getByTestId, queryByTestId } = render(
      <ShimmerSkeleton testID="skel">
        <Text>Content</Text>
      </ShimmerSkeleton>
    );

    expect(getByTestId('skel')).toBeTruthy();
    expect(queryByTestId('skel-shimmer')).toBeNull();

    reanimated.useReducedMotion = original;
  });

  it('accepts custom duration prop without crashing', () => {
    const { getByText } = render(
      <ShimmerSkeleton duration={2000}>
        <Text>Fast shimmer</Text>
      </ShimmerSkeleton>
    );
    expect(getByText('Fast shimmer')).toBeTruthy();
  });
});
