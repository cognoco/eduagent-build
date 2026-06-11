import { render } from '@testing-library/react-native';
import { BrandCelebration } from './BrandCelebration';

describe('BrandCelebration', () => {
  it('renders without crashing with default props', () => {
    const { toJSON } = render(<BrandCelebration />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with testID', () => {
    const { getByTestId } = render(<BrandCelebration testID="brand-cel" />);
    getByTestId('brand-cel', { includeHiddenElements: true });
  });

  it('accepts size prop', () => {
    const { toJSON } = render(<BrandCelebration size={80} />);
    expect(toJSON()).toBeTruthy();
  });

  it('calls onComplete in reduced motion mode', () => {
    const reanimated = require('react-native-reanimated');
    const original = reanimated.useReducedMotion;
    reanimated.useReducedMotion = () => true;

    const onComplete = jest.fn();
    render(<BrandCelebration onComplete={onComplete} />);

    expect(onComplete).toHaveBeenCalledTimes(1);

    reanimated.useReducedMotion = original;
  });

  it('cancels all 14 shared values on unmount', () => {
    const reanimated = require('react-native-reanimated');
    const cancelSpy = jest.spyOn(reanimated, 'cancelAnimation');

    const { unmount } = render(<BrandCelebration testID="brand-cel" />);
    unmount();

    // 13 declared shared values + containerOp = 14 total cancelAnimation calls
    expect(cancelSpy.mock.calls.length).toBeGreaterThanOrEqual(14);
    cancelSpy.mockRestore();
  });
});
