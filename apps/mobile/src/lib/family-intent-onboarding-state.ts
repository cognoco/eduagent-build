import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from './secure-storage';

export const FAMILY_INTENT_ONBOARDING_KEY =
  'mentomate_family_intent_onboarding_v1';
export const FAMILY_INTENT_ONBOARDING_RECOVERY_KEY =
  'mentomate.family_intent_onboarding_recovery_v1';

const STORAGE_OPERATION_TIMEOUT_MS = 2_500;

class FamilyIntentStorageTimeoutError extends Error {
  constructor(name: string) {
    super(`Family-intent storage ${name} timed out.`);
    this.name = 'FamilyIntentStorageTimeoutError';
  }
}

export type FamilyIntentOnboardingStep =
  | 'learner-target'
  | 'login-choice'
  | 'managed-unavailable'
  | 'opening-invitation';

export type FamilyIntentOnboardingState = {
  version: 1;
  profileId: string;
  step: FamilyIntentOnboardingStep;
};

let memoryState: FamilyIntentOnboardingState | null = null;
let recoveryGeneration = 0;
let desiredRecoverySerialized: string | null = null;
let recoveryRepairQueue: Promise<void> = Promise.resolve();
let primaryGeneration = 0;
let desiredPrimarySerialized: string | null = null;
let primaryRepairQueue: Promise<void> = Promise.resolve();
type ClearAttempt = {
  previousMemory: FamilyIntentOnboardingState | null;
  restoreAllowed: boolean;
};
let activeClearAttempt: ClearAttempt | null = null;

function markDesiredRecovery(serialized: string | null): number {
  recoveryGeneration += 1;
  desiredRecoverySerialized = serialized;
  return recoveryGeneration;
}

function scheduleRecoveryRepair(): void {
  const repair = recoveryRepairQueue.then(async () => {
    while (true) {
      const generation = recoveryGeneration;
      const desired = desiredRecoverySerialized;
      if (desired === null) {
        await AsyncStorage.removeItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY);
      } else {
        await AsyncStorage.setItem(
          FAMILY_INTENT_ONBOARDING_RECOVERY_KEY,
          desired,
        );
      }
      if (generation === recoveryGeneration) return;
    }
  });
  recoveryRepairQueue = repair.catch(() => undefined);
}

function trackRecoveryMutation<T>(
  operation: Promise<T>,
  generation: number,
): Promise<T> {
  void operation.then(
    () => {
      if (generation !== recoveryGeneration) {
        scheduleRecoveryRepair();
      }
    },
    () => undefined,
  );
  return operation;
}

function markDesiredPrimary(serialized: string | null): number {
  primaryGeneration += 1;
  desiredPrimarySerialized = serialized;
  return primaryGeneration;
}

function schedulePrimaryRepair(): void {
  const repair = primaryRepairQueue.then(async () => {
    while (true) {
      const generation = primaryGeneration;
      const desired = desiredPrimarySerialized;
      if (desired === null) {
        await SecureStore.deleteItemAsync(FAMILY_INTENT_ONBOARDING_KEY);
      } else {
        await SecureStore.setItemAsync(FAMILY_INTENT_ONBOARDING_KEY, desired);
      }
      if (generation === primaryGeneration) return;
    }
  });
  primaryRepairQueue = repair.catch(() => undefined);
}

function trackPrimaryMutation<T>(
  operation: Promise<T>,
  generation: number,
): Promise<T> {
  void operation.then(
    () => {
      if (generation !== primaryGeneration) {
        schedulePrimaryRepair();
      }
    },
    () => undefined,
  );
  return operation;
}

function withStorageTimeout<T>(
  operation: Promise<T>,
  name: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new FamilyIntentStorageTimeoutError(name));
    }, STORAGE_OPERATION_TIMEOUT_MS);

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function isStep(value: unknown): value is FamilyIntentOnboardingStep {
  return (
    value === 'learner-target' ||
    value === 'login-choice' ||
    value === 'managed-unavailable' ||
    value === 'opening-invitation'
  );
}

function parseState(raw: string): FamilyIntentOnboardingState | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      Object.keys(value).sort().join(',') !== 'profileId,step,version' ||
      value.version !== 1 ||
      typeof value.profileId !== 'string' ||
      value.profileId.length === 0 ||
      !isStep(value.step)
    ) {
      return null;
    }
    return {
      version: 1,
      profileId: value.profileId,
      step: value.step,
    };
  } catch {
    return null;
  }
}

