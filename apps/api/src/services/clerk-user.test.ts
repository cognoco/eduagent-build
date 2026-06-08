import {
  clearVerifiedClerkEmailCacheForTest,
  deleteClerkUser,
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

// ---------------------------------------------------------------------------
// [R1][BREAK] Right-to-erasure: deleteClerkUser must actually call the Clerk
// Backend API to delete the login identity. Before this function existed,
// account deletion left the Clerk user (email/credentials/OAuth) alive — a
// GDPR Art 17 erasure gap. Red→green: revert deleteClerkUser and these fail.
//
// Clerk is a true external boundary, so we inject a fake fetch rather than
// mocking internal code. The fetch fake is the boundary under control.
// ---------------------------------------------------------------------------
describe('deleteClerkUser', () => {
  it('[BREAK] issues DELETE /v1/users/{id} with the secret-key bearer token', async () => {
    const fetchImpl = jest.fn(async () => {
      return new Response(JSON.stringify({ deleted: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await deleteClerkUser({
      userId: 'user_to_erase',
      clerkSecretKey: 'sk_test_123',
      fetchImpl,
    });

    expect(result).toEqual({ deleted: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.clerk.com/v1/users/user_to_erase',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer sk_test_123' },
      },
    );
  });

  it('treats a 404 as an idempotent already-absent success (retry-safe)', async () => {
    const fetchImpl = jest.fn(async () => {
      return new Response(JSON.stringify({ errors: [] }), { status: 404 });
    }) as unknown as typeof fetch;

    const result = await deleteClerkUser({
      userId: 'user_already_gone',
      clerkSecretKey: 'sk_test_123',
      fetchImpl,
    });

    expect(result).toEqual({ deleted: false, reason: 'already-absent' });
  });

  it('throws on a non-404 HTTP error so Inngest retries (never silent)', async () => {
    const fetchImpl = jest.fn(async () => {
      return new Response('server error', { status: 500 });
    }) as unknown as typeof fetch;

    await expect(
      deleteClerkUser({
        userId: 'user_500',
        clerkSecretKey: 'sk_test_123',
        fetchImpl,
      }),
    ).rejects.toThrow(/status 500/);
  });

  it('throws on a network error so the step is retried, not skipped', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('connection reset');
    }) as unknown as typeof fetch;

    await expect(
      deleteClerkUser({
        userId: 'user_netfail',
        clerkSecretKey: 'sk_test_123',
        fetchImpl,
      }),
    ).rejects.toThrow(/connection reset/);
  });

  it('throws when the secret key is missing rather than silently skipping erasure', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;

    await expect(
      deleteClerkUser({
        userId: 'user_no_secret',
        clerkSecretKey: undefined,
        fetchImpl,
      }),
    ).rejects.toThrow(/CLERK_SECRET_KEY unavailable/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
