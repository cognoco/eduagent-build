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
const mockUpdateAppContextMutate = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({ getToken: jest.fn().mockResolvedValue('mock-token') }),
}));

jest.mock(
  'expo-router' /* gc1-allow: hook test needs a deterministic navigation boundary */,
  () => ({
    useRouter: () => ({
      replace: mockReplace,
    }),
  }),
);

jest.mock(
  '../hooks/use-profiles' /* gc1-allow: useModeSwitch V1 tests need to control the app-context persistence boundary without mounting the API client */,
  () => ({
    useUpdateProfileAppContext: () => ({
      mutate: mockUpdateAppContextMutate,
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

const familyAdult = createTestProfile({
  id: 'family-adult',
  displayName: 'Family Adult',
  isOwner: true,
  birthYear: 1985,
  defaultAppContext: 'family',
  hasFamilyLinks: true,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const studyDefaultFamilyAdult = createTestProfile({
  id: 'study-default-family-adult',
  displayName: 'Family Adult',
  isOwner: true,
  birthYear: 1985,
  defaultAppContext: 'study',
  hasFamilyLinks: true,
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
    isExplicitProxyMode: false,
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
  const originalV1Flag = FEATURE_FLAGS.MODE_NAV_V1_ENABLED;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockUpdateAppContextMutate.mockReset();
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      true;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      false;
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      originalFlag;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      originalV1Flag;
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
  it('clears the pending timer on unmount (no stale callback on dead instance)', () => {
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');

    const { result, unmount } = renderHook(() => useModeSwitch(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.switchMode('study');
    });

    // Timer is pending - router.replace has NOT been called yet.
    expect(mockReplace).not.toHaveBeenCalled();

    // Unmounting should clear the timer so the callback never fires.
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();

    // Running pending timers now should be a no-op.
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('ignores a late V1 persistence success after unmount', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;

    const { result, unmount } = renderHook(() => useModeSwitch(), {
      wrapper: makeWrapper({ activeProfile: familyAdult }),
    });

    act(() => {
      result.current.switchMode('study');
    });

    const [, callbacks] = mockUpdateAppContextMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (profile: Profile) => void },
    ];

    unmount();

    act(() => {
      callbacks.onSuccess({
        ...familyAdult,
        defaultAppContext: 'study',
      });
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('is a no-op when both mode navigation flags are off', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      false;

    const { result } = renderHook(
      () => ({
        appContext: useAppContext(),
        modeSwitch: useModeSwitch(),
      }),
      { wrapper: makeWrapper() },
    );

    const modeBefore = result.current.appContext.mode;

    act(() => {
      result.current.modeSwitch.switchMode('study');
    });

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(result.current.appContext.mode).toBe(modeBefore);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current.modeSwitch.isSwitchingRef.current).toBe(false);
    expect(result.current.modeSwitch.isSwitching).toBe(false);
  });

  it('switches mode when V1 is enabled and V0 is disabled', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;

    const { result } = renderHook(
      () => ({
        appContext: useAppContext(),
        modeSwitch: useModeSwitch(),
      }),
      { wrapper: makeWrapper({ activeProfile: familyAdult }) },
    );

    expect(result.current.appContext.mode).toBe('family');

    act(() => {
      result.current.modeSwitch.switchMode('study');
    });

    expect(result.current.appContext.mode).toBe('family');
    expect(result.current.modeSwitch.isSwitchingRef.current).toBe(true);
    expect(mockUpdateAppContextMutate).toHaveBeenCalledWith(
      {
        profileId: familyAdult.id,
        defaultAppContext: 'study',
      },
      expect.any(Object),
    );

    const [, callbacks] = mockUpdateAppContextMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (profile: Profile) => void },
    ];
    act(() => {
      callbacks.onSuccess({
        ...familyAdult,
        defaultAppContext: 'study',
      });
    });

    expect(result.current.appContext.mode).toBe('study');

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('replaces to the canonical root after switching from study to family in V1', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;

    const { result } = renderHook(
      () => ({
        appContext: useAppContext(),
        modeSwitch: useModeSwitch(),
      }),
      { wrapper: makeWrapper({ activeProfile: studyDefaultFamilyAdult }) },
    );

    expect(result.current.appContext.mode).toBe('study');

    act(() => {
      result.current.modeSwitch.switchMode('family');
    });

    expect(result.current.appContext.mode).toBe('study');
    expect(result.current.modeSwitch.isSwitchingRef.current).toBe(true);
    expect(mockUpdateAppContextMutate).toHaveBeenCalledWith(
      {
        profileId: studyDefaultFamilyAdult.id,
        defaultAppContext: 'family',
      },
      expect.any(Object),
    );

    const [, callbacks] = mockUpdateAppContextMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (profile: Profile) => void },
    ];
    act(() => {
      callbacks.onSuccess({
        ...studyDefaultFamilyAdult,
        defaultAppContext: 'family',
      });
    });

    expect(result.current.appContext.mode).toBe('family');

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('does not navigate when V1 mode persistence fails', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;

    const { result } = renderHook(
      () => ({
        appContext: useAppContext(),
        modeSwitch: useModeSwitch(),
      }),
      { wrapper: makeWrapper({ activeProfile: familyAdult }) },
    );

    act(() => {
      result.current.modeSwitch.switchMode('study');
    });

    expect(result.current.appContext.mode).toBe('family');

    const [, callbacks] = mockUpdateAppContextMutate.mock.calls[0] as [
      unknown,
      { onError: () => void },
    ];
    act(() => {
      callbacks.onError();
    });

    expect(result.current.appContext.mode).toBe('family');
    expect(result.current.modeSwitch.isSwitchingRef.current).toBe(false);

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('exposes isSwitching as reactive state for UI feedback', () => {
    const { result } = renderHook(() => useModeSwitch(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isSwitching).toBe(false);

    act(() => {
      result.current.switchMode('study');
    });

    expect(result.current.isSwitching).toBe(true);

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(result.current.isSwitching).toBe(false);
  });

  it('resets the busy lock even when router.replace throws', () => {
    mockReplace.mockImplementationOnce(() => {
      throw new Error('navigation error');
    });

    const { result } = renderHook(() => useModeSwitch(), {
      wrapper: makeWrapper(),
    });

    act(() => {
      result.current.switchMode('study');
    });

    expect(result.current.isSwitchingRef.current).toBe(true);

    // The timer callback throws; catch it so the test harness does not fail.
    // The finally block in the impl still runs and clears the lock.
    expect(() => {
      act(() => {
        jest.runOnlyPendingTimers();
      });
    }).toThrow('navigation error');

    // Lock must be cleared even though router.replace threw. The ref is the
    // authoritative re-entry guard; the matching isSwitching state is a UI
    // hint whose React commit phase isn't guaranteed to flush when act() is
    // unwound by a thrown timer callback, so we assert only the ref here.
    expect(result.current.isSwitchingRef.current).toBe(false);
  });
});
