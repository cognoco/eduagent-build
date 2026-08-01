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
});
