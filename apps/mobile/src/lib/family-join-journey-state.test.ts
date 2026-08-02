import * as SecureStore from './secure-storage';
import { Platform } from 'react-native';
import {
  clearFamilyJoinContinuation,
  FAMILY_JOIN_JOURNEY_KEY,
  readFamilyJoinContinuation,
  saveFamilyJoinContinuation,
} from './family-join-journey-state';

describe('family-join journey continuation', () => {
  const originalPlatformOs = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOs,
    });
  });

  it('round-trips the opaque code and the learner-owned visibility choice', async () => {
    await saveFamilyJoinContinuation({
      version: 1,
      role: 'learner',
      token: 'one-time-family-code',
      supportershipDecision: 'decline',
      lastStatus: 'awaiting_guardian',
    });

    await expect(readFamilyJoinContinuation()).resolves.toEqual({
      version: 1,
      role: 'learner',
      token: 'one-time-family-code',
      supportershipDecision: 'decline',
      lastStatus: 'awaiting_guardian',
    });
  });

  it('deletes malformed or obsolete state instead of guessing at authority', async () => {
    await SecureStore.setItemAsync(
      FAMILY_JOIN_JOURNEY_KEY,
      JSON.stringify({
        version: 1,
        token: 'code',
        supportershipDecision: true,
      }),
    );

    await expect(readFamilyJoinContinuation()).resolves.toBeNull();
    await expect(
      SecureStore.getItemAsync(FAMILY_JOIN_JOURNEY_KEY),
    ).resolves.toBeNull();
  });

  it('clears the code after a terminal result or safe exit', async () => {
    await saveFamilyJoinContinuation({
      version: 1,
      role: 'guardian',
      token: 'one-time-family-code',
      supportershipDecision: 'accept',
      lastStatus: 'ready_to_join',
    });

    await clearFamilyJoinContinuation();
    await expect(readFamilyJoinContinuation()).resolves.toBeNull();
  });

  it('never persists the bearer-style continuation code in web plaintext storage', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
    await SecureStore.setItemAsync(FAMILY_JOIN_JOURNEY_KEY, 'old-web-value');

    await expect(readFamilyJoinContinuation()).resolves.toBeNull();
    await saveFamilyJoinContinuation({
      version: 1,
      role: 'learner',
      token: 'must-not-enter-local-storage',
      supportershipDecision: 'accept',
      lastStatus: 'awaiting_guardian',
    });

    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatformOs,
    });
    await expect(
      SecureStore.getItemAsync(FAMILY_JOIN_JOURNEY_KEY),
    ).resolves.toBeNull();
  });
});
