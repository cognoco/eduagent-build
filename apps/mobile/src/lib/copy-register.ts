import { computeAgeBracket } from '@eduagent/schemas';
import type { ActiveProfileRole } from '../hooks/use-active-profile-role';

export type CopyRegister = 'adult' | 'teen' | 'child';

// When birthYear is known, the age bracket is the canonical signal — a
// 14-year-old child on a parent account and a 14-year-old solo owner should
// both read teen-flavored copy. The role-only fallback exists so legacy
// callers that haven't been updated yet keep their previous behavior.
export function copyRegisterFor(
  role: ActiveProfileRole | null,
  birthYear?: number | null,
): CopyRegister {
  if (birthYear != null) {
    const bracket = computeAgeBracket(birthYear);
    if (bracket === 'child') return 'child';
    if (bracket === 'adolescent') return 'teen';
    return 'adult';
  }
  return role === 'child' ? 'child' : 'adult';
}
