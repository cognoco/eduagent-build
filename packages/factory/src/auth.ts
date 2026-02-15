import type { RegisterInput } from '@eduagent/schemas';

let counter = 0;

export function buildRegisterInput(
  overrides?: Partial<RegisterInput>
): RegisterInput {
  counter++;
  return {
    email: `test${counter}@example.com`,
    password: 'TestPassword123!',
    ...overrides,
  };
}

/** Reset the internal counter — useful in test `beforeEach` blocks. */
export function resetAuthCounter(): void {
  counter = 0;
}
