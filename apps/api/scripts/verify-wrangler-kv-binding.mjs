#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const [, , tomlPath, envName, bindingName = 'IDEMPOTENCY_KV'] = process.argv;

if (!tomlPath || !envName) {
  console.error(
    'Usage: node scripts/verify-wrangler-kv-binding.mjs <wrangler.toml> <env> [binding]',
  );
  process.exit(2);
}

const content = readFileSync(tomlPath, 'utf8');
const envTablePattern = envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blocks = Array.from(
  content.matchAll(
    new RegExp(
      `^\\[\\[env\\.${envTablePattern}\\.kv_namespaces\\]\\]([\\s\\S]*?)(?=^\\[\\[|^\\[env\\.|$)`,
      'gm',
    ),
  ),
);

const hasBinding = blocks.some((block) => {
  const body = block[1] ?? '';
  const binding = body.match(/^binding\s*=\s*"([^"]+)"/m)?.[1];
  const id = body.match(/^id\s*=\s*"([^"<][^"]+)"/m)?.[1];
  return binding === bindingName && Boolean(id);
});

if (!hasBinding) {
  console.error(
    `ERROR: wrangler.toml [env.${envName}] is missing a concrete ${bindingName} KV binding.`,
  );
  console.error(
    `  Create the Cloudflare KV namespace, then add [[env.${envName}.kv_namespaces]] with binding = "${bindingName}" and its real id.`,
  );
  process.exit(1);
}

console.log(`OK: [env.${envName}] declares ${bindingName}.`);
