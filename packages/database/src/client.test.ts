import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
      /from\s+['"]@neondatabase\/serverless['"]\s*;.*neon\(/s
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
