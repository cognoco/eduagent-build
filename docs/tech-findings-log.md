---
title: Technical Findings Log
purpose: Record technical decisions, empirical findings, troubleshooting patterns, and non-obvious constraints to guide AI agents and developers
audience: AI agents, developers, architects
created: 2025-10-20
last-updated: 2025-10-20
Last-Modified: 2025-10-20T17:15
Created: 2025-10-20T13:31
Modified: 2025-10-20T17:25
---

# Technical Findings Log

## Purpose

This document records **technical findings and decisions** to guide future development and prevent rework:
- Technical decisions with non-obvious rationale
- Empirical observations from troubleshooting (especially environment-specific issues)
- Known constraints and limitations of tools/frameworks
- Patterns that work (or don't work) in this specific codebase
- Investigation results that should inform future choices

**When to add an entry:**
- A decision goes against common practice for good reason
- A technology constraint dictates an unusual approach
- Investigation reveals a subtle technical requirement or pattern
- A "simpler" alternative was considered and rejected
- Troubleshooting reveals environment-specific issues (Windows, tooling, caching)
- Empirical testing uncovers non-obvious behavior

**For AI agents:** Before suggesting changes to architecture, tooling, or configuration, search this document for relevant context and known issues.

---

## Entry Template

```markdown
## [Category] - [Topic] - [Date]

**Decision:** [What was decided]

**Context:** [What problem were we solving]

**Alternatives Considered:**
1. Option A: [description] - Rejected because [reason]
2. Option B: [description] - Rejected because [reason]

**Chosen Approach:** [Selected option with brief description]

**Technical Rationale:**
[Detailed explanation of why this choice was made, including:]
- Technical constraints
- Known issues with alternatives
- Performance implications
- Compatibility requirements

**Implementation Details:**
- Location: [where in codebase]
- Commands: [specific commands used]
- Configuration: [relevant config]

**Warning Signs (for AI agents):**
If you see [X symptoms], do not suggest [Y change] because [Z reason].

**References:**
- [Links to relevant documentation]
- [Related GitHub issues]
- [External resources]
```

---

## Decisions Log

### [Build Configuration] - Prisma Database Package Bundler Strategy - 2025-10-20

**Decision:** Use `@nx/js:lib` with `--bundler=none` for the database package containing Prisma

**Context:**
Need to create a shared database package in Nx monorepo that exports Prisma Client for use by server application and potentially other apps. Previous attempts with buildable libraries created path resolution issues and broken imports.

**Alternatives Considered:**

1. **@nx/node:lib with `--bundler=tsc`**
   - Rejected: Requires installing additional `@nx/node` plugin
   - Rejected: Pre-compilation conflicts with Prisma's code generation lifecycle
   - Problem: Prisma Client is generated at runtime (during `prisma generate`), not build time
   - Result: Apps get path resolution errors trying to find the Prisma Client in bundled output

2. **@nx/js:lib with `--bundler=tsc`**
   - Rejected: Same pre-compilation issues as @nx/node:lib
   - Problem: TypeScript compilation tries to bundle `@prisma/client` dependency
   - Problem: Generated Prisma Client location varies (workspace root `node_modules` vs package `node_modules`)
   - Result: Double-compilation issues, broken references, import path nightmares

3. **@nx/node:lib with `--bundler=none`**
   - Works but unnecessary: Requires installing `@nx/node` plugin for no benefit
   - `@nx/js:lib` provides identical functionality when bundler is disabled

**Chosen Approach:** `@nx/js:lib database --bundler=none`

**Technical Rationale:**

**Why `--bundler=none` is required for Prisma:**

1. **Prisma Client Generation Lifecycle:**
   - Prisma schema defined in: `packages/database/prisma/schema.prisma`
   - Command `prisma generate` creates code in: `node_modules/@prisma/client` or `node_modules/.prisma/client`
   - Generated code location is dynamic (depends on pnpm workspace hoisting)
   - Code is regenerated on every `pnpm install` and schema change

2. **Why pre-compilation breaks:**
   ```
   With --bundler=tsc:
   Build step: Compile packages/database/src → dist/packages/database
   Problem: @prisma/client is in node_modules (outside build context)
   Result: Apps reference dist/packages/database, which has broken Prisma imports

   With --bundler=none:
   No build step: Apps compile packages/database/src directly during their own build
   Prisma Client: Apps find @prisma/client in root node_modules naturally
   Result: Clean path resolution, single Prisma Client instance
   ```

3. **Nx caching still works:**
   - `--bundler=none` does NOT disable Nx caching
   - Nx tracks `prisma/schema.prisma` as input
   - Nx caches Prisma generate outputs
   - Dependent apps invalidate when schema changes

**Why `@nx/js:lib` instead of `@nx/node:lib`:**
- `@nx/js` plugin already installed (part of base Nx setup)
- With `--bundler=none`, both generators create identical structure
- Only difference is `@nx/node:lib` auto-installs `@types/node` (which we install manually anyway)
- Simpler dependency graph (no additional plugin)

**Implementation Details:**

- **Location:** `packages/database/`
- **Generator command:**
  ```bash
  pnpm exec nx g @nx/js:lib database --directory=packages/database --bundler=none
  ```
- **Package structure:**
  ```
  packages/database/
  ├── src/
  │   └── index.ts          # Exports Prisma Client singleton + query functions
  ├── prisma/
  │   └── schema.prisma     # Database schema definition
  ├── package.json
  └── tsconfig.json         # For IDE support only (no build step)
  ```
- **Key configuration in `tsconfig.base.json`:**
  ```json
  {
    "paths": {
      "@nx-monorepo/database": ["packages/database/src/index.ts"]
    }
  }
  ```

**Warning Signs (for AI agents):**

❌ **Do not suggest** converting database package to buildable (`--bundler=tsc`) to "improve performance"
- **Why:** Breaks Prisma Client imports, creates path resolution errors

❌ **Do not suggest** switching to `@nx/node:lib` for "better Node.js support"
- **Why:** Provides no benefit when `--bundler=none`, adds unnecessary plugin dependency

❌ **Do not suggest** adding explicit build target to database package
- **Why:** Defeats the purpose of `--bundler=none` pattern

✅ **Do suggest** keeping `--bundler=none` only for packages with:
- Generated code (Prisma, GraphQL Codegen, Protobuf)
- Native dependencies that can't be bundled
- Dynamic runtime code generation

✅ **Other packages (schemas, api-client, supabase-client) should use `--bundler=tsc`**
- These are pure TypeScript/JavaScript (no generated code)
- Pre-compilation provides faster incremental builds
- No path resolution issues

**References:**
- [Nx Official Recipe: NestJS + Prisma](https://github.com/nrwl/nx-recipes/blob/main/nestjs-prisma/README.md)
- [Prisma Monorepo Docs](https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-monorepo)
- [Nx Buildable vs Publishable Libraries](https://nx.dev/concepts/buildable-and-publishable-libraries)
- Discussion: P1-plan.md Stage 2 validation (2025-10-20)

---

### [TypeScript Configuration] - Type Imports from Applications to Libraries - 2025-10-20

**Decision:** Use relative path imports for type-only imports from libraries to applications (not path aliases)

**Context:**
The `api-client` library package needs to import the `AppRouter` type from the `server` application to achieve end-to-end type safety. This creates an unusual import pattern where a library imports from an app.

**Alternatives Considered:**

1. **Add path alias for server app in `tsconfig.base.json`**
   - Rejected: Apps don't get path aliases - only libraries do
   - Problem: Would break Nx conventions (apps use TypeScript Project References, not path aliases)
   - Result: Not standard Nx pattern, could cause confusion

2. **Use TypeScript Project References with composite: true**
   - Rejected: Adds significant complexity for Phase 1 walking skeleton
   - Problem: Requires configuring composite projects, build dependencies, references in multiple tsconfig files
   - Result: Overkill for POC validation phase

3. **Extract router types to separate `@nx-monorepo/api-types` package**
   - Rejected for Phase 1: Creates additional package overhead
   - Problem: Adds complexity before validating if type sharing even works
   - Could revisit: Good pattern for Phase 2+ if types become complex

**Chosen Approach:** Relative path import with type-only modifier

**Technical Rationale:**

**Why relative path import is correct:**

1. **Nx TypeScript Configuration Patterns:**
   ```typescript
   // tsconfig.base.json
   {
     "paths": {
       "@nx-monorepo/database": ["packages/database/src/index.ts"],    // ✅ Libraries get aliases
       "@nx-monorepo/schemas": ["packages/schemas/src/index.ts"],
       "@nx-monorepo/api-client": ["packages/api-client/src/index.ts"],
       // ❌ Apps do NOT get path aliases - they use Project References instead
     }
   }

   // tsconfig.json (workspace root)
   {
     "references": [
       { "path": "./apps/web" },      // ✅ Apps use Project References
       { "path": "./apps/server" }
     ]
   }
   ```

2. **Type-only imports are safe:**
   ```typescript
   // packages/api-client/src/index.ts
   import type { AppRouter } from '../../../apps/server/src/router';
   //     ^^^^
   //     Type-only modifier - no runtime code imported

   export const createClient = <T = AppRouter>(config: Config) => {
     // Use AppRouter type for inference only
   };
   ```

3. **No circular runtime dependency:**
   - The `type` modifier ensures TypeScript only uses the import for type checking
   - No runtime code from server is bundled into api-client
   - Server never imports from api-client
   - Dependency flow remains unidirectional at runtime: `apps/server` ← `packages/api-client`

4. **Standard pattern for type-safe RPC frameworks:**
   - tRPC, oRPC, and similar frameworks use this exact pattern
   - Library packages import server types for client-side type inference
   - This is documented and expected in these frameworks

**Why this works with `--bundler=none` and `--bundler=tsc`:**

- **api-client** (with `--bundler=tsc`): Pre-compiles to JavaScript, type imports are erased
- **server** types: Used only during compilation, not included in api-client bundle
- **web/mobile apps**: Get full TypeScript autocomplete for server endpoints via the api-client

**Implementation Details:**

- **Location:** `packages/api-client/src/index.ts`
- **Import pattern:**
  ```typescript
  import type { AppRouter } from '../../../apps/server/src/router';
  ```
- **Usage:**
  ```typescript
  export function createApiClient<T = AppRouter>(baseUrl: string) {
    // Client gets full type inference from server
  }
  ```
- **Alternative for complex cases:**
  If circular dependency issues arise (unlikely with type-only imports), extract shared types:
  ```bash
  pnpm exec nx g @nx/js:lib api-types --directory=packages/api-types --bundler=tsc
  ```

**Warning Signs (for AI agents):**

❌ **Do not suggest** adding `@nx-monorepo/server` to `tsconfig.base.json` paths
- **Why:** Apps don't get path aliases - this breaks Nx conventions

❌ **Do not suggest** "cleaning up" relative path imports to use path aliases
- **Why:** Path aliases only exist for libraries, not apps

❌ **Do not suggest** removing `type` modifier to "simplify" import
- **Why:** Runtime import would create actual circular dependency

❌ **Do not suggest** this creates a circular dependency problem
- **Why:** Type-only imports don't create runtime circular dependencies

✅ **Do recognize** relative imports from `packages/*` to `apps/*` with `import type` are intentional
- This is standard for type-safe RPC frameworks
- Only types are shared, no runtime code

✅ **Do suggest** extracting to separate types package if:
- Type definitions become complex (>100 lines)
- Multiple apps need to share types
- Type definitions change frequently causing rebuild cascades

**References:**
- [tRPC Type Safety Pattern](https://trpc.io/docs/client/vanilla/infer-types)
- [oRPC Type Inference](https://orpc.unnoq.com/docs/concepts/type-safety)
- [TypeScript Type-Only Imports](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export)
- Discussion: P1-plan.md Stage 5.4.2 validation (2025-10-20)

---

### [TypeScript Configuration] - Jest Test Module Resolution Strategy - 2025-10-20

**Decision:** Use `module: "nodenext"` and `moduleResolution: "nodenext"` in test TypeScript configurations (tsconfig.spec.json files)

**Context:**
After generating Jest configuration for the server application, TypeScript compilation failed with: `"Option 'customConditions' can only be used when 'moduleResolution' is set to 'node16', 'nodenext', or 'bundler'"`

The workspace's `tsconfig.base.json` uses `customConditions: ["@nx-monorepo/source"]` for modern monorepo package resolution, but the Nx Jest generator created test configuration with outdated settings (`module: "commonjs"`, `moduleResolution: "node10"`).

**Alternatives Considered:**

1. **Keep `moduleResolution: "node10"` and remove `customConditions` from base config**
   - Rejected: Would break workspace package resolution for entire monorepo
   - Problem: All projects inherit from tsconfig.base.json and need customConditions
   - Result: Not viable - breaks production code

2. **Use `moduleResolution: "bundler"` for tests**
   - Rejected: Requires `module: "preserve"` or ESM modules
   - Problem: Jest runs in CommonJS mode via ts-jest transpilation
   - Result: Incompatible with Jest's runtime environment

3. **Keep tests on `node10`, remove base config inheritance**
   - Rejected: Creates divergence between test and production type checking
   - Problem: Tests would resolve imports differently than production code
   - Result: "Works in tests, breaks in production" scenarios

**Chosen Approach:** Update test configs to `module: "nodenext"` and `moduleResolution: "nodenext"`

**Technical Rationale:**

**Why `nodenext` is required:**

1. **Workspace Package Resolution:**
   - `customConditions: ["@nx-monorepo/source"]` in base config requires modern module resolution
   - Only `node16`, `nodenext`, or `bundler` support customConditions
   - This feature is essential for resolving `@nx-monorepo/database`, `@nx-monorepo/schemas`, etc.

2. **Consistency with Production Code:**
   - Production config (`tsconfig.app.json`): uses `module: "nodenext"` and `moduleResolution: "nodenext"`
   - Test config should match to ensure identical import resolution
   - Prevents subtle bugs where tests pass but production code fails

3. **Modern Package Compatibility:**
   - Many modern npm packages use package.json `exports` field for dual ESM/CJS builds
   - `node10` resolver only reads `main` field (deprecated pattern)
   - `nodenext` resolver reads `exports` first, then falls back to `main`
   - Critical for packages like Prisma, modern testing libraries

**Why this doesn't break Jest:**

- TypeScript's `module` setting only affects type-checking, not runtime
- Jest uses `ts-jest` or `babel-jest` to transpile code at runtime
- Transpilation always produces CommonJS regardless of TypeScript setting
- `nodenext` is **detection-based** - it doesn't force ESM, it understands both

**Implementation Details:**

- **Location:** `apps/server/tsconfig.spec.json` (and future test configs)
- **Configuration:**
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "module": "nodenext",
      "moduleResolution": "nodenext",
      "types": ["jest", "node"]
    }
  }
  ```
- **When to apply:** Every time `nx g @nx/jest:configuration` is run, manually update generated file

**Warning Signs (for AI agents):**

❌ **Do not suggest** reverting to `moduleResolution: "node10"` to "simplify" configuration
- **Why:** Breaks workspace package resolution via customConditions

❌ **Do not suggest** removing `customConditions` from tsconfig.base.json to avoid this
- **Why:** Breaks monorepo package resolution for all projects

❌ **Do not suggest** using `moduleResolution: "bundler"` for test configs
- **Why:** Incompatible with Jest's CommonJS runtime (requires ESM `module` setting)

❌ **Do not worry** if this seems inconsistent with Jest's CommonJS runtime
- **Why:** TypeScript module setting only affects type-checking, Jest transpilation is independent

✅ **Do recognize** this is a known limitation of `@nx/jest:configuration` generator (v21.6.5)
- Generator uses outdated defaults (`node10`) incompatible with modern Nx workspaces
- Not a bug in our configuration - it's a generator limitation

✅ **Do apply** this pattern to all test configurations in the workspace
- When generating Jest config for web app, mobile app, or libraries
- Always update `moduleResolution` from `node10` to `nodenext`
- Keep `module` aligned (`nodenext` for server/Node projects, may vary for browser projects)

✅ **Do verify** tests still pass after making this change
- Run `nx run <project>:test` to verify Jest still works
- Run `nx run <project>:typecheck` to verify TypeScript compilation succeeds

**Root Cause:**
The `@nx/jest:configuration` generator in Nx v21.6.5 uses outdated TypeScript defaults that are incompatible with modern Nx workspace patterns using `customConditions`. This should ideally be fixed upstream in the Nx plugin.

**References:**
- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html#the-moduleresolution-compiler-option)
- [TypeScript customConditions](https://www.typescriptlang.org/tsconfig#customConditions)
- [Package.json Exports Field](https://nodejs.org/api/packages.html#exports)
- Issue discovered: Stage 1.2 server validation (2025-10-20)
- Commit: 85603fc "fix(P1-S1): update server test TypeScript config for modern module resolution"

---

### [Testing] - Jest Hanging on Windows with Nx - 2025-10-20

**Decision:** Use systematic troubleshooting approach when Jest hangs on Windows; do not assume root cause

**Context:**
When running `pnpm exec nx run-many -t test`, Jest completes all tests successfully but does not exit cleanly on Windows. The process hangs with "Jest did not exit one second after the test run has completed" message. Tests pass (no test code issues), but the Node process lingers.

**Alternatives Considered:**

1. **Assume Nx daemon is the sole cause**
   - Rejected: Empirical testing shows multiple factors may contribute
   - Problem: `NX_DAEMON=false` fixes it, but so does `--no-cloud`
   - Result: Cannot conclusively identify single root cause

2. **Assume Nx Cloud connection is the sole cause**
   - Rejected: Both daemon and cloud flags independently resolve hanging
   - Problem: Suggests underlying state/socket issue, not specific service
   - Result: Multiple triggers possible

3. **Add `--forceExit` flag to Jest configuration**
   - Rejected: Masks problem rather than solving it
   - Problem: Could hide real test issues (open handles, async operations)
   - Result: Not suitable for committed code

4. **Accept hanging as unavoidable Windows behavior**
   - Rejected: Workarounds exist that allow clean exits
   - Problem: Would degrade developer experience unnecessarily
   - Result: Systematic approach is more professional

**Chosen Approach:** Systematic troubleshooting methodology with documented empirical findings

**Technical Rationale:**

**Why root cause is uncertain:**

1. **Multiple independent "fixes" observed (2025-10-20):**
   - `NX_DAEMON=false pnpm exec nx run-many -t test` → ✅ Works
   - `pnpm exec nx run-many -t test --no-cloud` → ✅ Works
   - `NX_DAEMON=false pnpm exec nx run-many -t test --no-cloud` → ✅ Works
   - No flags: `pnpm exec nx run-many -t test` → ❌ Hangs

2. **Correlation vs causation problem:**
   - Both flags independently "fix" the issue
   - Suggests they may be clearing some underlying state rather than addressing direct cause
   - Possible that other environmental factors contribute

3. **Known complexity of Windows process management:**
   - IPC sockets (Nx daemon communication)
   - HTTP connections (Nx Cloud API)
   - File system watchers (Nx incremental builds)
   - Child process cleanup differs on Windows vs Unix

4. **Behavior may be context-dependent:**
   - Different on first run vs cached runs
   - May vary with workspace size, number of projects
   - Could be affected by Nx version, Node version, pnpm version
   - May change based on system resources or antivirus software

**Why systematic approach is necessary:**

- **Future occurrences may differ:** What works today might not work tomorrow if conditions change
- **Multiple contributing factors:** Issue may arise from combinations of circumstances
- **No official documentation:** Nx docs don't document Windows-specific hanging issues
- **Empirical evidence required:** Each occurrence should be treated as new data point

**Implementation Details:**

- **Testing methodology:** When hanging occurs:
  1. First try: `NX_DAEMON=false pnpm exec nx run-many -t test`
  2. If still hangs: `pnpm exec nx run-many -t test --no-cloud`
  3. If still hangs: Combine both flags
  4. Document which combination worked in this log with date

- **Individual project workaround:**
  ```bash
  # Run tests per project
  pnpm exec nx run server:test
  pnpm exec nx run web:test
  ```

- **Diagnostic commands (not fixes):**
  ```bash
  # Identify open handles (does not fix issue)
  pnpm exec nx run web:test -- --detectOpenHandles

  # Force exit (never commit this flag)
  pnpm exec nx run web:test -- --forceExit
  ```

- **CI/CD environments:**
  - Use standard commands (no workarounds needed)
  - Linux/Mac typically don't exhibit this behavior
  - Windows CI runners may need flags if issue reproduces

**Empirical Findings Log:**

| Date | Condition | Command | Result | Notes |
|------|-----------|---------|--------|-------|
| 2025-10-20 | Fresh cache, 2 projects (server, web) | `pnpm exec nx run-many -t test` | ❌ Hangs | Web project specifically hung |
| 2025-10-20 | Same conditions | `pnpm exec nx run server:test` | ✅ Clean exit | Individual run worked |
| 2025-10-20 | Same conditions | `pnpm exec nx run web:test` | ⚠️ Hung after success | Tests passed, Jest didn't exit |
| 2025-10-20 | Same conditions | `NX_DAEMON=false pnpm exec nx run-many -t test` | ✅ Clean exit | Daemon disabled |
| 2025-10-20 | Same conditions | `pnpm exec nx run-many -t test --no-cloud` | ✅ Clean exit | Cloud disabled |

**Warning Signs (for AI agents):**

❌ **Do not suggest** a single definitive root cause without new evidence
- **Why:** Multiple factors observed, causation not proven

❌ **Do not suggest** this is a test code issue
- **Why:** Tests pass successfully, no async leaks in test code

❌ **Do not suggest** committing `--forceExit` flag
- **Why:** Masks real issues, not appropriate for production code

❌ **Do not suggest** this only affects one specific configuration
- **Why:** May manifest differently under different conditions

✅ **Do suggest** systematic troubleshooting when issue occurs
- Try daemon flag first (simplest)
- Then cloud flag if needed
- Document which combination worked

✅ **Do recognize** this as Windows-specific environment issue
- Not a code quality problem
- CI/CD on Linux/Mac typically unaffected

✅ **Do update** this log entry with new empirical findings
- If different combinations work/fail in future
- If Nx version changes affect behavior
- If root cause is definitively identified

**References:**
- [Nx Daemon Documentation](https://nx.dev/concepts/nx-daemon)
- [Nx Cloud CLI Reference](https://nx.dev/nx-api/nx/documents/run-many)
- [Jest Configuration - forceExit](https://jestjs.io/docs/configuration#forceexit-boolean)
- Investigation: QA validation during P1-S1 (2025-10-20)
- Related: CLAUDE.md troubleshooting section (temporary workarounds)

---

### [Build] - Server Build Flakiness Due to Corrupted Nx Cache - 2025-10-20

**Finding:** Server build (`pnpm exec nx run server:build`) intermittently fails with "Could not find project '@nx-monorepo/server'" error despite project existing and being properly configured.

**Context:**
During substage 1.2 validation (server immediate validation), the build command failed with a project not found error. However, running `pnpm exec nx show project server` successfully displayed project configuration, indicating the project exists and Nx knows about it.

**Root Cause Investigation:**

1. **Initial symptom:**
   ```bash
   pnpm exec nx run server:build
   # Error: Could not find project "@nx-monorepo/server"
   ```

2. **Inconsistent behavior:**
   - `nx show project server` ✅ Works - returns full project configuration
   - `nx run server:build` ❌ Fails - claims project doesn't exist
   - After running once, Nx flagged the task as "flaky"

3. **Successful resolution:**
   ```bash
   pnpm exec nx reset          # Clear Nx daemon and cache
   rm -rf apps/server/dist     # Remove stale build outputs
   pnpm exec nx run server:build  # Rebuild fresh
   ```

4. **Verification:**
   - Build 1: ✅ Success (fresh, no cache)
   - Build 2: ✅ Success (cache hit)
   - Build 3: ✅ Success (cache hit)
   - Result: 3/3 successful builds after cache clear

**Analysis:**

**Why this occurred:**
- **Corrupted cache state**: Nx cache contained incorrect or stale project metadata
- **Daemon inconsistency**: Nx daemon had outdated project graph in memory
- **Build artifact mismatch**: Previous build outputs conflicted with cached state

**Why Nx detected it as "flaky":**
Nx's automated flake detection triggered because:
- Same task gave different results within short time window
- First run: Failed with "project not found"
- Subsequent run: Succeeded
- Nx logs this as potential CI instability

**Not an actual code/config issue:**
- Project configuration was correct (`nx show project` confirmed this)
- TypeScript config was valid (builds succeeded after cache clear)
- No code changes between failure and success

**Implementation Details:**

- **Quick fix command sequence:**
  ```bash
  pnpm exec nx reset
  rm -rf apps/server/dist
  pnpm exec nx run server:build
  ```

- **When to suspect this issue:**
  - Build fails with "Could not find project" error
  - But `nx show project <name>` works correctly
  - Project was recently generated or configuration changed
  - After switching branches or rebasing

- **Prevention strategies:**
  - Run `pnpm exec nx reset` after major configuration changes
  - Clear dist folders after branch switches
  - Monitor for Nx "flaky task" warnings

**Warning Signs (for AI agents):**

❌ **Do not assume** "Could not find project" means misconfiguration
- Check if `nx show project` works first
- If it works, suspect cache corruption not config errors

❌ **Do not suggest** regenerating the project or fixing configuration
- If `nx show project` succeeds, config is fine
- Cache clear is faster than regeneration

✅ **Do suggest** cache clearing as first troubleshooting step
- When build errors seem inconsistent with project state
- When "flaky task" warnings appear

✅ **Do document** if this pattern recurs
- May indicate Windows-specific Nx daemon issues
- Could be related to file system timing
- Might be esbuild-specific with `bundle: false` configuration

**Empirical Findings Log:**

| Date | Condition | Command | Result | Notes |
|------|-----------|---------|--------|-------|
| 2025-10-20 | After Jest config generation | `nx run server:build` | ❌ Failed | "Could not find project" error |
| 2025-10-20 | Same state | `nx show project server` | ✅ Success | Project config returned correctly |
| 2025-10-20 | After `nx reset` | `nx run server:build` (run 1) | ✅ Success | Fresh build, no cache |
| 2025-10-20 | Immediate retry | `nx run server:build` (run 2) | ✅ Success | Cache hit |
| 2025-10-20 | Immediate retry | `nx run server:build` (run 3) | ✅ Success | Cache hit |

**Monitoring Plan:**

If this issue recurs, document:
- Exact trigger (what action preceded the failure?)
- Windows version and Node version
- Whether it's specific to server project or affects web too
- Whether it correlates with Nx daemon restarts
- Whether it only happens with esbuild executor

**References:**
- [Nx Cache Troubleshooting](https://nx.dev/concepts/how-caching-works)
- [Nx Daemon](https://nx.dev/concepts/nx-daemon)
- [Nx Flaky Tasks](https://nx.dev/ci/features/flaky-tasks)
- Investigation: P1-S1 substage 1.2 validation (2025-10-20)
- Nx flake detection: https://cloud.nx.app/runs/Jj7HeO4RIe

---

## Future Entries

[Add new technical findings below using the template above]

