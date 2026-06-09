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

**Impact:** Pre-commit hook fallback to `nx affected --exclude=mobile` can fail on
large staged sets. `scripts/pre-commit-tests.sh` now prefers direct
`jest --findRelatedTests` and only falls back to `nx affected` above 100 staged
TypeScript files. The `tsc --build` step still works because it does not use Nx.

**Workarounds:**
- Run Jest directly: `cd apps/api && pnpm exec jest ...` (bypasses Nx entirely)
- Run eslint directly: `cd apps/api && pnpm exec eslint src/...`
- CI on Ubuntu is unaffected (only Windows local dev hits this)

**How to apply:** When you can't use `nx run` or `nx affected` locally, fall back
to direct tool invocation. Never use `--no-verify`; the commit skill and
`AGENTS.md` are the current authority on hook failures.