async function persist(
  state: FamilyIntentOnboardingState,
  allowRecoveryOnly: boolean,
): Promise<void> {
  const serialized = JSON.stringify(state);

  if (allowRecoveryOnly) {
    // Launch both writes immediately. The profile POST has already succeeded,
    // so the recovery journal must not wait behind a hung SecureStore call.
    // Convert both outcomes to values up front so an early fallback rejection
    // cannot become unhandled while the primary is still pending.
    const previousRecoveryDesired = desiredRecoverySerialized;
    const previousPrimaryDesired = desiredPrimarySerialized;
    const recoveryWriteGeneration = markDesiredRecovery(serialized);
    const primaryWriteGeneration = markDesiredPrimary(serialized);
    const recoveryWrite = trackRecoveryMutation(
      AsyncStorage.setItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY, serialized),
      recoveryWriteGeneration,
    );
    const recoveryResult = withStorageTimeout(
      recoveryWrite,
      'recovery write',
    ).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    const primaryWrite = trackPrimaryMutation(
      SecureStore.setItemAsync(FAMILY_INTENT_ONBOARDING_KEY, serialized),
      primaryWriteGeneration,
    );
    const primaryResult = withStorageTimeout(
      primaryWrite,
      'primary write',
    ).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    const primary = await primaryResult;
    if (primary.ok) {
      if (
        primaryWriteGeneration !== primaryGeneration ||
        recoveryWriteGeneration !== recoveryGeneration
      ) {
        throw new Error('Family-intent storage write was superseded.');
      }
      commitMemoryState(state);
      return;
    }

    const recovery = await recoveryResult;
    if (recovery.ok) {
      if (
        primaryWriteGeneration !== primaryGeneration ||
        recoveryWriteGeneration !== recoveryGeneration
      ) {
        throw new Error('Family-intent storage write was superseded.');
      }
      commitMemoryState(state);
      return;
    }
    if (primaryWriteGeneration === primaryGeneration) {
      markDesiredPrimary(previousPrimaryDesired);
      schedulePrimaryRepair();
    }
    if (recoveryWriteGeneration === recoveryGeneration) {
      markDesiredRecovery(previousRecoveryDesired);
      scheduleRecoveryRepair();
    }
    throw primary.error;
  }

  const previousPrimaryDesired = desiredPrimarySerialized;
  const primaryWriteGeneration = markDesiredPrimary(serialized);
  try {
    await withStorageTimeout(
      trackPrimaryMutation(
        SecureStore.setItemAsync(FAMILY_INTENT_ONBOARDING_KEY, serialized),
        primaryWriteGeneration,
      ),
      'primary write',
    );
  } catch (error) {
    if (primaryWriteGeneration === primaryGeneration) {
      markDesiredPrimary(previousPrimaryDesired);
      schedulePrimaryRepair();
    }
    throw error;
  }
  if (primaryWriteGeneration !== primaryGeneration) {
    throw new Error('Family-intent storage write was superseded.');
  }
  commitMemoryState(state);
  const recoveryWriteGeneration = markDesiredRecovery(serialized);

  // Updates remain primary-authoritative. Mirror the step for post-create
  // recovery when possible, but never fail a successful primary transition.
  try {
    await withStorageTimeout(
      trackRecoveryMutation(
        AsyncStorage.setItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY, serialized),
        recoveryWriteGeneration,
      ),
      'recovery write',
    );
  } catch {
    // Best-effort mirror only; the primary write already succeeded.
  }
}

function commitMemoryState(state: FamilyIntentOnboardingState): void {
  if (activeClearAttempt) {
    activeClearAttempt.restoreAllowed = false;
    activeClearAttempt = null;
  }
  memoryState = state;
}

export async function startFamilyIntentOnboarding(
  profileId: string,
): Promise<void> {
  await persist({ version: 1, profileId, step: 'learner-target' }, true);
}

