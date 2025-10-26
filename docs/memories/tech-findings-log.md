---
title: Technical Findings Log
purpose: Record technical decisions, empirical findings, troubleshooting patterns, and non-obvious constraints to guide AI agents and developers
audience: AI agents, developers, architects
created: 2025-10-20
last-updated: 2025-10-21
Last-Modified: 2025-10-21T17:45
Created: 2025-10-20T13:31
Modified: 2025-10-25T21:04
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

### [TypeScript Configuration] - OpenAPI Type Generation for API Client - 2025-10-23

**Decision:** Use OpenAPI spec generation to create TypeScript types in api-client package (no imports from server app)

**Context:**
The `api-client` library package needs TypeScript types that match the server API for end-to-end type safety. With REST+OpenAPI architecture, types are generated from OpenAPI spec rather than imported from server application.

**Alternatives Considered:**

1. **Import types from server using relative paths (oRPC/tRPC pattern)**
   - Rejected: Only works for RPC frameworks with shared router type
   - REST APIs don't export single router type - they have individual route handlers

2. **Manually duplicate types in api-client**
   - Rejected: Violates DRY principle, causes type drift

3. **Use TypeScript Project References**
   - Rejected: Creates coupling between server and client packages

**Chosen Approach:** Generate TypeScript client and types from OpenAPI spec using `openapi-typescript`

**Technical Rationale:**

**Type Generation Pipeline:**
```
Server Routes (Zod schemas) → OpenAPI Spec → openapi-typescript → Generated Types → API Client Factory
```

**Implementation Details:**
- Location: `packages/api-client/`
- Generated output: `packages/api-client/src/generated/`
- Build command: `pnpm --filter @nx-monorepo/api-client run generate-client`


**Warning Signs (for AI agents):**

❌ Do NOT suggest importing types from server with relative paths
- REST APIs don't have single router type to import

✅ DO recognize OpenAPI spec generation is standard for REST APIs
- Same as GraphQL codegen, gRPC protobuf compilation

✅ DO suggest regenerating client after server API changes
- Run `pnpm --filter @nx-monorepo/api-client run generate-client`

