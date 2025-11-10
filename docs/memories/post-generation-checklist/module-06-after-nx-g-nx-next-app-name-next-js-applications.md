## After: `nx g @nx/next:app <name>` (Next.js applications)

### Issue
The `@nx/next` generator creates Next.js apps with single `tsconfig.json` (correct for Next.js), but does not create a typecheck target. Without manual configuration, Next.js apps are excluded from workspace-wide typecheck commands and CI pipeline validation.

### Required Actions

**1. Create manual typecheck target**

File: `apps/<app-name>/project.json` (create if doesn't exist)

```json
{
  "name": "@nx-monorepo/<app-name>",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/<app-name>/src",
  "projectType": "application",
  "targets": {
    "typecheck": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/<app-name>",
        "command": "tsc --noEmit"
      },
      "cache": true,
      "inputs": [
        "default",
        "^production",
        {
          "externalDependencies": ["typescript"]
        }
      ],
      "metadata": {
        "technologies": ["typescript"],
        "description": "Runs type-checking for the project."
      }
    }
  }
}
```

### Validation

Run typecheck to verify configuration works:
```bash
pnpm exec nx run <app-name>:typecheck
```

Verify app is included in workspace-wide typecheck:
```bash
pnpm exec nx run-many -t typecheck
# Should list <app-name> in "Running target typecheck for N projects"
```

### Why This Matters

Without typecheck configuration, app is excluded from CI validation and creates type safety gap. See Pattern 4 in `adopted-patterns.md` for technical rationale.

**Reference**: `docs/memories/adopted-patterns.md` - Pattern 4: TypeScript Configuration for Applications

---
