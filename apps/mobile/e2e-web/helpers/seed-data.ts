import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { authStateDir } from './runtime';
import type { SeedResponse } from './test-seed';

/**
 * Read the persisted seed response for a given scenario key.
 * Written during auth.setup.ts, read during journey tests to get profile IDs.
 */
export async function readSeedData(scenarioKey: string): Promise<SeedResponse> {
  const filePath = path.join(authStateDir, `${scenarioKey}-seed.json`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    throw new Error(
      `Seed data not found for scenario "${scenarioKey}" at "${filePath}" — did auth setup run?`
    );
  }
  return JSON.parse(raw) as SeedResponse;
}
