/**
 * OpenAPI Spec Generator Script
 *
 * This script generates the OpenAPI JSON specification from the Express app
 * and writes it to dist/apps/server/openapi.json for consumption by api-client.
 *
 * Note: Caching is disabled for this task (spec-write) because the output file
 * must physically exist for downstream tasks (generate-types) to succeed.
 * Remote cache restoration of outputs can be unreliable for critical file dependencies.
 */
import {
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Resolve paths relative to this script's location (apps/server/scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(serverRoot, '../..');

// Use require() to load the built CommonJS module
const require = createRequire(import.meta.url);
const openapiPath = resolve(
  workspaceRoot,
  'dist/apps/server/apps/server/src/openapi/index.js'
);
const { getOpenApiSpec } = require(openapiPath);

// Write to packages/api-client/src/gen/ to avoid server:build cache restoration conflicts
// The dist/apps/server/ directory can be overwritten by Nx remote cache restoration
const out = resolve(workspaceRoot, 'packages/api-client/src/gen/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(getOpenApiSpec(), null, 2));

// Verify file was written successfully (CI debugging)
if (existsSync(out)) {
  const stats = statSync(out);
  console.log('✓ Wrote OpenAPI spec:', out);
  console.log('  File size:', stats.size, 'bytes');
} else {
  console.error('✗ ERROR: File not found after write:', out);
  process.exit(1);
}
