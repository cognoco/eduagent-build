# WI-1181 dependency lockfile hygiene audit

**Date:** 2026-07-08  
**Scope:** `WI-1181` - Dev-dependency lockfile hygiene: drop transitive `node-fetch@2` / `lodash` / `moment` plus build-tool deprecations.

## Summary

`pnpm install` completed without changing `package.json`, `apps/mobile/package.json`, or `pnpm-lock.yaml`. The flagged packages are still present only where an active direct or transitive dependency requires them; no orphaned lockfile entries were found to remove.

`react-native-markdown-display` remains untouched as a direct mobile dependency.

## Findings

| Package | Result | Dependency chain |
|---|---|---|
| `node-fetch@2.7.0` | Upstream-blocked transitive dependency. | `expo` / `expo-router` -> `@expo/cli` / `react-native-web` -> `fbjs` -> `cross-fetch@3.2.0` -> `node-fetch@2.7.0`; also `@nx/expo` / `@nx/react` -> `@nx/module-federation` -> `@module-federation/node@2.7.21` -> `node-fetch@2.7.0`. |
| `lodash` | Upstream-blocked transitive dependency. | `@nx/expo` -> `@nx/detox` -> `detox@20.46.0` -> `lodash@4.18.1`; also `@nx/module-federation` -> `@module-federation/*` -> `@modern-js/utils` -> `lodash@4.18.1`; `jest-expo@54.0.16` also depends on `lodash@4.17.21`. |
| `moment@2.30.1` | Upstream-blocked transitive dependency. | `@nx/expo` -> `@nx/detox` -> `detox@20.46.0` -> `bunyan@1.8.15` -> `moment@2.30.1`; also via `bunyan-debug-stream` and `jest-environment-emit` / `bunyamin` / `bunyan@2.0.5`. |
| `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader` | Active transitive dependency, not orphaned lockfile cruft. | `drizzle-kit@0.31.9` -> `@esbuild-kit/esm-loader@2.6.5` -> `@esbuild-kit/core-utils@3.3.2`. Plain `pnpm why` output is empty, but `pnpm why --json` and the lockfile both identify the installed dependency path. |
| `@naxodev/nx-cloudflare` | Direct root dev dependency; retained. | Root `package.json` has `@naxodev/nx-cloudflare@^5.0.0`; installed version is `5.0.2`. |
| `next@14.2.35` | Upstream-blocked transitive dependency. | `@naxodev/nx-cloudflare@5.0.2` -> `next@14.2.35`. The lockfile also includes peer-resolution strings involving `inngest` / `@inngest/test`, but `pnpm why next` points to the Nx Cloudflare plugin chain. |
| `react-native-markdown-display@7.0.2` | Direct mobile dependency; not a removal target. | `apps/mobile/package.json` keeps `react-native-markdown-display@^7.0.2`; `pnpm --filter @eduagent/mobile why react-native-markdown-display` reports it as a direct mobile dependency. |

## Commands

The audit used these commands from the `WI-1181` worktree:

```powershell
pnpm install
pnpm why node-fetch
pnpm why lodash
pnpm why moment
pnpm why @esbuild-kit/core-utils
pnpm why @esbuild-kit/esm-loader
pnpm why @esbuild-kit/core-utils --json
pnpm why @esbuild-kit/esm-loader --json
pnpm why @naxodev/nx-cloudflare
pnpm why next
pnpm why react-native-markdown-display
pnpm --filter @eduagent/mobile why react-native-markdown-display
```

## Lockfile outcome

No dependency lockfile cleanup was available in this slice. The package manager did not remove `@esbuild-kit/*` because those entries are still required by `drizzle-kit`, and the remaining flagged dependencies are live upstream transitive dependencies.
