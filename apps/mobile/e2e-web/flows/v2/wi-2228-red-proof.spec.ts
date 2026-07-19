import { expect, test } from '@playwright/test';

test('WI-2228 intentional v2-release hard-gate proof', () => {
  expect(
    false,
    'WI-2228 intentional assertion: remove this fixture before landing',
  ).toBe(true);
});
