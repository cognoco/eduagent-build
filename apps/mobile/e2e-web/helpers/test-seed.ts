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

// [BUG-532] Retry config for Cloudflare rate-limit resilience.
// Cloudflare WAF returns 403 (not 429) when rate-limiting seed requests
// during parallel Playwright workers.
const RETRY_MAX_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUSES = new Set([403, 429, 502, 503]);

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff for rate-limited requests.
 * Checks response.status BEFORE consuming the body (single-use stream).
 */
async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  action: string
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    const response = await fetch(input, init);
    if (response.ok || !RETRYABLE_STATUSES.has(response.status)) {
      return response;
    }
    // Consume the body so the connection is released, but don't throw yet.
    const detail = await response.text().catch(() => '');
    lastError = new Error(`${action} failed (${response.status}): ${detail}`);
    if (attempt < RETRY_MAX_ATTEMPTS - 1) {
      // Exponential backoff with ±20% jitter
      const base = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      const jitter = base * (0.8 + Math.random() * 0.4);
      await sleep(jitter);
    }
  }
  throw lastError!;
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
  const response = await fetchWithRetry(
    `${apiBaseUrl}/v1/__test/seed`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildTestSeedHeaders(),
      },
      body: JSON.stringify(input),
    },
    `Seeding ${input.scenario}`
  );

  return readJsonOrThrow<SeedResponse>(response, `Seeding ${input.scenario}`);
}

export async function resetSeededAccounts(
  prefix = seedEmailPrefix
): Promise<ResetResponse> {
  const url = new URL(`${apiBaseUrl}/v1/__test/reset`);
  if (prefix) {
    url.searchParams.set('prefix', prefix);
  }

  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: buildTestSeedHeaders(),
    },
    'Resetting seeded accounts'
  );

  return readJsonOrThrow<ResetResponse>(response, 'Resetting seeded accounts');
}
