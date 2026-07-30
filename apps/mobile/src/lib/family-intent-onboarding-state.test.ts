import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from './secure-storage';
import {
  FAMILY_INTENT_ONBOARDING_KEY,
  FAMILY_INTENT_ONBOARDING_RECOVERY_KEY,
  __resetFamilyIntentOnboardingForTests,
  clearFamilyIntentOnboarding,
  readFamilyIntentOnboarding,
  startFamilyIntentOnboarding,
  updateFamilyIntentOnboardingStep,
} from './family-intent-onboarding-state';

const setItemSpy = jest.spyOn(SecureStore, 'setItemAsync');
const getItemSpy = jest.spyOn(SecureStore, 'getItemAsync');
const deleteItemSpy = jest.spyOn(SecureStore, 'deleteItemAsync');

beforeEach(async () => {
  __resetFamilyIntentOnboardingForTests();
  await AsyncStorage.clear();
  jest.mocked(AsyncStorage.setItem).mockClear();
  setItemSpy.mockReset().mockResolvedValue(undefined);
  getItemSpy.mockReset().mockResolvedValue(null);
  deleteItemSpy.mockReset().mockResolvedValue(undefined);
});

afterAll(() => {
  setItemSpy.mockRestore();
  getItemSpy.mockRestore();
  deleteItemSpy.mockRestore();
});

