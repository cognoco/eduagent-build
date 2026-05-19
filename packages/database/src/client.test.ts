import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  __internal_neonPoolCache,
  __internal_neonPoolCacheKey,
  createDatabase,
} from './client.js';

// [BUG-702 / P-6] Regression guard for the silent neon-http transaction
// fallback that the original P-6 audit flagged. The fallback used to wrap
// db.transaction() in a try/catch that, on failure, ran the callback against
// the un-tx'd handle while only emitting a console.warn — silently dropping
// atomicity. This made transactional invariants (advisory locks, FOR UPDATE,
// SELECT-then-INSERT guards) into no-ops in production.
//
// Phase 0.0 of the RLS prep plan removed the fallback by switching the
// production driver from neon-http to neon-serverless (and node-postgres for
// non-Neon URLs), both of which support real ACID transactions. There is no
// longer a silent path — if db.transaction throws, the error propagates.
//
// This file is a structural regression guard: it asserts the source of
// client.ts contains neither the silent-warn pattern nor an import of
// neon-http. If a future refactor reintroduces either, this test fails.

describe('database/client.ts — silent transaction fallback regression guard', () => {
  const clientSource = readFileSync(resolve(__dirname, 'client.ts'), 'utf-8');

  it('does not import drizzle-orm/neon-http (fallback driver was removed)', () => {
    expect(clientSource).not.toMatch(/from\s+['"]drizzle-orm\/neon-http['"]/);
    expect(clientSource).not.toMatch(
      /from\s+['"]@neondatabase\/serverless['"]\s*;.*neon\(/s,
    );
  });

  it('does not contain a console.warn-on-transaction-fail fallback', () => {
    // The historical pattern was: catch a transaction error, console.warn,
    // then run the callback against the un-transactional handle. Any
    // console.warn near a transaction reference is suspicious.
    expect(clientSource).not.toMatch(/console\.warn[\s\S]{0,200}transaction/i);
    expect(clientSource).not.toMatch(/transaction[\s\S]{0,200}console\.warn/i);
  });

  it('uses ACID drivers exclusively — neon-serverless or node-postgres', () => {
    expect(clientSource).toMatch(/drizzle-orm\/neon-serverless/);
    expect(clientSource).toMatch(/drizzle-orm\/node-postgres/);
  });
});

// [CCR PR #250 / neon-pool-cache-key] Regression guard for the prior security
// issue where neonPoolCache used the raw DSN (which contains the database
// password) as its Map key. The credential string would be retained in process
// memory as a lookup key — a meaningfully worse posture if a memory dump or
// heap inspection ever happens. The fix hashes the DSN with sha256 before
// using it as the cache key. The hash is stable per-DSN (so cache hits still
// work) but not reversible to the password.
describe('database/client.ts — neonPoolCache key hashing', () => {
  const NEON_DSN_A =
    'postgresql://user:supersecret@ep-aaa-bbb.us-east-2.aws.neon.tech/db?sslmode=require';
  const NEON_DSN_B =
    'postgresql://user:othersecret@ep-ccc-ddd.us-east-2.aws.neon.tech/db?sslmode=require';

  beforeEach(() => {
    __internal_neonPoolCache.clear();
  });

  afterAll(() => {
    __internal_neonPoolCache.clear();
  });

  it('returns the same drizzle handle for two requests with the same Neon DSN (cache hit)', () => {
    const db1 = createDatabase(NEON_DSN_A);
    const db2 = createDatabase(NEON_DSN_A);
    // Same DSN → same cached pool → drizzleNeon is called per request but the
    // underlying NeonPool is reused. Assert the cache stayed at size 1.
    expect(__internal_neonPoolCache.size).toBe(1);
    // Sanity: both handles exist.
    expect(db1).toBeDefined();
    expect(db2).toBeDefined();
  });

  it('creates separate pools for different Neon DSNs (cache miss)', () => {
    createDatabase(NEON_DSN_A);
    createDatabase(NEON_DSN_B);
    expect(__internal_neonPoolCache.size).toBe(2);
  });

  it('never stores the raw DSN as a cache key — keys are sha256 hex digests', () => {
    createDatabase(NEON_DSN_A);
    createDatabase(NEON_DSN_B);

    const keys = Array.from(__internal_neonPoolCache.keys());
    expect(keys).toHaveLength(2);

    for (const key of keys) {
      // sha256 hex digest is exactly 64 lowercase hex chars.
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      // The password substrings must never appear in any key.
      expect(key).not.toContain('supersecret');
      expect(key).not.toContain('othersecret');
      // The full DSN must never appear in any key.
      expect(key).not.toContain(NEON_DSN_A);
      expect(key).not.toContain(NEON_DSN_B);
      // Neither hostname nor protocol leak either.
      expect(key).not.toContain('neon.tech');
      expect(key).not.toContain('postgresql://');
    }
  });

  it('hash function is deterministic and matches the cache key', () => {
    const key1 = __internal_neonPoolCacheKey(NEON_DSN_A);
    const key2 = __internal_neonPoolCacheKey(NEON_DSN_A);
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[0-9a-f]{64}$/);

    createDatabase(NEON_DSN_A);
    expect(__internal_neonPoolCache.has(key1)).toBe(true);
  });
});