**References:**
- [OpenAPI Specification](https://spec.openapis.org/oas/v3.1.0)
- [openapi-typescript](https://openapi-ts.pages.dev/)
- [zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi)
- Pattern established: Phase 2 Slice 2-3 planning (2025-10-23)

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
   rm -rf dist/apps/server     # Remove stale build outputs
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
  rm -rf dist/apps/server
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

### [TypeScript Configuration] - Next.js TypeScript Project References Incompatibility - 2025-10-21

**Finding:** Next.js applications cannot use TypeScript Project References due to fundamental incompatibility between `noEmit: true` (required by Next.js) and `composite: true` (required by Project References)

**Context:**
During implementation of CI typecheck infrastructure (Stage 3.5), discovered that web app lacks auto-inferred typecheck target despite having `tsconfig.json`. Investigation revealed that the `@nx/js/typescript` plugin only auto-infers typecheck for projects using TypeScript Project References structure (`tsconfig.app.json` or `tsconfig.lib.json`), not for apps with single `tsconfig.json`.

Further research uncovered that Next.js apps **cannot** use Project References even if we wanted to restructure them.

**Root Cause Investigation:**

**TypeScript Project References requirements:**
- `composite: true` enables project references
- `declaration: true` generates .d.ts files (enforced by composite)
- `noEmit: false` allows TypeScript to emit files (required for .d.ts)

**Next.js requirements:**
- `noEmit: true` because Next.js handles compilation via SWC/Turbopack
- TypeScript only used for type-checking, not code generation
- Build outputs managed by Next.js build system, not tsc

**The incompatibility:**
```
TypeScript Project References: composite: true → requires noEmit: false
Next.js:                       requires noEmit: true
Result:                        Cannot use both
```

**Alternatives Investigated:**

1. **Force Next.js to use Project References**
   - Tested: Setting `composite: true` with `noEmit: true`
   - Result: TypeScript compilation error - "composite projects must have declaration: true and noEmit: false"
   - Rejected: Fundamental incompatibility

2. **Remove noEmit: true from Next.js apps**
   - Problem: Next.js compilation would conflict with TypeScript outputs
   - Problem: Next.js build system expects to manage all outputs
   - Rejected: Breaks Next.js build pipeline

3. **Convert entire workspace away from Project References**
   - Problem: Lose significant build performance for Node.js apps and libraries
   - Problem: Against Nx 20+ best practices
   - Rejected: Degrades workspace for all projects to accommodate one framework

**Chosen Approach:**
Framework-specific patterns - Next.js apps use single tsconfig.json with manual typecheck target, Node.js apps use Project References with auto-inferred typecheck.

**Implementation:**
- Next.js apps: Add `project.json` with manual typecheck target (`tsc --noEmit`)
- Node.js apps: Use Project References (auto-inferred by plugin)
- Documented in `adopted-patterns.md` as Pattern 4

**Why This Works:**

This is not pattern drift - it's **intentional framework-specific configuration**:
- Pattern determined by app framework (Next.js vs Node.js)
- Clear boundaries (compilation model differences)
- Minimal variations (only 2 patterns needed)
- Well-documented rationale (prevents confusion)

**Empirical Findings:**

**From StackOverflow (Aug 2024):**
> "NextJS needs `noEmit: true` because it handles code transpilation internally, but TypeScript only allows `noEmit: false` when using project references with `composite: true`"

**From GitHub TypeScript Issues (Nov 2024):**
Discussion of Vite and other bundler-based tools having same issue - any framework that handles its own compilation cannot use Project References.

**From Vercel Community:**
Confirms Next.js + TypeScript monorepo best practices avoid Project References, use single tsconfig.json per app.

**Warning Signs (for AI agents):**

❌ **Do not suggest** converting Next.js apps to use TypeScript Project References
- **Why:** Incompatible with `noEmit: true` - will cause compilation errors
- **What will happen:** TypeScript error: "composite projects must emit declaration files"

❌ **Do not suggest** this is pattern drift that needs "fixing"
- **Why:** Different frameworks have different compilation models
- **What's correct:** Framework-specific patterns are intentional

❌ **Do not suggest** removing `noEmit: true` from Next.js apps
- **Why:** Breaks Next.js build pipeline
- **What will happen:** Build conflicts, duplicate outputs, broken production builds

✅ **Do recognize** that future Next.js apps need manual typecheck configuration
- Check post-generation-checklist.md after running `nx g @nx/next:app`

✅ **Do recognize** that React Native (Expo) will likely follow same pattern
- Expo uses Metro bundler, similar compilation model to Next.js
- Will validate in Phase 2 when mobile app is added

✅ **Do apply** Project References pattern to Node.js/Express apps
- Node.js apps benefit from Project References build performance
- Auto-inferred typecheck works correctly

**References:**
- StackOverflow: [TypeScript composite project with NextJS](https://stackoverflow.com/questions/78907727/typescript-composite-project-with-nextjs) (Aug 2024)
- GitHub: [TypeScript #60465 - Referenced projects composite requirement](https://github.com/microsoft/TypeScript/issues/60465) (Nov 2024)
- Vercel Community: [Next.js in TypeScript monorepo best practices](https://community.vercel.com/t/best-practices-on-using-next-js-in-a-typescript-monorepo/7131)
- Nx Blog: [Nx 20 TypeScript Project References](https://edbzn.dev/nx-20-exploring-the-new-ts-preset-and-typescript-project-references/)
- Research: Sequential Thinking + Exa + Context7 + Nx MCP deep investigation (2025-10-21)
- Implementation: `apps/web/project.json` (2025-10-21)

---

## [Testing] - Jest Workspace Package Resolution (ESM/CommonJS) - 2025-10-25

**Problem:** Server tests (CommonJS) failed with "Unexpected token 'export'" when importing from `@nx-monorepo/schemas` package (ESM). Jest was loading compiled dist/index.js instead of source TypeScript files.

**Context:**
- Server builds as CommonJS (`format: "cjs"` in esbuild config)
- Schemas package is ESM (`"type": "module"` in package.json)
- Schemas package exports have `"@nx-monorepo/source": "./src/index.ts"` condition
- Jest's default resolver loaded from `dist/index.js` (ESM) which failed to parse in CommonJS context

**Root Cause:**
1. Jest resolved `@nx-monorepo/schemas` to dist/index.js (ESM output)
2. Jest's CommonJS runtime couldn't parse ESM export statements
3. ts-jest transformer only processed files included in tsconfig.spec.json
4. Nx's @nx-monorepo/source export condition wasn't being used by Jest's resolver

**Attempted Fixes (Failed):**
1. `transformIgnorePatterns: ['node_modules/(?!(@nx-monorepo)/)']` - Didn't change resolution path
2. `customExportConditions` in Jest config - Not a valid Jest option (only works in testEnvironmentOptions)
3. `moduleNameMapper` alone - Resolved to source but ts-jest didn't transform it
4. Adding workspace packages to tsconfig.spec.json includes - Source loaded but still not transformed

**Solution (3 Parts):**

1. **Configure Node export conditions** in jest.config.cjs:
```javascript
testEnvironmentOptions: {
  customExportConditions: ['@nx-monorepo/source', 'node', 'require', 'default'],
}
```
This tells Node's module resolver to prefer the `@nx-monorepo/source` export condition, loading `src/index.ts` instead of `dist/index.js`.

2. **Switch to @swc/jest transformer**:
```javascript
transform: {
  '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
}
```
@swc/jest transforms all TypeScript files uniformly without respecting tsconfig includes. This is simpler and more reliable for workspace packages than ts-jest.

3. **Convert jest.config to .cjs**:
- Renamed from `jest.config.ts` to `jest.config.cjs`
- Avoids ESM `__dirname is not defined` error
- Matches pattern used in api-client package

**Files Changed:**
- `apps/server/jest.config.cjs` - New config with swc/jest and export conditions
- `apps/server/.spec.swcrc` - New SWC configuration for test transformation
- `apps/server/tsconfig.spec.json` - Restored to include all src files (for proper type checking)

**Pattern for Future Projects:**

When a Node.js project needs to import workspace packages that are ESM:

1. Use `.cjs` extension for jest.config to avoid ESM issues
2. Configure testEnvironmentOptions with custom export conditions:
   ```javascript
   testEnvironmentOptions: {
     customExportConditions: ['@nx-monorepo/source', 'node', 'require', 'default'],
   }
   ```
3. Use @swc/jest instead of ts-jest for simpler transformation:
   ```javascript
   const swcJestConfig = JSON.parse(readFileSync(`${__dirname}/.spec.swcrc`, 'utf-8'));
   swcJestConfig.swcrc = false;

   transform: {
     '^.+\\.[tj]s$': ['@swc/jest', swcJestConfig],
   }
   ```
4. Create `.spec.swcrc` with standard TypeScript parser config

**Why This Works:**
- `customExportConditions` makes Node load source files via `@nx-monorepo/source` condition
- @swc/jest transforms all .ts files it encounters (no tsconfig restrictions)
- Source TypeScript is transformed before Jest runs it
- No ESM/CommonJS mismatch because we never load the ESM dist output

**Validation:**
- ✅ Server tests pass (including integration tests with supertest)
- ✅ Type checking passes (tsconfig.spec.json includes all source files)
- ✅ All quality gates pass (lint, test, build, typecheck)

**References:**
- Node.js: [Conditional exports](https://nodejs.org/api/packages.html#conditional-exports)
- Jest: [testEnvironmentOptions](https://jestjs.io/docs/configuration#testenvironmentoptions-object)
- @swc/jest: [SWC Jest transformer](https://swc.rs/docs/usage/jest)
- Implementation: `apps/server/jest.config.cjs`, `apps/server/.spec.swcrc` (2025-10-25)
- Investigation: Sequential Thinking + troubleshooting session (2025-10-25)

---

## Future Entries

[Add new technical findings below using the template above]

