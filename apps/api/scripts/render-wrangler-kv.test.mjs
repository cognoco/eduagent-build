import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, test } from 'node:test';

const scriptPath = fileURLToPath(
  new URL('./render-wrangler-kv.mjs', import.meta.url),
);

const tempDirs = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeTempWrangler(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'render-wrangler-kv-'));
  tempDirs.push(dir);
  const path = join(dir, 'wrangler.toml');
  writeFileSync(path, contents);
  return path;
}

for (const { label, placeholder, envVar, sentinel } of [
  {
    label: 'account ID',
    placeholder: '__CF_ACCOUNT_ID__',
    envVar: 'CF_ACCOUNT_ID',
    sentinel: 'leaky-account-id-value',
  },
  {
    label: 'KV namespace ID',
    placeholder: '__SUBSCRIPTION_KV_DEV__',
    envVar: 'CF_KV_SUBSCRIPTION_ID_DEV',
    sentinel: 'leaky-kv-id-value',
  },
]) {
  test(`malformed ${label} reports safe context without the supplied value`, () => {
    const wranglerPath = writeTempWrangler(`id = "${placeholder}"\n`);

    const result = spawnSync(process.execPath, [scriptPath, wranglerPath], {
      encoding: 'utf8',
      env: { ...process.env, [envVar]: sentinel },
    });

    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, new RegExp(sentinel));
    assert.match(result.stderr, new RegExp(envVar));
    assert.match(result.stderr, new RegExp(`actual length ${sentinel.length}`));
    assert.match(result.stderr, /lowercase hex (?:true|false)/);
  });
}

test('--check names committed identifier locations without printing identifier values', () => {
  const accountSentinel = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab';
  const kvSentinel = 'cccccccccccccccccccccccccccccccd';
  const wranglerPath = writeTempWrangler(`
account_id = "${accountSentinel}"

[[kv_namespaces]]
binding = "SUBSCRIPTION_KV"
id = "${kvSentinel}"
`);

  const result = spawnSync(
    process.execPath,
    [scriptPath, '--check', wranglerPath],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, new RegExp(accountSentinel));
  assert.doesNotMatch(result.stderr, new RegExp(kvSentinel));
  assert.match(result.stderr, /account_id/);
  assert.match(result.stderr, /SUBSCRIPTION_KV/);
  assert.match(result.stderr, /actual length 32/);
  assert.match(result.stderr, /lowercase hex true/);
});
