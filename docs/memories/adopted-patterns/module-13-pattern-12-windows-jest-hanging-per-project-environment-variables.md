## Pattern 12: Windows Jest Hanging - Per-Project Environment Variables

**Our Standard**: When Jest tests hang on Windows, add `NX_DAEMON=false` to the project's test target environment configuration (not globally).

### Pattern

**Problem**: On Windows, Jest tests may hang indefinitely with messages like:
- "Jest did not exit one second after the test run"
- Terminal shows "Terminate batch job (Y/N)?"

**Solution**: Add environment variable to the specific project's test target in `project.json`:

```json
{
  "name": "@nx-monorepo/web",
  "targets": {
    "test": {
      "options": {
        "env": {
          "NX_DAEMON": "false"
        }
      }
    }
  }
}
```

**How it works**:
- Uses Nx's native `env` option in target configuration
- Merges with inferred configuration from `@nx/jest/plugin`
- Automatically applies to all test invocations (manual, npm scripts, hooks)
- Does not affect other targets (build, serve, lint)

### Applies To

- **Confirmed**: `@nx-monorepo/web` (Next.js app)
- **Apply as needed**: Any project experiencing Windows Jest hanging

**Do NOT apply preemptively** - Only add when the problem manifests in a specific project.

### Rationale

**Why per-project configuration?**
1. **Surgical fix** - Only affects projects that exhibit the problem
2. **Documented pattern** - Other developers know how to fix if it happens elsewhere
3. **Nx-native approach** - Uses official, documented Nx functionality
4. **No platform detection needed** - Configuration is declarative and version-controlled

**Why not global targetDefaults?**
- Would disable daemon for ALL projects on ALL platforms
- Penalizes projects that don't have the issue
- Not aligned with "fix where broken" philosophy

**Why not wrapper scripts?**
- Adds indirection and maintenance burden
- Less discoverable than configuration in project.json
- Requires platform detection logic

**Why not .env files?**
- Requires manual setup by each developer
- Reactive (discover after problem) rather than proactive
- Easy to forget when switching machines

**Relationship to pre-commit hooks**:
- Pre-commit hook already uses `NX_DAEMON=false` globally (see `.husky/pre-commit`)
- This pattern fixes **manual test runs** (`nx run web:test`)
- Ensures consistent behavior across all execution contexts

### When Adding New Projects

**If Jest tests hang on Windows:**

1. **Verify the symptom**:
   ```bash
   pnpm exec nx run <project>:test
   # Hangs at "Test Suites: X passed, X total"
   ```

2. **Add environment variable** to `<project>/project.json`:
   ```json
   {
     "targets": {
       "test": {
         "options": {
           "env": {
             "NX_DAEMON": "false"
           }
         }
       }
     }
   }
   ```

3. **Verify the fix**:
   ```bash
   pnpm exec nx run <project>:test
   # Should complete without hanging
   ```

4. **Document** in project README or comments why this is needed

**Do NOT**:
- ❌ Add to nx.json targetDefaults (affects all projects)
- ❌ Add preemptively to projects that work fine
- ❌ Use wrapper scripts or platform detection for this issue

### Troubleshooting

**If adding env doesn't work:**
1. Check Nx version supports `env` in `nx:run-commands` executor (Nx 15+)
2. Try manual workaround: `NX_DAEMON=false pnpm exec nx run <project>:test`
3. Check for other Jest configuration issues (see troubleshooting.md)

**If problem spreads to other projects:**
- Apply the same pattern to each affected project
- Document in project-specific README
- Consider if there's a deeper root cause (Nx version bug, Jest config issue)

### Last Validated

2025-11-03 (Nx 21.6, Jest 30, Windows 11)

**References**:
- Nx env option: https://nx.dev/nx-api/nx/executors/run-commands#env
- docs/memories/troubleshooting.md - "Jest Exits Slowly or Hangs (Windows)"
- AGENTS.md - "Jest & Testing Configuration" section
- Research validation: 2025-11-03 (Sub-agent analysis of 5 approaches)

---
