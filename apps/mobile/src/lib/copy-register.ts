import type { ActiveProfileRole } from '../hooks/use-active-profile-role';

export type CopyRegister = 'adult' | 'child';

export function copyRegisterFor(role: ActiveProfileRole | null): CopyRegister {
  return role === 'child' ? 'child' : 'adult';
}
