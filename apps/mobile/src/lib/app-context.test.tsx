import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { Profile } from '@eduagent/schemas';

import { AppContextProvider, useAppContext } from './app-context';
import { ProfileContext, type ProfileContextValue } from './profile';
import { FEATURE_FLAGS } from './feature-flags';

const adult = {
  id: 'adult',
  isOwner: true,
  birthYear: 1985,
  displayName: 'Adult',
  createdAt: '2026-01-01T00:00:00.000Z',
  linkCreatedAt: null,
} as Profile;

const child = {
  id: 'child',
  isOwner: false,
  birthYear: 2014,
  displayName: 'Child',
  createdAt: '2026-01-01T00:00:00.000Z',
  linkCreatedAt: '2026-01-02T00:00:00.000Z',
} as Profile;

function makeWrapper(value: Partial<ProfileContextValue>) {
  return function Wrapper({ children }: { children: ReactNode }) {
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
      <ProfileContext.Provider value={merged}>
        <AppContextProvider>{children}</AppContextProvider>
      </ProfileContext.Provider>
    );
  };
}

function makeMutableWrapper(initialValue: Partial<ProfileContextValue>) {
  let currentValue = initialValue;
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
      <ProfileContext.Provider value={merged}>
        <AppContextProvider>{children}</AppContextProvider>
      </ProfileContext.Provider>
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

  afterEach(() => {
    (FEATURE_FLAGS as { MODE_NAV_V0_ENABLED: boolean }).MODE_NAV_V0_ENABLED =
      originalFlag;
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
});
