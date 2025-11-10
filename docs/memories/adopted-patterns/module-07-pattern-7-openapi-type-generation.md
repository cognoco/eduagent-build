## Pattern 7: OpenAPI Type Generation

**Our Standard**: Build-time TypeScript type generation from OpenAPI spec using file-based artifact

### Pattern

**Type Generation Flow:**
```
server:build → server:spec-write → api-client:generate-types → api-client:build
```

**Server Configuration** (`apps/server/project.json`):
```json
{
  "targets": {
    "spec-write": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsx scripts/write-openapi.ts"
      },
      "dependsOn": ["build"],
      "outputs": ["{workspaceRoot}/dist/apps/server/openapi.json"]
    }
  }
}
```

**Spec Write Script** (`apps/server/scripts/write-openapi.ts`):
```typescript
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Load CommonJS module from ESM context
const { getOpenApiSpec } = require('../dist/apps/server/src/openapi/index.js');

const spec = getOpenApiSpec();
const specPath = path.join(process.cwd(), 'dist', 'apps', 'server');
fs.mkdirSync(specPath, { recursive: true });
fs.writeFileSync(
  path.join(specPath, 'openapi.json'),
  JSON.stringify(spec, null, 2)
);

console.log('✓ OpenAPI spec written to dist/apps/server/openapi.json');
```

**API Client Configuration** (`packages/api-client/project.json`):
```json
{
  "targets": {
    "generate-types": {
      "executor": "nx:run-commands",
      "options": {
        "command": "openapi-typescript ../../dist/apps/server/openapi.json -o src/gen/openapi.d.ts --export-type"
      },
      "dependsOn": [
        {
          "target": "spec-write",
          "projects": ["server"]
        }
      ],
      "outputs": ["{projectRoot}/src/gen/openapi.d.ts"],
      "cache": true
    },
    "build": {
      "dependsOn": ["generate-types"]
    }
  }
}
```

**Generated Types Gitignore** (`packages/api-client/.gitignore`):
```
src/gen/
```

**Importing Generated Types:**
```typescript
// Import from built package
import type { paths } from '@nx-monorepo/api-client/gen/openapi';

// Or relative import within api-client package
import type { paths } from '../gen/openapi';

// Extract operation types
type GetHealthOperation = paths['/health']['get'];
type GetHealthResponse = GetHealthOperation['responses']['200']['content']['application/json'];
```

### Directory Structure

```
apps/server/
├── scripts/
│   └── write-openapi.ts      # Spec write script
├── dist/                     # Build output (gitignored)
│   └── openapi.json         # Generated spec artifact
└── project.json             # Contains spec-write target

packages/api-client/
├── src/
│   └── gen/                 # Generated types (gitignored)
│       └── openapi.d.ts    # TypeScript declarations
└── project.json            # Contains generate-types target
```

### Applies To

All client packages that need type-safe access to server APIs

### Rationale

**Why `openapi-typescript`:**
- ✅ **TypeScript-first**: Generates native TypeScript types, not runtime code
- ✅ **Path-based types**: Extract types via `paths['/health']['get']` (matches OpenAPI structure exactly)
- ✅ **Lightweight**: Pure type generation, no framework coupling
- ✅ **Active maintenance**: 7.10+ versions support OpenAPI 3.1.0
- ✅ **Industry standard**: Most popular OpenAPI → TypeScript tool (2025)
- ❌ **Alternatives rejected**: swagger-codegen (Java-based, outdated), orval (runtime code generation, heavier)

**File-based generation advantages:**
- ✅ **Build-time dependency**: No server runtime required for type generation
- ✅ **Nx caching**: Type generation can be cached and reused
- ✅ **CI determinism**: No network calls, no timing issues
- ✅ **Explicit graph edge**: Clear dependency via `dependsOn` reference
- ✅ **Artifact-based**: Spec file becomes a build artifact like compiled JS

**Gitignore generated types:**
- ✅ **Avoid merge conflicts**: Generated code never conflicts in PRs
- ✅ **Reduce PR noise**: No auto-generated diffs to review
- ✅ **Build artifact pattern**: Types regenerated automatically like compiled output
- ✅ **Source of truth**: OpenAPI spec is the source, types are derived