export async function readFamilyIntentOnboarding(): Promise<FamilyIntentOnboardingState | null> {
  if (activeClearAttempt) return null;
  if (memoryState) return memoryState;

  const primaryGenerationAtStart = primaryGeneration;
  const recoveryGenerationAtStart = recoveryGeneration;
  const primaryRaw = await withStorageTimeout(
    SecureStore.getItemAsync(FAMILY_INTENT_ONBOARDING_KEY),
    'primary read',
  );
  const raw =
    primaryRaw ??
    (await withStorageTimeout(
      AsyncStorage.getItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY),
      'recovery read',
    ));
  if (activeClearAttempt) return null;
  if (
    primaryGenerationAtStart !== primaryGeneration ||
    recoveryGenerationAtStart !== recoveryGeneration
  ) {
    return null;
  }
  if (!raw) return null;

  const parsed = parseState(raw);
  if (!parsed) {
    const recoveryCleanupGeneration = markDesiredRecovery(null);
    const primaryCleanupGeneration = markDesiredPrimary(null);
    await withStorageTimeout(
      trackRecoveryMutation(
        AsyncStorage.removeItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY),
        recoveryCleanupGeneration,
      ),
      'recovery cleanup',
    );
    await withStorageTimeout(
      trackPrimaryMutation(
        SecureStore.deleteItemAsync(FAMILY_INTENT_ONBOARDING_KEY),
        primaryCleanupGeneration,
      ),
      'primary cleanup',
    );
    return null;
  }
  const parsedSerialized = JSON.stringify(parsed);
  markDesiredPrimary(parsedSerialized);
  if (primaryRaw === null) {
    schedulePrimaryRepair();
  }
  markDesiredRecovery(parsedSerialized);
  memoryState = parsed;
  return parsed;
}

export async function updateFamilyIntentOnboardingStep(
  step: FamilyIntentOnboardingStep,
): Promise<void> {
  const current = await readFamilyIntentOnboarding();
  if (!current) return;
  await persist({ ...current, step }, false);
}

export async function clearFamilyIntentOnboarding(): Promise<void> {
  // Clear the fallback first. If it rejects or stalls, memory stays intact and
  // the primary record remains available for retry.
  const previousDesired = desiredRecoverySerialized;
  const recoveryClearGeneration = markDesiredRecovery(null);
  try {
    await withStorageTimeout(
      trackRecoveryMutation(
        AsyncStorage.removeItem(FAMILY_INTENT_ONBOARDING_RECOVERY_KEY),
        recoveryClearGeneration,
      ),
      'recovery clear',
    );
  } catch (error) {
    if (recoveryClearGeneration === recoveryGeneration) {
      markDesiredRecovery(previousDesired);
      scheduleRecoveryRepair();
    }
    throw error;
  }
  const attempt: ClearAttempt = {
    previousMemory: memoryState,
    restoreAllowed: true,
  };
  const previousPrimaryDesired = desiredPrimarySerialized;
  const primaryClearGeneration = markDesiredPrimary(null);
  const primaryDelete = trackPrimaryMutation(
    SecureStore.deleteItemAsync(FAMILY_INTENT_ONBOARDING_KEY),
    primaryClearGeneration,
  );
  activeClearAttempt = attempt;
  memoryState = null;
  void primaryDelete.then(
    () => {
      if (activeClearAttempt !== attempt) return;
      activeClearAttempt = null;
      memoryState = null;
    },
    () => {
      if (primaryClearGeneration === primaryGeneration) {
        markDesiredPrimary(previousPrimaryDesired);
        schedulePrimaryRepair();
      }
      if (activeClearAttempt !== attempt) return;
      activeClearAttempt = null;
      if (attempt.restoreAllowed) {
        memoryState = attempt.previousMemory;
      }
    },
  );
  await withStorageTimeout(primaryDelete, 'primary clear');
  memoryState = null;
}

export function discardFamilyIntentOnboardingMemory(): void {
  memoryState = null;
  markDesiredPrimary(null);
  schedulePrimaryRepair();
  markDesiredRecovery(null);
  scheduleRecoveryRepair();
  if (activeClearAttempt) {
    activeClearAttempt.restoreAllowed = false;
  }
}

export function __resetFamilyIntentOnboardingForTests(): void {
  memoryState = null;
  activeClearAttempt = null;
  recoveryGeneration += 1;
  desiredRecoverySerialized = null;
  recoveryRepairQueue = Promise.resolve();
  primaryGeneration += 1;
  desiredPrimarySerialized = null;
  primaryRepairQueue = Promise.resolve();
}
