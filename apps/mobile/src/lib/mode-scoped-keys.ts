import { PROFILE_SCOPED_KEYS } from './profile';

export const MODE_SCOPED_KEYS = [
  'progress',
  'dashboard',
  'session',
  'session-transcript',
  'session-summary',
  'parking-lot',
] as const;

const PROFILE_SCOPED_KEY_SET = new Set<string>(PROFILE_SCOPED_KEYS);

export function isProfileScopedModeKey(key: string): boolean {
  return PROFILE_SCOPED_KEY_SET.has(key);
}
