**What was done:**
Upgraded the resolved Vitest toolchain path for WI-1023 by pinning Vitest to 3.2.6, the patched floor for CVE-2026-47429.

**What changed:**
Added `vitest: 3.2.6` to the root devDependencies and pnpm overrides. Updated `pnpm-lock.yaml` so the `@nx/react -> @nx/vite -> @nx/vitest` peer path resolves to `vitest@3.2.6` and all `@vitest/*` packages resolve at 3.2.6. No app/runtime source files changed.

**Verification:**
- `pnpm install --frozen-lockfile --offline` passed.
- Focused `pnpm audit --json` extraction returned `NO_VITEST_CVE_2026_47429`.
- `pnpm list vitest -r --depth 20` showed root `vitest 3.2.6` and all Nx peer paths resolving to `vitest 3.2.6`.
- Lockfile grep found no `vitest@3.2.4`, `@vitest/*@3.2.4`, or `vitest: 3.2.4`.
- `pnpm run check:root-deps` passed.
- `pnpm exec vitest --version` reported `vitest/3.2.6 win32-x64 node-v22.22.3`.
- `pnpm exec nx --version`, `pnpm exec nx report`, and `pnpm exec nx show projects` passed as representative Nx/tooling smoke checks.
- `git diff --check` passed.

**Caveats / Follow-ups:**
Full mobile Jest was not used as the targeted gate. Earlier `pnpm exec nx run-many -t test` passed all targets except `@eduagent/mobile:test`, where one suite failed to run due to a generated `node_modules` missing-file issue; after reinstall repair, `pnpm test:mobile:unit` hit the 20-minute tool timeout. This WI is dependency-tooling scoped, and the focused dependency/security gates above are the completion evidence.
