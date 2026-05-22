import { apiBaseUrl, buildTestSeedHeaders, seedEmailPrefix } from './runtime';

const CLERK_API_BASE = 'https://api.clerk.com/v1';

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
// Cloudflare WAF can return 403 or 429 when rate-limiting seed requests
// during parallel Playwright workers.
const RETRY_MAX_ATTEMPTS = 6;
const RETRY_BASE_DELAY_MS = 1_500;
const RETRYABLE_STATUSES = new Set([403, 429, 502, 503]);
const CLERK_LOOKUP_MAX_ATTEMPTS = 10;
const CLERK_LOOKUP_DELAY_MS = 750;

interface ClerkUser {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id?: string;
    email_address?: string;
  }>;
}

type ClerkUserLookupResponse = ClerkUser[] | { data?: ClerkUser[] };

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
  action: string,
): Promise<Response> {
  // Initialised to a generic Error so the post-loop throw is always typed —
  // overwritten on every retryable failure with the actual status + body.
  let lastError = new Error(`${action} failed: no attempts made`);
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
  throw lastError;
}

async function readJsonOrThrow<T>(
  response: Response,
  action: string,
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
    `Seeding ${input.scenario}`,
  );

  const seeded = await readJsonOrThrow<SeedResponse>(
    response,
    `Seeding ${input.scenario}`,
  );
  await verifySeededClerkEmail(seeded.email);
  return seeded;
}

export async function resetSeededAccounts(
  prefix = seedEmailPrefix,
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
    'Resetting seeded accounts',
  );

  return readJsonOrThrow<ResetResponse>(response, 'Resetting seeded accounts');
}

async function verifySeededClerkEmail(email: string): Promise<void> {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) return;

  const emailAddressId = await findSeededClerkEmailAddressId(
    email,
    clerkSecretKey,
  );

  if (!emailAddressId) {
    throw new Error(
      `Could not find Clerk email address for seed user ${email}`,
    );
  }

  const verifyResponse = await fetchWithRetry(
    `${CLERK_API_BASE}/email_addresses/${encodeURIComponent(emailAddressId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ verified: true, primary: true }),
    },
    `Verifying Clerk seed email ${email}`,
  );

  if (!verifyResponse.ok) {
    const detail = await verifyResponse.text().catch(() => '');
    throw new Error(
      `Verifying Clerk seed email ${email} failed (${verifyResponse.status}): ${detail}`,
    );
  }
}

async function findSeededClerkEmailAddressId(
  email: string,
  clerkSecretKey: string,
): Promise<string | null> {
  const params = new URLSearchParams({ email_address: email });

  for (let attempt = 0; attempt < CLERK_LOOKUP_MAX_ATTEMPTS; attempt++) {
    const lookupResponse = await fetchWithRetry(
      `${CLERK_API_BASE}/users?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      },
      `Looking up Clerk seed user ${email}`,
    );
    const lookup = await readJsonOrThrow<ClerkUserLookupResponse>(
      lookupResponse,
      `Looking up Clerk seed user ${email}`,
    );
    const users = Array.isArray(lookup) ? lookup : (lookup.data ?? []);
    const user = users[0];
    const emailAddress =
      user?.email_addresses?.find(
        (address) =>
          address.email_address?.toLowerCase() === email.toLowerCase(),
      ) ?? null;
    const emailAddressId = emailAddress?.id ?? user?.primary_email_address_id;

    if (emailAddressId) {
      return emailAddressId;
    }

    if (attempt < CLERK_LOOKUP_MAX_ATTEMPTS - 1) {
      await sleep(CLERK_LOOKUP_DELAY_MS);
    }
  }

  return null;
}
