import { mkdir } from 'node:fs/promises';
import { test as setup } from '@playwright/test';
import { authScenarios } from '../fixtures/scenarios';
import { signInAndPersistStorageState } from './auth';
import { authStateDir } from './runtime';
import { seedScenario } from './test-seed';

setup.describe.configure({ mode: 'serial' });

setup.beforeAll(async () => {
  await mkdir(authStateDir, { recursive: true });
});

for (const scenario of Object.values(authScenarios)) {
  setup(
    `seed ${scenario.seedScenario} and capture ${scenario.key} storage state`,
    async ({ page }) => {
      const seeded = await seedScenario({
        scenario: scenario.seedScenario,
        email: scenario.email,
      });

      await signInAndPersistStorageState(page, {
        email: seeded.email,
        password: seeded.password,
        storageStatePath: scenario.storageStatePath,
        landingTestId: scenario.landingTestId,
        landingPath: scenario.landingPath,
      });
    }
  );
}
