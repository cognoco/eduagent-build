import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppContextProvider, useAppContext } from './app-context';
import {
  ProfileContext,
  type ProfileContextValue,
  type Profile,
} from './profile';
import { useModeSwitch } from './use-mode-switch';
import { FEATURE_FLAGS } from './feature-flags';
import { createTestProfile } from '../test-utils/app-hook-test-utils';

const mockReplace = jest.fn();

jest.mock(
  'expo-router' /* gc1-allow: hook test needs a deterministic navigation boundary */,
  () => ({
    useRouter: () => ({
      replace: mockReplace,
    }),
  }),
);

const adult = createTestProfile({
  id: 'adult',
  displayName: 'Adult',
  isOwner: true,
  birthYear: 1985,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const child = createTestProfile({
  id: 'child',
  displayName: 'Child',
  isOwner: false,
  birthYear: 2014,
  createdAt: '2026-01-01T00:00:00.000Z',
});

function makeWrapper({
  activeProfile = adult,
  profiles = [adult, child],
  queryClient,
}: {
  activeProfile?: Profile | null;
  profiles?: Profile[];
  queryClient?: QueryClient;
} = {}): React.ComponentType<{ children: ReactNode }> {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
  const profileContext: ProfileContextValue = {
    profiles,
    activeProfile,
    switchProfile: jest.fn().mockResolvedValue({ success: true }),
    isLoading: false,
    profileLoadError: null,
    profileWasRemoved: false,
    acknowledgeProfileRemoval: jest.fn(),
  };

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ProfileContext.Provider value={profileContext}>
          <AppContextProvider>{children}</AppContextProvider>
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

describe('useModeSwitch', () => {
  const originalFlag = FEATURE_FLAGS.MODE_NAV_V0_ENABLED;
  const originalQueueMicrotask = globalThis.queueMicrotask;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      true;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      originalFlag;
    Object.defineProperty(globalThis, 'queueMicrotask', {
      configurable: true,
      value: originalQueueMicrotask,
      writable: true,
    });
  });

  it('switches mode and navigates home when queueMicrotask is unavailable', () => {
    Object.defineProperty(globalThis, 'queueMicrotask', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    const { result } = renderHook(
      () => ({
        appContext: useAppContext(),
        modeSwitch: useModeSwitch(),
      }),
      { wrapper: makeWrapper() },
    );

    expect(result.current.appContext.mode).toBe('family');

    act(() => {
      result.current.modeSwitch.switchMode('study');
    });

    expect(result.current.appContext.mode).toBe('study');
    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('commits the next mode before navigating home', () => {
    const { result } = renderHook(
      () => ({
        appContext: useAppContext(),
        modeSwitch: useModeSwitch(),
      }),
      { wrapper: makeWrapper() },
    );
    const modeAtNavigation: Array<string | null> = [];
    mockReplace.mockImplementation(() => {
      modeAtNavigation.push(result.current.appContext.mode);
    });

    act(() => {
      result.current.modeSwitch.switchMode('study');
    });

    expect(result.current.appContext.mode).toBe('study');
    expect(modeAtNavigation).toEqual([]);

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(modeAtNavigation).toEqual(['study']);
  });

  it('invalidates mode-scoped queries exactly once on switch', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useModeSwitch(), {
      wrapper: makeWrapper({ queryClient }),
    });

    act(() => {
      result.current.switchMode('study');
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      predicate: expect.any(Function),
    });
    const [{ predicate }] = invalidateSpy.mock.calls[0] as unknown as [
      { predicate: (query: { queryKey: unknown[] }) => boolean },
    ];
    expect(predicate({ queryKey: ['dashboard'] })).toBe(true);
    expect(predicate({ queryKey: ['progress'] })).toBe(true);
    expect(predicate({ queryKey: ['profiles'] })).toBe(false);
  });

  it('ignores repeated taps while a mode switch is in flight', () => {
    const { result } = renderHook(() => useModeSwitch(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.switchMode('study');
      result.current.switchMode('study');
    });

    expect(mockReplace).not.toHaveBeenCalled();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
  });
});
