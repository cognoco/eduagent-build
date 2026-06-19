import { Platform } from 'react-native';

import { FEATURE_FLAGS } from '../../../lib/feature-flags';

import {
  getPostAuthDefaultPath,
  resolveAuthRedirectPath,
} from './auth-redirect';

function setV2Flag(value: boolean): void {
  (FEATURE_FLAGS as { MODE_NAV_V2_ENABLED: boolean }).MODE_NAV_V2_ENABLED =
    value;
}

describe('auth redirect helpers', () => {
  const originalV2 = FEATURE_FLAGS.MODE_NAV_V2_ENABLED;
  const originalPlatform = Platform.OS;

  afterEach(() => {
    setV2Flag(originalV2);
    Object.defineProperty(Platform, 'OS', {
      value: originalPlatform,
      configurable: true,
    });
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('uses home as the signed-in default when V2 navigation is off', () => {
    setV2Flag(false);

    expect(getPostAuthDefaultPath()).toBe('/(app)/home');
    expect(resolveAuthRedirectPath(undefined)).toBe('/(app)/home');
  });

  it('uses mentor as the signed-in default when V2 navigation is on', () => {
    setV2Flag(true);

    expect(getPostAuthDefaultPath()).toBe('/(app)/mentor');
    expect(resolveAuthRedirectPath(undefined)).toBe('/(app)/mentor');
  });

  it('keeps explicit web redirect paths ahead of the V2 default', () => {
    setV2Flag(true);
    Object.defineProperty(Platform, 'OS', {
      value: 'web',
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          pathname: '/child/emma-id',
          search: '?mode=progress',
        },
      },
      configurable: true,
    });

    expect(resolveAuthRedirectPath(undefined)).toBe(
      '/(app)/child/emma-id?mode=progress',
    );
  });
});
