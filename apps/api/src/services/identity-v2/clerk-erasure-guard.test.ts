import * as deletionV2 from './deletion-v2';

describe('Clerk erasure digest fence', () => {
  it('[WI-2788] derives a stable one-way digest without retaining the raw Clerk id', () => {
    const clerkErasureDigest = (
      deletionV2 as unknown as {
        clerkErasureDigest?: (clerkUserId: string) => string;
      }
    ).clerkErasureDigest;

    expect(clerkErasureDigest).toBeDefined();
    if (!clerkErasureDigest) return;

    const rawId = 'clerk_sensitive_identity';
    const digest = clerkErasureDigest(rawId);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(rawId);
    expect(clerkErasureDigest(rawId)).toBe(digest);
    expect(clerkErasureDigest('clerk_other_identity')).not.toBe(digest);
  });

  it('[WI-2788] reports the number of expired fences removed by the durable cleanup', async () => {
    const returning = jest
      .fn()
      .mockResolvedValue([
        { digest: 'a'.repeat(64) },
        { digest: 'b'.repeat(64) },
      ]);
    const where = jest.fn().mockReturnValue({ returning });
    const deleteFn = jest.fn().mockReturnValue({ where });

    await expect(
      deletionV2.deleteExpiredClerkErasureFences({
        delete: deleteFn,
      } as never),
    ).resolves.toBe(2);
    expect(where).toHaveBeenCalledTimes(1);
    expect(returning).toHaveBeenCalledTimes(1);
  });
});
