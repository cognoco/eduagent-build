import type {
  FamilyJoinJourneyResult,
  FamilyJoinSupportershipDecision,
} from '@eduagent/schemas';
import { Platform } from 'react-native';
import * as SecureStore from './secure-storage';

export const FAMILY_JOIN_JOURNEY_KEY = 'mentomate.family_join_journey_v1';

export type FamilyJoinContinuation = {
  version: 1;
  role: 'learner' | 'guardian';
  token: string;
  supportershipDecision: FamilyJoinSupportershipDecision;
  lastStatus: Extract<
    FamilyJoinJourneyResult['status'],
    'awaiting_guardian' | 'ready_to_join'
  >;
};

function parseContinuation(raw: string): FamilyJoinContinuation | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      Object.keys(value).sort().join(',') !==
        'lastStatus,role,supportershipDecision,token,version' ||
      value.version !== 1 ||
      (value.role !== 'learner' && value.role !== 'guardian') ||
      typeof value.token !== 'string' ||
      value.token.trim().length === 0 ||
      (value.supportershipDecision !== 'accept' &&
        value.supportershipDecision !== 'decline') ||
      (value.lastStatus !== 'awaiting_guardian' &&
        value.lastStatus !== 'ready_to_join')
    ) {
      return null;
    }
    return value as FamilyJoinContinuation;
  } catch {
    return null;
  }
}

export async function readFamilyJoinContinuation(): Promise<FamilyJoinContinuation | null> {
  if (Platform.OS === 'web') {
    // The code is a bearer-style continuation locator. The shared storage
    // wrapper falls back to plaintext localStorage on web, so never retain it
    // there—even if an older build already wrote this key.
    await SecureStore.deleteItemAsync(FAMILY_JOIN_JOURNEY_KEY);
    return null;
  }
  const raw = await SecureStore.getItemAsync(FAMILY_JOIN_JOURNEY_KEY);
  if (!raw) return null;
  const parsed = parseContinuation(raw);
  if (parsed) return parsed;
  await SecureStore.deleteItemAsync(FAMILY_JOIN_JOURNEY_KEY);
  return null;
}

export async function saveFamilyJoinContinuation(
  continuation: FamilyJoinContinuation,
): Promise<void> {
  if (Platform.OS === 'web') {
    await SecureStore.deleteItemAsync(FAMILY_JOIN_JOURNEY_KEY);
    return;
  }
  await SecureStore.setItemAsync(
    FAMILY_JOIN_JOURNEY_KEY,
    JSON.stringify(continuation),
  );
}

export async function clearFamilyJoinContinuation(): Promise<void> {
  await SecureStore.deleteItemAsync(FAMILY_JOIN_JOURNEY_KEY);
}
