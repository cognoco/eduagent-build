/**
 * [AUTH-09] Regression tests for the Custom Tabs warm-up hook.
 *
 * The native crash this protects against is
 *   java.lang.IllegalArgumentException: Service not registered in
 *   expo.modules.webbrowser.CustomTabsConnectionHelper
 * which surfaces when `coolDownAsync()` is called without a successful prior
 * `warmUpAsync()` binding. The hook must therefore never cool down unless
 * warm-up resolved successfully.
 */

import { Platform } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { useWebBrowserWarmup } from './use-web-browser-warmup';

const warmUpAsyncMock = WebBrowser.warmUpAsync as unknown as jest.Mock;
const coolDownAsyncMock = WebBrowser.coolDownAsync as unknown as jest.Mock;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('useWebBrowserWarmup', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    warmUpAsyncMock.mockReset();
    coolDownAsyncMock.mockReset();
    warmUpAsyncMock.mockResolvedValue(undefined);
    coolDownAsyncMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
  });

  it('is a no-op on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    const { unmount } = renderHook(() => useWebBrowserWarmup());
    await flushMicrotasks();
    unmount();
    expect(warmUpAsyncMock).not.toHaveBeenCalled();
    expect(coolDownAsyncMock).not.toHaveBeenCalled();
  });

  it('warms up on Android mount and cools down on unmount', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const { unmount } = renderHook(() => useWebBrowserWarmup());
    await flushMicrotasks();
    expect(warmUpAsyncMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(coolDownAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('[AUTH-09] does NOT cool down when warmUp rejected (would crash native side)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    warmUpAsyncMock.mockRejectedValueOnce(
      new Error('Custom Tabs service unavailable'),
    );

    const { unmount } = renderHook(() => useWebBrowserWarmup());
    await flushMicrotasks();
    expect(warmUpAsyncMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(coolDownAsyncMock).not.toHaveBeenCalled();
  });

  it('[AUTH-09] cools down once when component unmounts before warmUp resolves', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    let resolveWarmUp: () => void = () => undefined;
    warmUpAsyncMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWarmUp = resolve;
      }),
    );

    const { unmount } = renderHook(() => useWebBrowserWarmup());
    // Unmount before warmUp settles
    unmount();
    expect(coolDownAsyncMock).not.toHaveBeenCalled();

    resolveWarmUp();
    await flushMicrotasks();

    expect(coolDownAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('does not call coolDown twice (cleanup vs. late warmUp resolution race)', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    let resolveWarmUp: () => void = () => undefined;
    warmUpAsyncMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWarmUp = resolve;
      }),
    );

    const { unmount } = renderHook(() => useWebBrowserWarmup());
    unmount();
    resolveWarmUp();
    await flushMicrotasks();

    // Only the post-resolve cleanup path runs; the cleanup function itself
    // bails because `warmedUp` is still false at unmount time.
    expect(coolDownAsyncMock).toHaveBeenCalledTimes(1);
  });
});
