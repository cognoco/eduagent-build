import { act, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Profile } from '@eduagent/schemas';

import { AppContextProvider, useAppContext } from './app-context';
import { ProfileContext, type ProfileContextValue } from './profile';
import { FEATURE_FLAGS } from './feature-flags';

const mockUpdateAppContextMutate = jest.fn();
jest.mock(
  '../hooks/use-profiles' /* gc1-allow: AppContextProvider unit tests control the persistence boundary without mounting the API client */,
  () => ({
    useUpdateProfileAppContext: () => ({
      mutate: mockUpdateAppContextMutate,
    }),
  }),
);

const adult = {
  id: 'adult',
  accountId: 'acct',
  isOwner: true,
  birthYear: 1985,
  displayName: 'Adult',
  avatarUrl: null,
  location: null,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  linkCreatedAt: null,
} as Profile;

const child = {
  id: 'child',
  accountId: 'acct',
  isOwner: false,
  birthYear: 2014,
  displayName: 'Child',
  avatarUrl: null,
  location: null,
  hasPremiumLlm: false,
  defaultAppContext: null,
  hasFamilyLinks: false,
  conversationLanguage: 'en',
  pronouns: null,
  consentStatus: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  linkCreatedAt: '2026-01-02T00:00:00.000Z',
} as Profile;

function makeWrapper(value: Partial<ProfileContextValue>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const merged: ProfileContextValue = {
      profiles: [],
      activeProfile: null,
      isExplicitProxyMode: false,
      switchProfile: async () => ({ success: true }),
      isLoading: false,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
      ...value,
    };

    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={merged}>
          <AppContextProvider>{children}</AppContextProvider>
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };
}

function makeMutableWrapper(initialValue: Partial<ProfileContextValue>) {
  let currentValue = initialValue;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const merged: ProfileContextValue = {
      profiles: [],
      activeProfile: null,
      isExplicitProxyMode: false,
      switchProfile: async () => ({ success: true }),
      isLoading: false,
      profileLoadError: null,
      profileWasRemoved: false,
      acknowledgeProfileRemoval: () => undefined,
      ...currentValue,
    };

    return (
      <QueryClientProvider client={queryClient}>
        <ProfileContext.Provider value={merged}>
          <AppContextProvider>{children}</AppContextProvider>
        </ProfileContext.Provider>
      </QueryClientProvider>
    );
  };

  return {
    Wrapper,
    setValue: (nextValue: Partial<ProfileContextValue>) => {
      currentValue = nextValue;
    },
  };
}

describe('AppContextProvider', () => {
  const originalFlag = FEATURE_FLAGS.MODE_NAV_V0_ENABLED;
  const originalV1Flag = FEATURE_FLAGS.MODE_NAV_V1_ENABLED;

  beforeEach(() => {
    mockUpdateAppContextMutate.mockReset();
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      false;
  });

  afterEach(() => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      originalFlag;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      originalV1Flag;
  });

  it('resolves family mode for a family-capable adult', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      true;

    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: adult,
        profiles: [adult, child],
      }),
    });

    expect(result.current.familyCapable).toBe(true);
    expect(result.current.mode).toBe('family');
  });

  it('resets to null while profiles are loading', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      true;

    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: null,
        profiles: [],
        isLoading: true,
      }),
    });

    expect(result.current.mode).toBeNull();
  });

  it('does not keep a family override after capability is lost', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      true;

    const mutableWrapper = makeMutableWrapper({
      activeProfile: adult,
      profiles: [adult, child],
    });
    const { result, rerender } = renderHook(() => useAppContext(), {
      wrapper: mutableWrapper.Wrapper,
    });

    act(() => result.current.setMode('family'));
    expect(result.current.mode).toBe('family');

    mutableWrapper.setValue({
      activeProfile: adult,
      profiles: [adult],
    });
    rerender(undefined);

    expect(result.current.familyCapable).toBe(false);
    expect(result.current.mode).toBe('study');
  });

  it('collapses to null when the kill switch is off', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;

    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: adult,
        profiles: [adult, child],
      }),
    });

    expect(result.current.familyCapable).toBe(false);
    expect(result.current.mode).toBeNull();
  });

  it('uses the server default app context when the V1 flag is enabled', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;
    const serverBackedAdult = {
      ...adult,
      defaultAppContext: 'family' as const,
      hasFamilyLinks: true,
    };

    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: serverBackedAdult,
        profiles: [serverBackedAdult, child],
      }),
    });

    expect(result.current.familyCapable).toBe(true);
    expect(result.current.mode).toBe('family');
  });

  it('clamps a family default to study when the server says no family links exist', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;

    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: {
          ...adult,
          defaultAppContext: 'family',
          hasFamilyLinks: false,
        },
        profiles: [adult],
      }),
    });

    expect(result.current.familyCapable).toBe(false);
    expect(result.current.mode).toBe('study');
  });

  it('optimistically switches V1 mode and rolls back when persistence fails', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;
    const serverBackedAdult = {
      ...adult,
      defaultAppContext: 'family' as const,
      hasFamilyLinks: true,
    };

    const { result } = renderHook(() => useAppContext(), {
      wrapper: makeWrapper({
        activeProfile: serverBackedAdult,
        profiles: [serverBackedAdult, child],
      }),
    });

    act(() => result.current.setMode('study'));

    expect(result.current.mode).toBe('study');
    expect(mockUpdateAppContextMutate).toHaveBeenCalledWith(
      { profileId: 'adult', defaultAppContext: 'study' },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );

    const [, callbacks] = mockUpdateAppContextMutate.mock.calls[0] as [
      unknown,
      { onError: () => void },
    ];
    act(() => callbacks.onError());

    expect(result.current.mode).toBe('family');
  });

  it('keeps a successful V1 switch when its own confirming refetch re-renders first (WI-816 race)', () => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      false;
    (FEATURE_FLAGS as { MODE_NAV_V1_ENABLED: boolean }).MODE_NAV_V1_ENABLED =
      true;
    const familyAdult = {
      ...adult,
      defaultAppContext: 'family' as const,
      hasFamilyLinks: true,
    };

    const mutableWrapper = makeMutableWrapper({
      activeProfile: familyAdult,
      profiles: [familyAdult, child],
    });
    const { result, rerender } = renderHook(() => useAppContext(), {
      wrapper: mutableWrapper.Wrapper,
    });

    const onSuccess = jest.fn();
    const onError = jest.fn();
    act(() => result.current.setMode('study', { onSuccess, onError }));

    // The mutation's own onSuccess (use-profiles.ts:97) invalidates
    // ['profiles'], so a background refetch lands defaultAppContext='study'
    // and the provider re-renders BEFORE the switch's per-call onSuccess
    // resolves. That self-induced re-render must NOT trip the stale-request
    // seq guard against the switch's own success.
    const studyAdult = { ...familyAdult, defaultAppContext: 'study' as const };
    mutableWrapper.setValue({
      activeProfile: studyAdult,
      profiles: [studyAdult, child],
    });
    act(() => rerender(undefined));

    const [, callbacks] = mockUpdateAppContextMutate.mock.calls[0] as [
      unknown,
      { onSuccess: (profile: Profile) => void; onError: () => void },
    ];
    act(() => callbacks.onSuccess(studyAdult));

    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(result.current.mode).toBe('study');
  });
});