**Type declarations only (`.d.ts` with `--export-type`):**
- ✅ **Pure types**: No runtime emissions, cleaner buildable library
- ✅ **TypeScript-only**: No need for additional build configuration
- ✅ **Tree-shakeable**: Type-only imports don't affect bundle size

**Explicit dependency reference:**
```json
"dependsOn": [
  {
    "target": "spec-write",
    "projects": ["server"]
  }
]
```
- ✅ **No project dependency needed**: `api-client` doesn't need to depend on `server` in workspace graph
- ✅ **Build-time only**: Dependency is for builds, not runtime
- ✅ **Clear intent**: Explicit reference shows why dependency exists

**Workspace-level tool installation:**
- ✅ **Available for all Nx commands**: No need to filter to specific package
- ✅ **Consistent versioning**: One version of `openapi-typescript` across workspace
- ✅ **Simpler scripts**: No pnpm filter needed in Nx targets

**ESM script with CommonJS require:**
- ✅ **Uses tsx**: Modern TypeScript execution
- ✅ **createRequire**: Load CommonJS built artifacts from ESM script
- ✅ **Works with Nx**: Compatible with Nx build outputs (CJS)

### When Adding New API Endpoints

**Automatic regeneration:**
```bash
# Build api-client (triggers entire chain automatically)
pnpm exec nx run api-client:build
```

**Manual regeneration (if needed):**
```bash
# Step 1: Generate spec artifact
pnpm exec nx run server:spec-write

# Step 2: Generate TypeScript types
pnpm exec nx run api-client:generate-types
```

**Using generated types:**
```typescript
import type { paths, components } from '@nx-monorepo/api-client/gen/openapi';

// Extract path operation types
type HealthCheckEndpoint = paths['/health']['get'];
type HealthCheckResponse = HealthCheckEndpoint['responses']['200']['content']['application/json'];

// Extract component schemas
type HealthCheck = components['schemas']['HealthCheckResponse'];

// Use in native fetch client (requires full HTTP path)
async function getHealth(): Promise<HealthCheckResponse> {
  const response = await fetch('/api/health');
  return response.json();
}

// Or with openapi-fetch (uses relative path + baseUrl)
// const client = createClient<paths>({ baseUrl: 'http://localhost:4000/api' })
// await client.GET('/health') // Resolves to /api/health automatically
```

### Dependencies Required

**Workspace root** (`package.json`):
```json
{
  "devDependencies": {
    "openapi-typescript": "^7.10.0",
    "tsx": "^4.19.2"
  }
}
```

**Server app** (`apps/server/package.json`):
```json
{
  "dependencies": {
    "@asteasolutions/zod-to-openapi": "^8.1.0",
    "openapi3-ts": "^4.5.0"
  }
}
```

**Note**: `openapi-typescript` is in workspace root devDependencies, NOT in api-client package.json.

### Anti-Patterns to Avoid

❌ **HTTP-based generation**:
```json
// WRONG - requires server to be running
{
  "command": "openapi-typescript http://localhost:4000/api/docs/openapi.json"
}
```

✅ **Correct - file-based**:
```json
// RIGHT - uses build artifact
{
  "command": "openapi-typescript ../../dist/apps/server/openapi.json"
}
```

❌ **Committing generated types**:
```bash
# WRONG - generated types in git
git add packages/api-client/src/gen/openapi.d.ts
```

✅ **Correct - gitignore generated types**:
```gitignore
# RIGHT - keep as build artifact
src/gen/
```

❌ **Implicit graph edge**:
```json
// WRONG - relies on workspace dependency
{
  "dependsOn": ["^build"]
}
```

✅ **Correct - explicit reference**:
```json
// RIGHT - clear cross-project dependency
{
  "dependsOn": [
    {
      "target": "spec-write",
      "projects": ["server"]
    }
  ]
}
```

❌ **Installing openapi-typescript in api-client package**:
```json
// WRONG - tool not available for Nx commands
// packages/api-client/package.json
{
  "devDependencies": {
    "openapi-typescript": "^7.10.0"
  }
}
```

