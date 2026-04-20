import { rm } from 'node:fs/promises';
import { authStateDir } from './runtime';
import { resetSeededAccounts } from './test-seed';

async function globalTeardown(): Promise<void> {
  await resetSeededAccounts();
  await rm(authStateDir, { recursive: true, force: true });
}

export default globalTeardown;
