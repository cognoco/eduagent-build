## Nx Configuration - Custom Target Cache Inputs - 2025-12-05

**Decision:** All custom Nx targets that execute scripts against compiled build outputs MUST include explicit `inputs` arrays referencing those outputs.

**Context:** During Epic 4 (Authentication Infrastructure), the `spec-write` target in `apps/server/project.json` failed in CI after passing locally. The target runs a Node script that requires compiled JavaScript files from the `build` target, but Nx cache wasn't invalidating when source files changed.

**Problem Scenario:**
1. Developer changes `apps/server/src/openapi/*.ts`
2. Runs `nx run server:build` (compiles TS → JS in `dist/`)
3. Runs `nx run server:spec-write` (reads compiled JS to generate OpenAPI spec)
4. **Issue**: `spec-write` was cached based on its script file only, not the compiled outputs it reads
5. CI ran with stale cache, causing failures

**Root Cause:** The `spec-write` target had `dependsOn: ["build"]` which ensures build runs first, but did NOT tell Nx cache system to invalidate when build outputs change.

**Alternatives Considered:**
1. Remove caching for custom targets — Rejected (defeats Nx performance benefits)
2. Use `--skip-nx-cache` flag — Rejected (not sustainable, requires manual intervention)
3. **Add explicit `inputs` array** — Chosen (proper Nx pattern)

**Chosen Approach:** Add explicit `inputs` to custom targets that read compiled outputs.

**Technical Rationale:**
- `dependsOn` controls **execution order** (build before spec-write)
- `inputs` controls **cache invalidation** (when do we re-run?)
- These are orthogonal concerns in Nx
- Without `inputs`, Nx only considers the target's own source files for cache

**Implementation Details:**

**Before (broken):**
```json
{
  "spec-write": {
    "executor": "nx:run-commands",
    "options": {
      "commands": ["node -e \"...require('./dist/apps/server/...')...\""]
    },
    "dependsOn": ["build"],
    "outputs": ["{workspaceRoot}/dist/apps/server/openapi.json"]
  }
}
```

**After (fixed):**
```json
{
  "spec-write": {
    "executor": "nx:run-commands",
    "options": {
      "commands": ["node -e \"...require('./dist/apps/server/...')...\""]
    },
    "dependsOn": ["build"],
    "inputs": [
      "{workspaceRoot}/dist/apps/server/apps/server/src/**/*.js",
      "{projectRoot}/scripts/write-openapi.ts"
    ],
    "outputs": ["{workspaceRoot}/dist/apps/server/openapi.json"]
  }
}
```

**Key Pattern:** Include ALL files that the script reads in the `inputs` array:
- Compiled JS files from `dist/` (if script imports them)
- The script file itself
- Any configuration files the script reads

**Warning Signs (for AI agents):**
- If you see a custom target with `dependsOn: ["build"]` but no `inputs` array → ADD INPUTS
- If you see a script that `require()`s or `import()`s from `dist/` → Those paths need to be in `inputs`
- If CI fails with "cache hit" but local passes after rebuild → Missing inputs is likely culprit

**Applies To:**
- Any `nx:run-commands` target that executes scripts reading compiled outputs
- Custom targets for: spec generation, documentation generation, code analysis tools
- NOT needed for standard Nx executors (they handle this internally)

**Verification:**
```bash
# After changing source files, verify target re-runs (not cached)
pnpm exec nx run server:build
pnpm exec nx run server:spec-write --verbose
# Should see "Running target" not "Nx read the output from cache"
```

**References:**
- Epic 4 Retrospective: `docs/sprint-artifacts/retrospectives/epic-4-retro-2025-12-05.md`
- Nx Caching Documentation: https://nx.dev/concepts/how-caching-works
- Pattern 6 (OpenAPI Spec Generation): `docs/memories/adopted-patterns/module-06-pattern-6-openapi-spec-generation.md`
- Governing Document: `docs/architecture-decisions.md` → Stage 4.1 (REST+OpenAPI infrastructure)
- Related Finding: `module-24-nx-configuration-nx-cloud-cache-invalidation-after-major-upgrades-2025-12-12.md` (when correct config still hits stale remote cache)

**Alignment Rationale:** This finding supports the REST+OpenAPI architecture by ensuring the `spec-write` pipeline (which generates OpenAPI specs from Zod schemas) correctly invalidates cache. Without proper inputs, the OpenAPI spec can become stale, breaking type generation downstream.

### Manifest & Validation Checklist
1. [x] Add entry to `docs/memories/tech-findings-log/manifest.yaml`
2. [x] Governing artefact identified: `docs/architecture-decisions.md` → Stage 4.1
3. [x] Set `validation_status: valid` (fix verified in production CI)
4. [x] Update `last_updated_by` and `last_updated_at` in manifest
