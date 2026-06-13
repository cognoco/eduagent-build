/**
 * Unit tests for verify-wrangler-kv-binding.mjs
 *
 * WI-694 — the KV-binding verify deploy step ("Verify Cloudflare KV bindings
 * before migrations") false-failed for EVERY binding, including correctly
 * rendered concrete ones. Root cause: the block-capture regex used a bare `$`
 * under the `m` flag, which matches at every line break, so the lazy
 * `([\s\S]*?)` captured an empty body and the binding/id lookups never saw the
 * binding lines. Recent main deploys were red at exactly this step.
 *
 * Red-green guard:
 *   - GREEN (must pass): a concrete binding (real 32-hex id) is detected, even
 *     when it is the last of several sibling kv blocks. Under the OLD regex this
 *     returned false (empty body) — the regression these tests lock down.
 *   - RED (must fail to detect): absent binding, or an unrendered placeholder
 *     id (`__X__` or `<X>`), which is not a real Cloudflare id.
 *
 * Run with:
 *   node --test apps/api/scripts/verify-wrangler-kv-binding.test.mjs
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { hasConcreteKvBinding } from './verify-wrangler-kv-binding.mjs';

const PRD_ID = '4996edfa51494fe7a6ec31f02a144902';

// A realistic production env with sibling kv blocks; IDEMPOTENCY_KV is the LAST
// block — the exact shape the old empty-body regex failed to read.
function productionToml(idempotencyId) {
  return `name = "mentomate-api"

[[kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "29178404186442e9ba88be05733c3321"

[env.production]
name = "mentomate-api-production"

[env.production.vars]
EMAIL_FROM = "noreply@mentomate.com"

[[env.production.kv_namespaces]]
binding = "SUBSCRIPTION_KV"
id = "00000000000000000000000000000000"

[[env.production.kv_namespaces]]
binding = "COACHING_KV"
id = "11111111111111111111111111111111"

[[env.production.kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "${idempotencyId}"
`;
}

test('GREEN: concrete IDEMPOTENCY_KV binding is detected even as the last sibling block', () => {
  assert.equal(
    hasConcreteKvBinding(productionToml(PRD_ID), 'production', 'IDEMPOTENCY_KV'),
    true,
    'a real 32-hex id must be recognized as a concrete binding (this is the WI-694 regression)',
  );
});

test('GREEN: detects a concrete binding for the staging env section', () => {
  const toml = `[env.staging]
name = "mentomate-api-staging"

[[env.staging.kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "a120d29732164b378ec0059e68393f6e"
`;
  assert.equal(hasConcreteKvBinding(toml, 'staging', 'IDEMPOTENCY_KV'), true);
});

test('GREEN: detects a concrete binding when it is the only block in the section', () => {
  const toml = `[env.production]

[[env.production.kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "${PRD_ID}"
`;
  assert.equal(hasConcreteKvBinding(toml, 'production', 'IDEMPOTENCY_KV'), true);
});

test('RED: an unrendered __PLACEHOLDER__ id is NOT a concrete binding', () => {
  assert.equal(
    hasConcreteKvBinding(
      productionToml('__IDEMPOTENCY_KV_PRD__'),
      'production',
      'IDEMPOTENCY_KV',
    ),
    false,
    'a render-wrangler-kv placeholder must fail the gate, not pass it',
  );
});

test('RED: an unrendered <angle> placeholder id is NOT a concrete binding', () => {
  assert.equal(
    hasConcreteKvBinding(
      productionToml('<IDEMPOTENCY_KV_PRD>'),
      'production',
      'IDEMPOTENCY_KV',
    ),
    false,
  );
});

test('RED: an absent binding is NOT detected (only sibling bindings present)', () => {
  const toml = `[env.production]

[[env.production.kv_namespaces]]
binding = "SUBSCRIPTION_KV"
id = "00000000000000000000000000000000"

[[env.production.kv_namespaces]]
binding = "COACHING_KV"
id = "11111111111111111111111111111111"
`;
  assert.equal(hasConcreteKvBinding(toml, 'production', 'IDEMPOTENCY_KV'), false);
});

test('RED: a binding present only in a DIFFERENT env section is not counted', () => {
  // IDEMPOTENCY_KV concrete in staging, but we ask about production.
  const toml = `[env.staging]

[[env.staging.kv_namespaces]]
binding = "IDEMPOTENCY_KV"
id = "${PRD_ID}"

[env.production]

[[env.production.kv_namespaces]]
binding = "SUBSCRIPTION_KV"
id = "00000000000000000000000000000000"
`;
  assert.equal(hasConcreteKvBinding(toml, 'production', 'IDEMPOTENCY_KV'), false);
});

test('RED: a missing id is NOT borrowed from a following [vars] table (over-capture guard)', () => {
  // The IDEMPOTENCY_KV block has a binding but NO id; a later single-bracket
  // [vars] table carries a 32-hex `id`. The block boundary must stop at `[vars]`
  // so the two are never mis-joined into a false pass.
  const toml = `[env.production]

[[env.production.kv_namespaces]]
binding = "IDEMPOTENCY_KV"

[vars]
id = "0123456789abcdef0123456789abcdef"
`;
  assert.equal(hasConcreteKvBinding(toml, 'production', 'IDEMPOTENCY_KV'), false);
});

test('non-default binding name is honored (COACHING_KV concrete → true)', () => {
  assert.equal(hasConcreteKvBinding(productionToml(PRD_ID), 'production', 'COACHING_KV'), true);
});
