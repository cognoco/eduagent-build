import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
      const seedDataPath = path.join(authStateDir, `${scenario.key}-seed.json`);

      await mkdir(path.dirname(seedDataPath), { recursive: true });

      // Persist seed IDs so journey tests can reference profile IDs, etc.
      await writeFile(seedDataPath, JSON.stringify(seeded, null, 2));

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
