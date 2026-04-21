import { rm } from 'node:fs/promises';
import { authStateDir } from './runtime';
import { resetSeededAccounts } from './test-seed';

async function globalTeardown(): Promise<void> {
  try {
    await resetSeededAccounts();
  } catch (error) {
    console.error('[global-teardown] resetSeededAccounts failed:', error);
  }
  await rm(authStateDir, { recursive: true, force: true });
}

export default globalTeardown;
