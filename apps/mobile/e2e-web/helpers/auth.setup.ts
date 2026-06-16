import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { authScenarios } from '../fixtures/scenarios';
import { signIn } from './auth';
import { ensureFamilyHome } from './app-screen';
import { authStateDir } from './runtime';
import { seedScenario } from './test-seed';

setup.describe.configure({ mode: 'serial' });

setup.beforeAll(async () => {
  try {
    await mkdir(authStateDir, { recursive: true });
  } catch (err) {
    throw new Error(
      `Failed to create auth state directory at "${authStateDir}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
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

      await signIn(page, {
        email: seeded.email,
        password: seeded.password,
        landingTestId: scenario.landingTestId,
        alternateLandingTestIds:
          'alternateLandingTestIds' in scenario
            ? scenario.alternateLandingTestIds
            : undefined,
        landingPath: scenario.landingPath,
      });

      if (
        'persistAppContext' in scenario &&
        scenario.persistAppContext === 'family'
      ) {
        await ensureFamilyHome(page, { timeout: 90_000, screenRetries: 5 });
      }

      await page.context().storageState({ path: scenario.storageStatePath });
    },
  );
}
