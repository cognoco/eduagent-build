/**
 * OpenAPI Spec Generator Script
 *
 * This script generates the OpenAPI JSON specification from the Express app
 * and writes it to dist/apps/server/openapi.json for consumption by api-client.
 *
 * Cache Note: This file is an input to the spec-write Nx target. Any changes
 * here will invalidate the Nx cache, forcing regeneration of the OpenAPI spec.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
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

const out = resolve(workspaceRoot, 'dist/apps/server/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(getOpenApiSpec(), null, 2));
console.log('✓ Wrote OpenAPI spec:', out);