describe('family-intent onboarding state', () => {
  it('persists a non-authorizing learner-target step for the created adult profile', async () => {
    await startFamilyIntentOnboarding('adult-profile');

    expect(setItemSpy).toHaveBeenCalledWith(
      FAMILY_INTENT_ONBOARDING_KEY,
      JSON.stringify({
        version: 1,
        profileId: 'adult-profile',
        step: 'learner-target',
      }),
    );
  });

  it('restores the pending choice after an auth/profile remount or relaunch', async () => {
    getItemSpy.mockResolvedValue(
      JSON.stringify({
        version: 1,
        profileId: 'adult-profile',
        step: 'login-choice',
      }),
    );
    __resetFamilyIntentOnboardingForTests();

    await expect(readFamilyIntentOnboarding()).resolves.toEqual({
      version: 1,
      profileId: 'adult-profile',
      step: 'login-choice',
    });
  });

  it('durably advances to the managed-path unavailable state', async () => {
    await startFamilyIntentOnboarding('adult-profile');
    await updateFamilyIntentOnboardingStep('managed-unavailable');

    expect(setItemSpy).toHaveBeenLastCalledWith(
      FAMILY_INTENT_ONBOARDING_KEY,
      expect.stringContaining('"step":"managed-unavailable"'),
    );
  });

  it('recovers a post-create start after SecureStore rejects the primary write', async () => {
    setItemSpy.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      startFamilyIntentOnboarding('adult-profile'),
    ).resolves.toBeUndefined();
    __resetFamilyIntentOnboardingForTests();
    await expect(readFamilyIntentOnboarding()).resolves.toEqual({
      version: 1,
      profileId: 'adult-profile',
      step: 'learner-target',
    });
    await expect(
      AsyncStorage.getItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY),
    ).resolves.toContain('"profileId":"adult-profile"');
  });

  it('keeps a healthy primary write successful when the recovery journal rejects', async () => {
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('recovery unavailable'));

    await expect(
      startFamilyIntentOnboarding('adult-profile'),
    ).resolves.toBeUndefined();
    expect(setItemSpy).toHaveBeenCalledWith(
      FAMILY_INTENT_ONBOARDING_KEY,
      expect.stringContaining('"profileId":"adult-profile"'),
    );
  });

  it('rejects a post-create start only when both durable stores fail', async () => {
    setItemSpy.mockRejectedValueOnce(new Error('primary unavailable'));
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('recovery unavailable'));

    await expect(startFamilyIntentOnboarding('adult-profile')).rejects.toThrow(
      'primary unavailable',
    );
  });

  it('keeps the last durable step when advancing SecureStore state fails', async () => {
    await startFamilyIntentOnboarding('adult-profile');
    setItemSpy.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      updateFamilyIntentOnboardingStep('login-choice'),
    ).rejects.toThrow('storage unavailable');
    await expect(readFamilyIntentOnboarding()).resolves.toEqual({
      version: 1,
      profileId: 'adult-profile',
      step: 'learner-target',
    });
  });

  it('clears the pending choice after a terminal branch', async () => {
    await clearFamilyIntentOnboarding();

    expect(deleteItemSpy).toHaveBeenCalledWith(FAMILY_INTENT_ONBOARDING_KEY);
    await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
  });

  it('keeps the durable state recoverable when SecureStore rejects clearing it', async () => {
    await startFamilyIntentOnboarding('adult-profile');
    deleteItemSpy.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(clearFamilyIntentOnboarding()).rejects.toThrow(
      'storage unavailable',
    );
    await expect(readFamilyIntentOnboarding()).resolves.toEqual({
      version: 1,
      profileId: 'adult-profile',
      step: 'learner-target',
    });
  });

  it('bounds a never-resolving primary write and resumes from the recovery journal', async () => {
    jest.useFakeTimers();
    setItemSpy.mockImplementationOnce(() => new Promise(() => undefined));

    try {
      const start = startFamilyIntentOnboarding('adult-profile');
      const resolution = expect(start).resolves.toBeUndefined();

      // The fallback must be durable while the primary is still hung, not
      // only after its timeout, because the profile POST already succeeded.
      await expect(
        AsyncStorage.getItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY),
      ).resolves.toContain('"profileId":"adult-profile"');
      await jest.advanceTimersByTimeAsync(2_500);

      await resolution;
    } finally {
      jest.useRealTimers();
    }
  });

  it('bounds a never-resolving clear so terminal actions can offer retry', async () => {
    await startFamilyIntentOnboarding('adult-profile');
    jest.useFakeTimers();
    deleteItemSpy.mockImplementationOnce(() => new Promise(() => undefined));

    const clear = clearFamilyIntentOnboarding();
    const rejection = expect(clear).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(2_500);

    await rejection;
    await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
    jest.useRealTimers();
  });

  it('does not recache a primary record while its timed-out delete later settles', async () => {
    await startFamilyIntentOnboarding('adult-profile');
    const serialized = JSON.stringify({
      version: 1,
      profileId: 'adult-profile',
      step: 'learner-target',
    });
    let resolveDelete: (() => void) | undefined;
    deleteItemSpy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    getItemSpy.mockResolvedValue(serialized);
    jest.useFakeTimers();

    try {
      const clear = clearFamilyIntentOnboarding();
      const rejection = expect(clear).rejects.toThrow('timed out');
      await jest.advanceTimersByTimeAsync(2_500);
      await rejection;

      await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
      resolveDelete?.();
      await Promise.resolve();
      getItemSpy.mockResolvedValue(null);
      await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes a recovery write that lands after terminal cleanup', async () => {
    const originalRecoveryWrite = jest
      .mocked(AsyncStorage.setItem)
      .getMockImplementation();
    let releaseRecoveryWrite: (() => void) | undefined;
    let recoveryWriteSettled: Promise<void> | undefined;
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce((key, value) => {
      recoveryWriteSettled = new Promise<void>((resolve) => {
        releaseRecoveryWrite = () => {
          void originalRecoveryWrite!(key, value).then(resolve);
        };
      });
      return recoveryWriteSettled;
    });

    await startFamilyIntentOnboarding('adult-profile');
    await clearFamilyIntentOnboarding();
    releaseRecoveryWrite?.();
    await recoveryWriteSettled;
    for (let flush = 0; flush < 5; flush += 1) {
      await Promise.resolve();
    }

    __resetFamilyIntentOnboardingForTests();
    await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
    await expect(
      AsyncStorage.getItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY),
    ).resolves.toBeNull();
  });

  it('removes a timed-out primary write that lands after terminal cleanup', async () => {
    let primaryRaw: string | null = null;
    let releasePrimaryWrite: (() => void) | undefined;
    let primaryWriteSettled: Promise<void> | undefined;
    setItemSpy.mockImplementationOnce((_key, value) => {
      primaryWriteSettled = new Promise<void>((resolve) => {
        releasePrimaryWrite = () => {
          primaryRaw = value;
          resolve();
        };
      });
      return primaryWriteSettled;
    });
    getItemSpy.mockImplementation(async () => primaryRaw);
    deleteItemSpy.mockImplementation(async () => {
      primaryRaw = null;
    });
    jest.useFakeTimers();

    try {
      const start = startFamilyIntentOnboarding('adult-profile');
      const resolution = expect(start).resolves.toBeUndefined();
      await jest.advanceTimersByTimeAsync(2_500);
      await resolution;
      await clearFamilyIntentOnboarding();

      releasePrimaryWrite?.();
      await primaryWriteSettled;
      for (let flush = 0; flush < 5; flush += 1) {
        await Promise.resolve();
      }

      __resetFamilyIntentOnboardingForTests();
      await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
      expect(primaryRaw).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects malformed or authorizing-shaped persisted records', async () => {
    getItemSpy.mockResolvedValue(
      JSON.stringify({
        version: 1,
        profileId: 'adult-profile',
        step: 'learner-target',
        supportershipId: 'must-not-be-carried',
      }),
    );
    __resetFamilyIntentOnboardingForTests();

    await expect(readFamilyIntentOnboarding()).resolves.toBeNull();
    expect(deleteItemSpy).toHaveBeenCalledWith(FAMILY_INTENT_ONBOARDING_KEY);
  });
});
