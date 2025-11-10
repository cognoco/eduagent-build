## Pattern 11: Format Check Target Configuration

**Our Standard**: Explicit `format:check` target in all project.json files to enable consistent formatting validation across the monorepo

### Pattern

**All projects must include a format:check target:**

```json
{
  "targets": {
    "format:check": {}
  }
}
```

The empty object `{}` inherits all configuration from `targetDefaults.format:check` in `nx.json`:
- Executor: `nx:run-commands`
- Command: `prettier --check "{projectRoot}/**/*.{ts,tsx,js,jsx,json,css,scss,html}"`
- Cache: `true`
- Inputs: `["default", "{workspaceRoot}/.prettierrc", "{workspaceRoot}/.prettierignore"]`

**TargetDefaults Configuration (`nx.json`):**

```json
{
  "targetDefaults": {
    "format:check": {
      "cache": true,
      "inputs": [
        "default",
        "{workspaceRoot}/.prettierrc",
        "{workspaceRoot}/.prettierignore"
      ],
      "executor": "nx:run-commands",
      "options": {
        "command": "prettier --check \"{projectRoot}/**/*.{ts,tsx,js,jsx,json,css,scss,html}\""
      }
    }
  }
}
```

### Applies To

All apps and packages (web, server, web-e2e, database, schemas, api-client, supabase-client)

### Rationale

**Why explicit targets are needed:**
- Unlike `lint`, `test`, and `typecheck`, **no Nx plugin exists for Prettier/formatting**
- Nx plugins (`@nx/eslint/plugin`, `@nx/jest/plugin`, `@nx/js/typescript`) auto-infer targets from config files
- Prettier has `@nx/js:setup-prettier` generator (one-time setup) but no plugin to infer targets
- Without a plugin, projects must explicitly declare targets to use `targetDefaults` configuration
- Empty target object `{}` is sufficient—all behavior comes from `targetDefaults`

**Benefits:**
- Enables `nx run-many -t format:check` across all projects
- Enables `nx affected -t format:check` for CI optimization
- Centralized configuration in `nx.json` (DRY principle)
- Consistent formatting verification across monorepo
- Integrates with Nx caching and task orchestration
- Per-project caching (unlike `nx format:check --all` workspace command)

**Architectural consistency:**
- All quality checks (`lint`, `test`, `typecheck`, `format:check`) work the same way
- Predictable developer experience: `nx run-many -t lint test typecheck format:check`
- Task graph integration: formatting becomes part of project dependency graphs
- Future-proof: Pattern scales as monorepo grows

### Relationship to Other Targets

| Target | Configuration Source | Nx Plugin | Requires project.json? |
|--------|---------------------|-----------|----------------------|
| `lint` | `eslint.config.mjs` | `@nx/eslint/plugin` | No (inferred) |
| `test` | `jest.config.ts` | `@nx/jest/plugin` | No (inferred) |
| `typecheck` | `tsconfig.json` | `@nx/js/typescript` | No (inferred) |
| `format:check` | `.prettierrc` | **None** | **Yes (explicit)** |

**Why this inconsistency exists:**
- Nx ecosystem decision: Prettier integration handled via CLI commands, not plugin
- Built-in `nx format:check` and `nx format:write` work at workspace level
- Per-project targets require manual configuration
- **Our choice**: Consistency over convenience—all quality checks should be per-project

### When Adding New Projects

**⚠️ Required action after project generation:**

1. **Create `project.json` if it doesn't exist**

   For applications:
   ```json
   {
     "name": "@nx-monorepo/<project>",
     "$schema": "../../node_modules/nx/schemas/project-schema.json",
     "sourceRoot": "apps/<project>/src",
     "projectType": "application",
     "targets": {
       "format:check": {}
     }
   }
   ```

   For libraries:
   ```json
   {
     "name": "@nx-monorepo/<project>",
     "$schema": "../../node_modules/nx/schemas/project-schema.json",
     "sourceRoot": "packages/<project>/src",
     "projectType": "library",
     "targets": {
       "format:check": {}
     }
   }
   ```

2. **Add `format:check` target to existing `project.json`**

   If the project already has a `project.json` file:
   ```json
   {
     "targets": {
       // ... existing targets ...
       "format:check": {}
     }
   }
   ```

3. **Verify target works**

   ```bash
   pnpm exec nx run <project>:format:check
   ```

4. **Verify affected detection**

   ```bash
   pnpm exec nx affected -t format:check --base=main
   ```

**Why this pattern scales:**
- New projects automatically inherit formatting rules from `targetDefaults`
- One-time setup per project (add target entry)
- Configuration changes happen centrally in `nx.json`
- Pattern is documented and easy to teach to AI agents

### Alternative Approach (Not Recommended)

**Workspace-level commands** (`nx format:check --all`):
- ✅ Simpler (no per-project configuration)
- ✅ Official Nx recommendation
- ❌ Inconsistent with other quality checks
- ❌ Cannot use with `nx run-many -t format:check`
- ❌ Cannot use with `nx affected -t format:check`
- ❌ No per-project caching
- ❌ Not integrated into task graphs

**Our decision**: Gold standard template prioritizes consistency over convenience.

### Troubleshooting

**Issue**: `nx run-many -t format:check` returns "No tasks were run"
**Fix**: Verify all projects have `"format:check": {}` in their `targets` section

**Issue**: Format check doesn't find generated files to ignore
**Fix**: Update `.prettierignore` to exclude build artifacts (`**/dist`, `**/out-tsc`, `**/gen`)

**Issue**: Format check runs even though `.prettierignore` updated
**Fix**: Nx caches results—run `pnpm exec nx reset` to clear cache

**Issue**: New project missing format:check target
**Fix**: Follow "When Adding New Projects" steps above

### Last Validated

2025-11-03 (Nx 21.6, Prettier 3.x)

**References**:
- Nx format commands: https://nx.dev/nx-api/nx/documents/format-check
- Nx targetDefaults: https://nx.dev/reference/nx-json#target-defaults
- docs/memories/post-generation-checklist.md (format:check checklist)
- Research validation: 2025-11-03 Context7/Nx MCP investigation

---
