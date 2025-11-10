## After: Any Project Generation (Apps or Libraries)

### Issue
Nx generators do not automatically add `format:check` targets because no Nx plugin exists for Prettier formatting. Unlike `lint`, `test`, and `typecheck` which are inferred by plugins, formatting targets must be explicitly added to maintain consistency across the monorepo.

### Required Actions

**1. Verify project.json exists**

Check if the generator created `<project>/project.json`:
```bash
ls -la apps/<project>/project.json
# or
ls -la packages/<project>/project.json
```

**2. Create project.json if missing**

If the file doesn't exist, create minimal configuration:

**For applications:**
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

**For libraries:**
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

**3. Add format:check target to existing project.json**

If `project.json` exists but doesn't have `format:check`:

```json
{
  "targets": {
    // ... existing targets ...
    "format:check": {}
  }
}
```

**4. Verify target works**

```bash
pnpm exec nx run <project>:format:check
```

**5. Verify workspace-wide format:check includes the project**

```bash
pnpm exec nx run-many -t format:check
# Should list <project> in "Running target format:check for N projects"
```

### Validation

Run format check on the new project:
```bash
pnpm exec nx run <project>:format:check
```

Verify it appears in affected detection:
```bash
pnpm exec nx affected -t format:check --base=main
```

### Why This Matters

- **Architectural consistency**: Unlike `lint`/`test`/`typecheck` which have Nx plugins to auto-infer targets, `format:check` has no plugin and must be explicitly declared
- **CI validation**: Without this target, the project is excluded from `nx run-many -t format:check` and `nx affected -t format:check`
- **Task graph integration**: Formatting becomes part of the project's task graph for proper caching and orchestration
- **Empty target `{}` inherits all configuration** from `targetDefaults.format:check` in `nx.json` (centralized, DRY)

### Gold Standard Principle

A gold standard template should demonstrate patterns that scale. Mixing workspace-level commands with per-project targets creates inconsistency:
- ✅ **Consistent**: `nx run-many -t lint test typecheck format:check` all work the same way
- ❌ **Inconsistent**: `nx run-many -t lint test typecheck` work, but `format:check` requires different command

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 11: Format Check Target Configuration

---
