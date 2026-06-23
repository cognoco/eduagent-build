// ---------------------------------------------------------------------------
// Guard: .env.example must not instruct developers to use `wrangler secret put`
//
// AGENTS.md Secrets Management bans `wrangler secret put` — Doppler is the
// canonical secret store for this repo. This test prevents the banned
// instruction pattern from re-appearing in .env.example.
//
// The pattern checked is the instruction form: "set via `wrangler secret put"
// (backtick-wrapped command). This is distinct from references that describe
// the command as banned.
// ---------------------------------------------------------------------------
import * as fs from 'node:fs';
import * as path from 'node:path';

const ENV_EXAMPLE_PATH = path.resolve(__dirname, '../.env.example');

describe('.env.example secrets hygiene', () => {
  it('does not instruct developers to use `wrangler secret put` (banned per AGENTS.md Secrets Management)', () => {
    const content = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    // The original violation was: "set via `wrangler secret put SENTRY_DSN`"
    // This asserts that no such instruction-form is present.
    expect(content).not.toMatch(/set via `wrangler secret put/);
  });
});
