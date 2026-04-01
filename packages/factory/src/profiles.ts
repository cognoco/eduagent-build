import type { ProfileCreateInput } from '@eduagent/schemas';

let counter = 0;

export function buildProfile(
  overrides?: Partial<ProfileCreateInput>
): ProfileCreateInput {
  counter++;
  return {
    displayName: `Test User ${counter}`,
    personaType: 'LEARNER',
    birthDate: '2008-06-15',
    ...overrides,
  };
}

export function buildProfileList(
  count: number,
  overrides?: Partial<ProfileCreateInput>
): ProfileCreateInput[] {
  return Array.from({ length: count }, () => buildProfile(overrides));
}

/** Reset the internal counter — useful in test `beforeEach` blocks. */
export function resetProfileCounter(): void {
  counter = 0;
}
