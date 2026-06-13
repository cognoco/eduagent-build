#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real Cloudflare KV namespace IDs are 32-char lowercase hex — the same shape
// render-wrangler-kv.mjs validates (REAL_KV_ID_PATTERN). A concrete binding is
// one whose id matches this; an unrendered placeholder (`__IDEMPOTENCY_KV_PRD__`,
// `<id>`, …) does not, and must NOT count as a binding.
const REAL_KV_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * True iff `content` (a wrangler.toml) declares a CONCRETE kv binding — the
 * binding name plus a real 32-hex id — under the `[[env.<envName>.kv_namespaces]]`
 * section.
 *
 * Block capture: match each `[[env.<env>.kv_namespaces]]` body up to the next
 * table header or true end-of-input. The end-of-input alternative MUST be
 * `$(?![\s\S])`, not a bare `$`: under the `m` flag a bare `$` matches at every
 * line break, so the lazy `([\s\S]*?)` stops at the end of the header line and
 * captures an EMPTY body — which made the binding/id lookups below fail for
 * every block, even a correctly-rendered concrete one (the bug this fixes).
 * `$(?![\s\S])` only matches at the actual end of the string, so the lazy
 * capture extends until the next `^[[` / `^[env.` header.
 */
export function hasConcreteKvBinding(content, envName, bindingName) {
  const envTablePattern = envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blocks = Array.from(
    content.matchAll(
      new RegExp(
        `^\\[\\[env\\.${envTablePattern}\\.kv_namespaces\\]\\]([\\s\\S]*?)(?=^\\[\\[|^\\[env\\.|$(?![\\s\\S]))`,
        'gm',
      ),
    ),
  );

  return blocks.some((block) => {
    const body = block[1] ?? '';
    const binding = body.match(/^binding\s*=\s*"([^"]+)"/m)?.[1];
    const id = body.match(/^id\s*=\s*"([^"]+)"/m)?.[1];
    return binding === bindingName && Boolean(id) && REAL_KV_ID_PATTERN.test(id);
  });
}

function main() {
  const [, , tomlPath, envName, bindingName = 'IDEMPOTENCY_KV'] = process.argv;

  if (!tomlPath || !envName) {
    console.error(
      'Usage: node scripts/verify-wrangler-kv-binding.mjs <wrangler.toml> <env> [binding]',
    );
    process.exit(2);
  }

  const content = readFileSync(tomlPath, 'utf8');

  if (!hasConcreteKvBinding(content, envName, bindingName)) {
    console.error(
      `ERROR: wrangler.toml [env.${envName}] is missing a concrete ${bindingName} KV binding.`,
    );
    console.error(
      `  Create the Cloudflare KV namespace, then add [[env.${envName}.kv_namespaces]] with binding = "${bindingName}" and its real id.`,
    );
    process.exit(1);
  }

  console.log(`OK: [env.${envName}] declares ${bindingName}.`);
}

// Run as a CLI, but stay importable for unit tests. Mirror the canonical guard
// from check-reference-only-migrations.mjs: resolve() normalizes a relative
// argv[1] (deploy.yml invokes this with a relative path from working-directory
// apps/api) against cwd, so the comparison holds whether the path is relative
// or absolute. A bare `file://${argv[1]}` would NOT match a relative invocation
// and would silently skip main() — turning the deploy gate into a no-op.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main();
}
