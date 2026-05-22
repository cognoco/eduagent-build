import {
  clearVerifiedClerkEmailCacheForTest,
  resolveVerifiedClerkEmail,
} from './clerk-user';

function clerkUserPayload({
  primaryStatus = 'verified',
  secondaryStatus = 'verified',
}: {
  primaryStatus?: string;
  secondaryStatus?: string;
} = {}) {
  return {
    primary_email_address_id: 'email_primary',
    email_addresses: [
      {
        id: 'email_secondary',
        email_address: 'secondary@example.com',
        verification: { status: secondaryStatus },
      },
      {
        id: 'email_primary',
        email_address: 'primary@example.com',
        verification: { status: primaryStatus },
      },
    ],
  };
}

function mockJsonFetch(payload: unknown, status = 200): typeof fetch {
  return jest.fn(async () => {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('resolveVerifiedClerkEmail', () => {
  beforeEach(() => {
    clearVerifiedClerkEmailCacheForTest();
  });

  it('uses the signed JWT fast path when email_verified is true', async () => {
    const fetchImpl = mockJsonFetch(clerkUserPayload());

    const result = await resolveVerifiedClerkEmail({
      userId: 'user_123',
      tokenEmail: 'jwt@example.com',
      tokenEmailVerified: true,
      clerkSecretKey: 'sk_test_123',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      email: 'jwt@example.com',
      source: 'jwt',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('[BREAK][BUG-1016] falls back to Clerk backend when the token omits email_verified', async () => {
    const fetchImpl = mockJsonFetch(clerkUserPayload());

    const result = await resolveVerifiedClerkEmail({
      userId: 'user_missing_claim',
      tokenEmail: 'jwt@example.com',
      tokenEmailVerified: undefined,
      clerkSecretKey: 'sk_test_123',
      fetchImpl,
    });

    expect(result).toEqual({
      ok: true,
      email: 'primary@example.com',
      source: 'clerk-api',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user_missing_claim',
      {
        headers: { Authorization: 'Bearer sk_test_123' },
      },
    );
  });

  it('caches positive Clerk backend lookups for the same user', async () => {
    const fetchImpl = mockJsonFetch(clerkUserPayload());

    await expect(
      resolveVerifiedClerkEmail({
        userId: 'user_cached',
        tokenEmail: 'jwt@example.com',
        tokenEmailVerified: false,
        clerkSecretKey: 'sk_test_123',
        fetchImpl,
      }),
    ).resolves.toMatchObject({ ok: true, source: 'clerk-api' });

    await expect(
      resolveVerifiedClerkEmail({
        userId: 'user_cached',
        tokenEmail: 'jwt@example.com',
        tokenEmailVerified: false,
        clerkSecretKey: 'sk_test_123',
        fetchImpl,
      }),
    ).resolves.toMatchObject({ ok: true, source: 'clerk-api-cache' });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects when neither JWT nor Clerk backend attest a verified primary email', async () => {
    const fetchImpl = mockJsonFetch(
      clerkUserPayload({ primaryStatus: 'unverified' }),
    );

    const result = await resolveVerifiedClerkEmail({
      userId: 'user_unverified',
      tokenEmail: 'jwt@example.com',
      tokenEmailVerified: false,
      clerkSecretKey: 'sk_test_123',
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'email-not-verified',
    });
  });

  it('fails closed when the Clerk backend lookup is unavailable', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await resolveVerifiedClerkEmail({
      userId: 'user_lookup_down',
      tokenEmail: 'jwt@example.com',
      tokenEmailVerified: false,
      clerkSecretKey: 'sk_test_123',
      fetchImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'lookup-unavailable',
    });
  });
});
