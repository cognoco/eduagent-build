#!/usr/bin/env node
// ---------------------------------------------------------------------------
// render-wrangler-kv.mjs — inject Cloudflare identifiers into wrangler.toml
//
// Why: Cloudflare KV namespace IDs AND the CF account_id are infrastructure
// identifiers that reveal production topology when committed in plaintext.
// [FCR-2026-05-23-L14.F8 / BUG-720] moved KV IDs out of the committed file;
// [FCR-2026-05-23-L14.F7 / BUG-721] does the same for the top-level
// `account_id` (which combined with a leaked CF API token would form a
// complete targeting pair).
//
// Pattern: wrangler.toml carries `__CF_ACCOUNT_ID__` and `__<BINDING>_<ENV>__`
// placeholders. This script substitutes each placeholder with the matching
// environment variable. A missing required env var is a HARD FAIL — silent
// recovery is banned in deploy paths.
//
// Required env vars (set as GitHub Actions secrets, sourced from Doppler):
//   CF_ACCOUNT_ID                                  (single value, all envs)
//   CF_KV_SUBSCRIPTION_ID_DEV / _STG / _PRD
//   CF_KV_COACHING_ID_DEV    / _STG / _PRD
//   CF_KV_IDEMPOTENCY_ID_DEV / _STG / _PRD        (H3 / BUG-12)
//
// Usage:
//   node scripts/render-wrangler-kv.mjs [wrangler.toml]    # writes in place
//   node scripts/render-wrangler-kv.mjs --check            # verifies no real
//                                                          # IDs left in file
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLACEHOLDERS = {
  __CF_ACCOUNT_ID__: 'CF_ACCOUNT_ID',
  __SUBSCRIPTION_KV_DEV__: 'CF_KV_SUBSCRIPTION_ID_DEV',
  __SUBSCRIPTION_KV_STG__: 'CF_KV_SUBSCRIPTION_ID_STG',
  __SUBSCRIPTION_KV_PRD__: 'CF_KV_SUBSCRIPTION_ID_PRD',
  __COACHING_KV_DEV__: 'CF_KV_COACHING_ID_DEV',
  __COACHING_KV_STG__: 'CF_KV_COACHING_ID_STG',
  __COACHING_KV_PRD__: 'CF_KV_COACHING_ID_PRD',
  // [H3 / BUG-12] IDEMPOTENCY_KV — webhook replay deduplication. Namespaces
  // must be created in Cloudflare (Workers & Pages → KV → Create) and the IDs
  // added to Doppler (project: mentomate, configs: dev/stg/prd).
  __IDEMPOTENCY_KV_DEV__: 'CF_KV_IDEMPOTENCY_ID_DEV',
  __IDEMPOTENCY_KV_STG__: 'CF_KV_IDEMPOTENCY_ID_STG',
  __IDEMPOTENCY_KV_PRD__: 'CF_KV_IDEMPOTENCY_ID_PRD',
};

// Real Cloudflare KV namespace IDs and CF account_ids are 32-char lowercase
// hex strings — same shape, same guard.
const REAL_KV_ID_PATTERN = /^[0-9a-f]{32}$/;

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const path = resolve(
    args.find((a) => !a.startsWith('--')) ?? 'wrangler.toml',
  );

  const original = readFileSync(path, 'utf8');

  if (checkOnly) {
    // Verify no real Cloudflare identifier slipped back into the committed
    // file — both top-level `account_id` and `[[kv_namespaces]]` block IDs.
    const failures = [];

    // Top-level `account_id = "<32-hex>"` (CF account ID).
    const accountIdMatch = original.match(/^account_id\s*=\s*"([^"]+)"/m);
    if (accountIdMatch && REAL_KV_ID_PATTERN.test(accountIdMatch[1])) {
      failures.push(`account_id: real CF account ID committed (${accountIdMatch[1]})`);
    }

    // KV namespace blocks: match `id = "..."` lines that follow a
    // `binding = "..."` line within the same block.
    const blockRegex =
      /\[\[(?:env\.[a-z]+\.)?kv_namespaces\]\]([\s\S]*?)(?=^\[|$)/gm;
    let match;
    while ((match = blockRegex.exec(original)) !== null) {
      const body = match[1] ?? '';
      const idMatch = body.match(/^id\s*=\s*"([^"]+)"/m);
      const bindingMatch = body.match(/^binding\s*=\s*"([^"]+)"/m);
      if (idMatch && bindingMatch) {
        const id = idMatch[1];
        if (REAL_KV_ID_PATTERN.test(id)) {
          failures.push(`${bindingMatch[1]}: real KV ID committed (${id})`);
        }
      }
    }
    if (failures.length > 0) {
      console.error(
        '✗ render-wrangler-kv --check: real Cloudflare identifiers found in committed wrangler.toml:',
      );
      for (const f of failures) console.error(`    ${f}`);
      console.error(
        '  Replace with __CF_ACCOUNT_ID__ / __<BINDING>_<ENV>__ placeholders and inject via render-wrangler-kv at deploy time.',
      );
      process.exit(1);
    }
    console.log('✓ no real Cloudflare identifiers committed in', path);
    return;
  }

  let rendered = original;
  const missing = [];
  const substituted = [];

  for (const [placeholder, envVar] of Object.entries(PLACEHOLDERS)) {
    const value = process.env[envVar];
    if (rendered.includes(placeholder)) {
      if (!value) {
        missing.push(`${envVar} (placeholder ${placeholder})`);
        continue;
      }
      if (!REAL_KV_ID_PATTERN.test(value)) {
        console.error(
          `✗ ${envVar} value does not look like a Cloudflare identifier (expected 32-char hex): ${value}`,
        );
        process.exit(1);
      }
      rendered = rendered.split(placeholder).join(value);
      substituted.push(`${placeholder} ← ${envVar}`);
    }
  }

  if (missing.length > 0) {
    console.error(
      '✗ render-wrangler-kv: required environment variables not set:',
    );
    for (const m of missing) console.error(`    ${m}`);
    console.error(
      '  Add the values to Doppler (mentomate / dev|stg|prd) and propagate to GitHub Actions secrets.',
    );
    process.exit(1);
  }

  writeFileSync(path, rendered);
  console.log(`✓ rendered ${path}`);
  for (const s of substituted) console.log(`    ${s}`);
}

main();
