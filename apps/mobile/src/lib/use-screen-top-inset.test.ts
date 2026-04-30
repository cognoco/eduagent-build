import { Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';

import { useScreenTopInset } from './use-screen-top-inset';

const mockInsets = jest.fn();
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets(),
}));

describe('useScreenTopInset', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS });
    mockInsets.mockReset();
  });

  function setOS(os: typeof Platform.OS) {
    Object.defineProperty(Platform, 'OS', { get: () => os });
  }

  it('passes through native iOS insets unchanged', () => {
    setOS('ios');
    mockInsets.mockReturnValue({ top: 47, bottom: 34, left: 0, right: 0 });
    const { result } = renderHook(() => useScreenTopInset());
    expect(result.current).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  it('passes through native Android insets unchanged', () => {
    setOS('android');
    mockInsets.mockReturnValue({ top: 24, bottom: 0, left: 0, right: 0 });
    const { result } = renderHook(() => useScreenTopInset());
    expect(result.current.top).toBe(24);
  });

  it('[BUG-933] enforces a 24px minimum top inset on web when reported value is 0', () => {
    setOS('web');
    mockInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    const { result } = renderHook(() => useScreenTopInset());
    expect(result.current.top).toBe(24);
  });

  it('[BUG-933] defers to a real reported web inset when SafeAreaProvider returns one', () => {
    // PWA fullscreen on iOS Safari may report a real notch height — don't
    // shrink it back to the minimum.
    setOS('web');
    mockInsets.mockReturnValue({ top: 47, bottom: 0, left: 0, right: 0 });
    const { result } = renderHook(() => useScreenTopInset());
    expect(result.current.top).toBe(47);
  });

  it('[BUG-933] does not modify other edges on web', () => {
    setOS('web');
    mockInsets.mockReturnValue({ top: 0, bottom: 12, left: 5, right: 5 });
    const { result } = renderHook(() => useScreenTopInset());
    expect(result.current.bottom).toBe(12);
    expect(result.current.left).toBe(5);
    expect(result.current.right).toBe(5);
  });
});
