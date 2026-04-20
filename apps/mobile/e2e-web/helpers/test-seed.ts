import { apiBaseUrl, buildTestSeedHeaders, seedEmailPrefix } from './runtime';

export interface SeedResponse {
  scenario: string;
  accountId: string;
  profileId: string;
  email: string;
  password: string;
  ids: Record<string, string>;
}

export interface ResetResponse {
  message: string;
  deletedCount: number;
  clerkUsersDeleted: number;
}

async function readJsonOrThrow<T>(
  response: Response,
  action: string
): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${action} failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as T;
}

export async function seedScenario(input: {
  scenario: string;
  email: string;
}): Promise<SeedResponse> {
  const response = await fetch(`${apiBaseUrl}/v1/__test/seed`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildTestSeedHeaders(),
    },
    body: JSON.stringify(input),
  });

  return readJsonOrThrow<SeedResponse>(response, `Seeding ${input.scenario}`);
}

export async function resetSeededAccounts(
  prefix = seedEmailPrefix
): Promise<ResetResponse> {
  const url = new URL(`${apiBaseUrl}/v1/__test/reset`);
  if (prefix) {
    url.searchParams.set('prefix', prefix);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: buildTestSeedHeaders(),
  });

  return readJsonOrThrow<ResetResponse>(response, 'Resetting seeded accounts');
}
