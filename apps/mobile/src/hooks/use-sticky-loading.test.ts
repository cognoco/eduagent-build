import { act, renderHook } from '@testing-library/react-native';
import { useStickyLoading } from './use-sticky-loading';

describe('useStickyLoading', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('mirrors active=true immediately', () => {
    const { result } = renderHook(
      ({ active }) => useStickyLoading(active, 1000),
      {
        initialProps: { active: true },
      },
    );
    expect(result.current).toBe(true);
  });

  it('mirrors active=false when never activated', () => {
    const { result } = renderHook(
      ({ active }) => useStickyLoading(active, 1000),
      {
        initialProps: { active: false },
      },
    );
    expect(result.current).toBe(false);
  });

  it('keeps sticky=true for the minimum duration after active flips off', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useStickyLoading(active, 1000),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    rerender({ active: false });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe(false);
  });

  it('drops immediately if the minimum duration has already elapsed', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useStickyLoading(active, 500),
      { initialProps: { active: true } },
    );

    act(() => {
      jest.advanceTimersByTime(800);
    });
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it('cancels the timer if active flips back on within the sticky window', () => {
    const { result, rerender } = renderHook(
      ({ active }) => useStickyLoading(active, 1000),
      { initialProps: { active: true } },
    );

    act(() => {
      jest.advanceTimersByTime(100);
    });
    rerender({ active: false });
    rerender({ active: true });

    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(true);
  });

  it('clears the timer on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ active }) => useStickyLoading(active, 1000),
      { initialProps: { active: true } },
    );
    rerender({ active: false });
    expect(result.current).toBe(true);
    unmount();

    expect(() => {
      jest.advanceTimersByTime(2000);
    }).not.toThrow();
  });
});
