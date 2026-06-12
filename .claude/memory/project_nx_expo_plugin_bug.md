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

**Impact:** Hook fallback to `nx affected --exclude=mobile` can fail on large
change sets. The pre-push hook (`scripts/pre-push-tests.sh:141-148`) prefers
direct `jest --findRelatedTests` and only falls back to `nx affected` above 100
TypeScript files in the push delta — that fallback is the path that can hit this
bug on Windows. The `tsc --build` step still works because it does not use Nx.

**Workarounds:**
- Run Jest directly: `cd apps/api && pnpm exec jest ...` (bypasses Nx entirely)
- Run eslint directly: `cd apps/api && pnpm exec eslint src/...`
- CI on Ubuntu is unaffected (only Windows local dev hits this)

**How to apply:** When you can't use `nx run` or `nx affected` locally, fall back
to direct tool invocation. Hook bypass follows the two-level `--no-verify`
doctrine (AGENTS.md § Required Validation): the >100-TS-file Windows escape is a
sanctioned narrow, deliberate bypass (MMT-ADR-0019 — the no-verify doctrine ADR;
WI-537 carried it into AGENTS.md) until the upstream @nx/expo fix lands
(watch-item WI-542). The automated commit skill still never bypasses hooks
autonomously. (Re-confirmed 2026-06-11, WI-587.)