✅ **Correct - workspace-level installation**:
```json
// RIGHT - available for all Nx targets
// package.json (workspace root)
{
  "devDependencies": {
    "openapi-typescript": "^7.10.0"
  }
}
```

❌ **Missing export-type flag**:
```bash
# WRONG - generates runtime code
openapi-typescript spec.json -o types.ts
```

✅ **Correct - type declarations only**:
```bash
# RIGHT - generates .d.ts file
openapi-typescript spec.json -o types.d.ts --export-type
```

### Maintenance

**When types are stale:**
```bash
# Clear Nx cache
pnpm exec nx reset

# Rebuild entire chain
pnpm exec nx run api-client:build
```

**Verify dependency chain:**
```bash
# View task graph
pnpm exec nx graph
```

**Debug spec generation:**
```bash
# Check spec artifact exists
ls dist/apps/server/openapi.json

# Validate spec format
cat dist/apps/server/openapi.json | jq .
```

**Debug type generation:**
```bash
# Check generated types
ls packages/api-client/src/gen/openapi.d.ts

# View generated types
cat packages/api-client/src/gen/openapi.d.ts
```

### Common Issues

**Issue**: `Cannot find module 'openapi-typescript'`
**Fix**: Install in workspace root, not in api-client package.json

**Issue**: Generated types missing after build
**Fix**: Verify `generate-types` is in build's `dependsOn` array

**Issue**: Stale types after server changes
**Fix**: Run `pnpm exec nx reset` to clear cache, then rebuild

**Issue**: `TS2307: Cannot find module '@nx-monorepo/api-client/gen/openapi'`
**Fix**: Run `pnpm exec nx run api-client:generate-types` to generate types

**Issue**: Spec write script can't find getOpenApiSpec
**Fix**: Ensure `server:build` completed successfully before `spec-write`

**Issue**: ESM/CommonJS module compatibility error
**Fix**: Use `createRequire` pattern in write-openapi.ts script

### Nx Affected Behavior

**Understanding Affected Detection:**

This pattern uses explicit dependency reference (`"dependsOn": ["server:spec-write"]`) rather than project-graph edges. This has important implications for `nx affected` commands.

**Expected Behavior:**

```bash
# Scenario 1: Server implementation change (no API contract change)
# Example: Update health check message string
nx affected -t build --base=main

# Result: api-client NOT in affected set ✅
# Rationale: Implementation changes don't affect the OpenAPI spec
```

```bash
# Scenario 2: API contract change (spec changes)
# Example: Add new endpoint or change response schema
nx run server:spec-write  # Generates new spec with different hash

# Result: generate-types cache invalidates → types regenerate ✅
# Rationale: Nx detects spec file changed, cache miss triggers regeneration
```

**Why This is Correct:**

- **Most server changes** don't affect the API contract (implementation details)
- **Only contract-breaking changes** require type regeneration
- **Nx caching automatically detects** when spec content changes via file hashing
- **No need for project-graph edge** - the dependency is on the build artifact, not the project

**Alternative Approach (Not Recommended):**

If you want api-client to ALWAYS rebuild when server changes (even without spec changes):

```json
// packages/api-client/project.json
{
  "implicitDependencies": ["server"]
}
```

**Why we don't use this:**
- Unnecessary rebuilds when server implementation changes without API changes
- Defeats the purpose of Nx's intelligent caching
- Current approach is more efficient and semantically correct

**For CI/CD Pipelines:**

Use `nx run-many` to build everything:
```bash
nx run-many -t build --projects=server,api-client
```

Or rely on build dependencies to cascade automatically:
```bash
nx run api-client:build  # Automatically runs server:spec-write first
```

### Last Validated

2025-10-24 (openapi-typescript 7.10.0, Nx 21.6, TypeScript 5.9, tsx 4.19.2)

**References**:
- openapi-typescript documentation: https://github.com/drwpow/openapi-typescript
- Task 4.1.8 execution notes
- Pattern 6 (OpenAPI Spec Generation) - prerequisite pattern

---
