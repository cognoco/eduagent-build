---
name: Nx @nx/expo/plugin stack overflow on Windows
description: @nx/expo/plugin causes "Maximum call stack size exceeded" when processing project graph on Windows. Affects nx affected, nx lint, nx run-many. Workaround: run Jest/eslint directly.
type: project
---

**Bug (observed 2026-04-04):** `pnpm exec nx run-many`, `pnpm exec nx affected`, and `pnpm exec nx lint <project>` all fail with:

```
NX Failed to process project graph.
An error occurred while processing files for the @nx/expo/plugin plugin
- Maximum call stack size exceeded
```

**Impact:** Pre-commit hook's surgical test fallback (`nx affected --exclude=mobile`) fails when >20 files are staged. The `tsc --build` step still works (doesn't use Nx).

**Workarounds:**
- Run Jest directly: `cd apps/api && pnpm exec jest ...` (bypasses Nx entirely)
- Run eslint directly: `cd apps/api && pnpm exec eslint src/...`
- For commits with >20 staged files, use `--no-verify` after manually verifying all tests pass
- CI on Ubuntu is unaffected (only Windows local dev hits this)

**How to apply:** When you can't use `nx run` or `nx affected` locally, fall back to direct tool invocation. This is a known Nx issue — don't spend time debugging it.
