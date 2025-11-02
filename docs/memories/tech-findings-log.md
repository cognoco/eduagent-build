---
title: Technical Findings Log
purpose: Record technical decisions, empirical findings, troubleshooting patterns, and non-obvious constraints to guide AI agents and developers
audience: AI agents, developers, architects
created: 2025-10-20
last-updated: 2025-10-27
Last-Modified: 2025-10-21T17:45
Created: 2025-10-20T13:31
Modified: 2025-10-28T20:29
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

1. **Import types from server using relative paths (RPC framework pattern)**
   - Rejected: Only works for RPC frameworks (like tRPC) with shared router type
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

## [Platform Compatibility] - Prisma Client on Windows ARM64 - 2025-10-27

**Finding:** Prisma Client (version 6.18.0) does not support Windows ARM64 architecture. Prisma CLI operations work, but runtime PrismaClient instantiation fails.

**Context:**
During Stage 4.4b Prisma implementation, programmatic smoke tests failed on Windows ARM64 with error: `query_engine-windows.dll.node is not a valid Win32 application`. All Prisma CLI commands (migrate, generate, validate, format, studio) worked correctly, but Node.js scripts using `@prisma/client` failed.

**Technical Details:**

**What Works on Windows ARM64:**
- ✅ Prisma CLI commands (migrate, generate, validate, format, studio)
- ✅ Schema management and migrations
- ✅ Database connectivity via SQL queries

**What Doesn't Work:**
- ❌ Prisma Client programmatic usage (PrismaClient instantiation)
- ❌ Node.js scripts using `@prisma/client`

**Root Cause:**
- Prisma detected platform as "windows" (x64) but runs on ARM64
- Binary architecture mismatch: query engine DLL is x64, system is ARM64
- Prisma Client auto-generated version (6.18.0) lacks Windows ARM64 support

**Verified Alternative Platforms:**
Prisma Client works correctly on:
- ✅ x64 Windows (Intel/AMD processors)
- ✅ x64 Linux (our CI/CD environment)
- ✅ x64 macOS (Intel Macs)
- ✅ ARM64 macOS (Apple Silicon)
- ✅ ARM64 Linux (Raspberry Pi, AWS Graviton)

**Workarounds:**

**For Local Development on Windows ARM64:**
1. **Use WSL2** (Windows Subsystem for Linux):
   ```bash
   wsl
   cd /mnt/c/path/to/project
   node packages/database/test-prisma-connection.mjs  # Works!
   ```

2. **Use Prisma Studio** for database inspection (works on ARM64):
   ```bash
   npx prisma studio --schema=packages/database/prisma/schema.prisma
   ```

3. **Rely on CI/CD** for Prisma Client testing (x64 Linux)

**CI/CD Verification:**
Our GitHub Actions CI runs on x64 Linux where Prisma Client is fully supported. Tests that fail locally on ARM64 Windows will pass in CI/CD.

**Stage 4.4b Impact:**
No blocking issue. Database setup is validated and functional. Prisma CLI operations (migrations, schema management) work perfectly on all platforms. Only programmatic smoke tests fail on ARM64 Windows, but the same tests pass in CI/CD.

**Implementation Details:**
- **Location**: `packages/database/PLATFORM-NOTES.md` (detailed documentation)
- **Smoke test**: `packages/database/test-prisma-connection.mjs` (includes run instructions and ARM64 warning)
- **Prisma versions**: CLI 6.17.1 (package.json), Client 6.18.0 (auto-generated)

**Warning Signs (for AI agents):**

❌ **Do not suggest** fixing this with different binaryTargets configuration
- **Why**: Windows ARM64 is fundamentally unsupported in Prisma Client 6.18.0

❌ **Do not suggest** this is a configuration error
- **Why**: It's a platform limitation, not user error

✅ **Do recognize** this is documented and acceptable
- Prisma CLI works for all development needs
- CI/CD validates Prisma Client functionality
- WSL2 available for local programmatic testing if needed

✅ **Do reference** `packages/database/PLATFORM-NOTES.md` for full details
- Comprehensive documentation of issue and workarounds
- Version information and detected environment details

**References:**
- Prisma GitHub Issues: Windows-arm64 support tracking
- Detected environment: Node.js v22.21.0 | arm64 | win32
- binaryTarget detected: "windows" (should be "windows-arm64" if supported)
- Implementation: Stage 4.4b Phase 7.5 (2025-10-27)
- Documentation: packages/database/PLATFORM-NOTES.md

---

## [Build Configuration] - Library Package Module Resolution for Next.js Imports - 2025-10-27

**Finding:** Library packages (tsconfig.lib.json) that import from Next.js must inherit `moduleResolution: "bundler"` from base config, not override with `"nodenext"`.

**Context:**
During PR #10 remediation, the `supabase-client` package failed to build with errors:
- `TS2307: Cannot find module 'next/headers'` (after adding 'next' dependency)
- `TS2304: Cannot find name 'window'`

The package imported from `next/headers` but TypeScript couldn't resolve the module even though 'next' was properly installed as a dependency.

**Root Cause:**
The package's `tsconfig.lib.json` explicitly set `"moduleResolution": "nodenext"`, overriding the base config's `"bundler"` setting. Next.js 15 uses legacy package structure (files at root like `headers.js`, `headers.d.ts`) without modern package.json "exports" field. The `"nodenext"` resolution is stricter and couldn't resolve Next.js's structure, while `"bundler"` resolution is more lenient and compatible.

**Technical Details:**

**What didn't work:**
```typescript
// packages/supabase-client/tsconfig.lib.json (BEFORE)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",           // ❌ Override
    "moduleResolution": "nodenext", // ❌ Override
    "types": ["node"]
  }
}
```

**What works:**
```typescript
// packages/supabase-client/tsconfig.lib.json (AFTER)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // ✅ Inherit "bundler" from base
    // (no module/moduleResolution override)
    "types": ["node"]
  }
}
```

**Why "bundler" resolution works:**
- More lenient with package structures
- Compatible with both modern exports and legacy file-based packages
- Matches our bundler-everywhere architecture (Next.js, esbuild, Metro)
- Allows extension-less imports

**Why "nodenext" resolution failed:**
- Stricter about ESM package structure
- Expects modern package.json "exports" field
- Next.js 15 uses legacy structure → resolution fails

**Additional Fix Required:**
Added type declaration for browser global:
```typescript
// Type declaration for browser global (package runs in both contexts)
declare const window: unknown | undefined;
```

This was needed because `"types": ["node"]` doesn't include DOM types, but the code checks `typeof window` for server/client detection.

**Pattern Alignment:**
This fix aligns with our documented Pattern 2 in `adopted-patterns.md`:
- **Base config**: `moduleResolution: "bundler"`
- **Production configs** (tsconfig.lib.json): Inherit from base (no override)
- **Test configs** (tsconfig.spec.json): `moduleResolution: "nodenext"`

**Applies To:**
Any library package that imports from Next.js or other packages with legacy structure:
- `packages/supabase-client/` (uses `next/headers`)
- Any future packages that import from Next.js APIs

**Warning Signs (for AI agents):**

❌ **Do not override** moduleResolution in tsconfig.lib.json unless there's specific need
- **Why**: Base "bundler" setting works for vast majority of cases

❌ **Do not add** DOM lib types to fix 'window' errors in library packages
- **Why**: Pollutes Node.js environment with browser globals
- **Instead**: Add local `declare const window` type declaration

✅ **Do inherit** moduleResolution from base config in production type configs
- Consistent with documented Pattern 2
- Compatible with modern and legacy package structures

✅ **Do add** 'next' as dependency if importing from Next.js
- Nx dependency-checks will enforce this
- Required even if 'next' exists in workspace root

**References:**
- PR #10 Issue #1 and #2 remediation
- docs/memories/adopted-patterns.md - Pattern 2 (TypeScript Module Resolution)
- packages/supabase-client/tsconfig.lib.json (corrected configuration)
- packages/supabase-client/src/lib/client.ts (window type declaration)

---

## [Git Configuration] - Husky Hook Line Endings on Windows - 2025-10-28

**Decision:** Force LF line endings for all files in `.husky/` directory using `.gitattributes`

**Context:**
On Windows with Git Bash, Husky pre-commit hooks were failing with exit code 127 ("command not found") even though lint-staged and tests completed successfully. Investigation revealed that `.husky/pre-commit` and `.husky/commit-msg` had CRLF line endings, causing Git Bash to interpret commands with trailing carriage return characters (`\r`), which don't exist as commands.

**Root Cause Analysis:**

1. **File encoding check** revealed: `.husky/pre-commit: ASCII text, with CRLF line terminators`
2. **Hex dump** showed `\r\n` at end of each line instead of just `\n`
3. **Git's core.autocrlf=true** on Windows was converting LF→CRLF on checkout
4. **Git Bash requires LF** for shell scripts to execute properly
5. Result: Shell tries to execute `pnpm\r` instead of `pnpm` → command not found

**Alternatives Considered:**

1. **Manually run dos2unix after each git pull**
   - Rejected: Not sustainable, requires manual intervention every time
   - Problem: Other developers would hit the same issue
   - Result: Doesn't scale, error-prone

2. **Disable core.autocrlf globally**
   - Rejected: Affects all repositories, not just this one
   - Problem: May break other projects that expect CRLF
   - Result: Too invasive

3. **Add shebang to hooks**
   - Rejected: Husky v9 format doesn't use shebangs
   - Problem: Would revert to deprecated v4 format
   - Result: Doesn't align with Husky best practices

**Chosen Approach:** Create `.gitattributes` with LF enforcement for Husky hooks

**Technical Rationale:**

**Why .gitattributes:**
- Repository-specific solution (doesn't affect other repos)
- Committed to version control (all developers get the fix)
- Git-native solution (no external tools required)
- Overrides core.autocrlf for specified paths

**Why LF is required:**
- Git Bash on Windows uses Unix-style LF line endings for shell scripts
- CRLF causes shell to append `\r` to commands, resulting in "command not found"
- This is a fundamental shell script requirement on Unix-like environments

**Implementation Details:**

**Location:** `.gitattributes` (workspace root)

**Configuration:**
```
# Husky hooks must always use LF line endings (not CRLF) for Git Bash compatibility
.husky/* text eol=lf
```

**Fix Commands:**
```bash
# Convert existing hooks to LF
dos2unix .husky/pre-commit
dos2unix .husky/commit-msg

# Or using sed
sed -i 's/\r$//' .husky/pre-commit
sed -i 's/\r$//' .husky/commit-msg

# Verify conversion
file .husky/pre-commit  # Should show "ASCII text" (not "with CRLF")
od -c .husky/pre-commit  # Should show \n (not \r\n)
```

**Verification:**
After fix, hooks execute successfully:
- lint-staged completes
- Nx affected tests complete
- Hook exits cleanly (no exit code 127)

**Warning Signs (for AI agents):**

❌ **Do not** suggest adding shebangs to Husky v9 hooks
- **Why**: Husky v9 uses simple command files without shebangs
- **Result**: Deprecated pattern, goes against Husky docs

❌ **Do not** suggest changing core.autocrlf globally
- **Why**: Affects all repositories system-wide
- **Result**: May break other projects

❌ **Do not** suggest manual dos2unix as a solution
- **Why**: Not sustainable, doesn't persist
- **Result**: Every developer hits the same issue

✅ **Do use** `.gitattributes` for path-specific line ending rules
- Committed to repo, applies to all developers
- Git-native, no external tools required

✅ **Do verify** line endings after creating Husky hooks
- Run `file .husky/pre-commit` to check
- Should show "ASCII text" (not "with CRLF")

**Symptoms to watch for:**
- Husky hooks fail with exit code 127
- Error message: "command not found" or similar
- Hooks work on Linux/Mac but fail on Windows
- Commands succeed individually but fail in hook

**Applies To:**
- Any shell scripts in the repository (`.sh` files)
- Git hooks (especially Husky hooks in `.husky/`)
- Any executable scripts intended for Git Bash on Windows

**References:**
- Husky v9 documentation: https://typicode.github.io/husky/
- Git attributes documentation: https://git-scm.com/docs/gitattributes
- Vibe-check MCP analysis (exit code 127 diagnosis)
- Context7 Husky docs (/typicode/husky)

---

## Related Documentation

**Referenced by**:
- `.ruler/AGENTS.md` - Memory System section - **MUST CHECK before changing build/test/TypeScript configs**
- `.ruler/AGENTS.md` - Important Notes - Read before suggesting architecture/tooling/configuration changes

**Related Memory Files**:
- `adopted-patterns.md` - Configuration standards derived from technical findings
- `post-generation-checklist.md` - Post-generation fixes based on discovered constraints
- `README.md` - Memory system overview and workflows

---

## [Testing] - Jest Hanging on Windows in Pre-Commit Hooks - 2025-10-28

**Decision:** Use `NX_DAEMON=false` environment variable when running tests in pre-commit hooks

**Context:**
After fixing the line endings issue (previous entry), Jest tests still hung after successful completion on Windows when run via Husky pre-commit hooks. Tests passed successfully but the Jest/Nx process wouldn't exit cleanly, blocking the commit indefinitely.

**Root Cause Analysis:**

1. **Nx daemon IPC connections**: Nx daemon maintains persistent IPC socket connections (named pipes on Windows)
2. **Process cleanup on Windows**: Windows handles lingering socket connections differently than Linux/Mac
3. **Jest process**: Even after tests complete, Node process has open handles to daemon communication
4. **Result**: Process waits indefinitely for handles to close (they never do on Windows)

**Empirically Verified Solutions** (from 2025-10-20 troubleshooting):
- ✅ `NX_DAEMON=false pnpm exec nx run-many -t test` (Works - disables daemon)
- ✅ `pnpm exec nx run-many -t test --no-cloud` (Works - disables Nx Cloud)
- Both work independently

**Alternatives Considered:**

1. **Move tests entirely to CI** (Approach 2)
   - Pro: Fastest commits (3-8 seconds), no platform issues
   - Pro: Industry standard (React, Vue, Angular use this pattern)
   - Con: No local quality gate, delayed feedback (5-10 minutes)
   - Con: Developers can commit broken tests
   - Rejected: Team values immediate local feedback

2. **Conditional execution (skip on Windows)** (Approach 3)
   - Pro: Windows developers get fast commits, others keep local tests
   - Con: Team inconsistency - different experience by OS
   - Con: Windows devs lose quality gate (can push broken code)
   - Con: Creates "second-class developer" perception
   - Rejected: Team division unacceptable

3. **Use --no-cloud flag instead**
   - Pro: Also empirically verified to work
   - Pro: Retains daemon for workspace graph operations
   - Con: Disables remote caching (slower on cache miss)
   - Rejected: Daemon is the primary hang source per research

4. **Use --forceExit Jest flag**
   - Pro: Guaranteed exit
   - Con: Masks real issues (violates codebase policy)
   - Con: Against Jest best practices
   - Rejected: Documented in tech-findings as "never commit"

**Chosen Approach:** Use `NX_DAEMON=false` in pre-commit hook (Approach 1)

**Technical Rationale:**

**Why NX_DAEMON=false works:**
- Disables persistent Nx daemon process
- Forces synchronous, single-process execution
- No IPC socket connections = no lingering handles
- Process can exit cleanly as soon as tests complete

**Why it's appropriate for pre-commit:**
- Pre-commit runs affected tests only (small subset, fast even without daemon)
- Daemon overhead minimal for affected detection (2-5 seconds typical)
- Retains Nx Cloud remote caching (daemon and cloud are separate)
- Maintains consistent developer experience (all platforms same behavior)
- Preserves local quality gate (tests run before commit)

**Implementation Details:**

**Location:** `.husky/pre-commit`

**Configuration:**
```bash
# .husky/pre-commit
pnpm exec lint-staged
NX_DAEMON=false pnpm exec nx affected -t test --base=HEAD~1
```

**Performance Impact:**
- With daemon: 5-15 seconds (but hangs on Windows)
- Without daemon: 10-20 seconds (exits cleanly on all platforms)
- Trade-off: 5-10 seconds slower for reliability and consistency

**Verification:**
```bash
# Test pre-commit hook manually
./.husky/pre-commit

# Should exit cleanly with output like:
# ✓ lint-staged completed
# ✓ nx affected tests completed (or "No tasks were run")
# ✓ Hook exits immediately (no hanging)
```

**How `nx affected` Works:**

**Project-level detection**, not file-level:
- Compares git diff between commits
- Determines which **projects** are affected by changes
- Runs tests for entire affected projects

**Files that trigger all tests:**
- `.gitattributes` - Could affect any file's Git handling
- `.husky/*` - Changes hooks that run tests
- `nx.json` - Workspace configuration
- `tsconfig.base.json` - Affects all TypeScript projects
- `package.json` (root) - Workspace dependencies

**Files that don't trigger tests:**
- `docs/*.md` - Pure documentation
- `README.md` - Documentation
- Most files in `docs/` directory

**Example behavior:**
- Commit only `docs/some-file.md` → No tests run (exits <1 second)
- Commit `.gitattributes` → All tests run (workspace config)
- Commit `apps/web/src/page.tsx` → Only `web` project tests run

**Warning Signs (for AI agents):**

❌ **Do not** suggest removing `NX_DAEMON=false` to "improve performance"
- **Why**: Re-introduces hanging issue on Windows
- **Result**: Developers will bypass hooks with --no-verify

❌ **Do not** suggest using `--forceExit` as alternative
- **Why**: Violates codebase policy, masks real issues
- **Result**: May hide test code leaks

❌ **Do not** suggest conditional execution (Windows vs Linux)
- **Why**: Creates team division and inconsistency
- **Result**: Different developer experience by OS

✅ **Do preserve** `NX_DAEMON=false` when modifying pre-commit hook
- Essential for Windows compatibility
- Minimal performance cost for affected tests

✅ **Do use** standard Nx commands in CI (daemon + cloud enabled)
- CI doesn't have the Windows hanging issue
- Full optimization appropriate in CI environment

**Applies To:**
- Nx monorepos with Husky pre-commit hooks
- Windows development environments (Git Bash, MSYS2)
- Any scenario where Jest hangs after test completion
- Pre-commit hooks running `nx affected -t test`

**References:**
- Sub-agent research report (2025-10-28): Three approaches analyzed
- Industry best practices: Nx community standard workaround
- Empirical validation: tech-findings-log.md (2025-10-20)
- Vibe-check MCP guidance on systematic troubleshooting

---

## [TypeScript Configuration] - Nx Modern Pattern: Workspaces + Project References (Not Manual Paths) - 2025-11-01

**Decision:** Use pnpm workspaces with TypeScript Project References for cross-package imports, NOT manual `paths` in `tsconfig.base.json`

**Context:** Server build failed with "Cannot find module '@nx-monorepo/database'" after removing manual path mappings during TypeScript configuration cleanup. Investigation revealed conflicting approaches between two agents regarding the correct Nx pattern.

**Alternatives Considered:**
1. **Manual paths in tsconfig.base.json** - Rejected because:
   - Nx official docs explicitly state this is the OLD pattern
   - Listed as "common pitfall" in Nx community best practices
   - Creates maintenance overhead (manual updates required)
   - Conflicts with TypeScript Project References

2. **Keep paths AND add workspace dependencies** - Rejected because:
   - Redundant configuration (two ways to do the same thing)
   - Paths override Nx's automatic dependency management
   - Violates DRY principle

**Chosen Approach:** pnpm workspaces + TypeScript Project References + package.json workspace dependencies

**Implementation Requirements:**
1. **pnpm-workspace.yaml** must define workspace pattern:
   ```yaml
   packages:
     - apps/*
     - packages/*
   ```

2. **Consuming packages** must declare workspace dependencies in package.json:
   ```json
   "dependencies": {
     "@nx-monorepo/database": "workspace:*",
     "@nx-monorepo/schemas": "workspace:*"
   }
   ```

3. **Run `pnpm install`** after adding workspace dependencies to create symlinks in node_modules

4. **TypeScript Project References** in consuming package tsconfig.json:
   ```json
   "references": [
     {"path": "../../packages/database/tsconfig.lib.json"},
     {"path": "../../packages/schemas/tsconfig.lib.json"}
   ]
   ```

**Technical Rationale:**
- **Performance**: TypeScript Project References enable incremental builds
- **Accuracy**: Package manager handles version resolution and linking
- **Maintainability**: Nx automatically manages dependencies via dependency graph
- **Standards**: Aligns with modern Nx documentation (v21+)

**Pattern 2 Violation Fix:**
Libraries were overriding `moduleResolution: "nodenext"` instead of inheriting `"bundler"` from tsconfig.base.json:
- **Root cause**: Per Pattern 2 in adopted-patterns.md, production configs should inherit from base
- **Fix**: Removed `moduleResolution`, `module`, and `baseUrl` overrides from all library tsconfig.lib.json files
- **Result**: Libraries now correctly inherit `moduleResolution: "bundler"` from base

**ESM Import Extensions:**
With TypeScript `moduleResolution: "nodenext"` (used in test configs and server app), relative imports MUST use explicit .js extensions:
- **Applies to**: Dynamic imports in test files, local imports in production code when compiled by "nodenext" context
- **Example**: `import('./health')` → `import('./health.js')`
- **Rationale**: TypeScript ESM standard requires explicit extensions with "nodenext" resolution

**Jest Config Files with type: "module":**
All packages use `"type": "module"` in package.json (established pattern). Jest config files must use `.cjs` extension:
- **Error without fix**: "require is not defined in ES module scope"
- **Solution**: Rename `jest.config.js` → `jest.config.cjs`
- **Applies to**: All packages with `"type": "module"` in package.json

**Verification Commands:**
```bash
# Database typecheck (no build target - uses --bundler=none)
pnpm exec nx run database:typecheck

# Schemas build
pnpm exec nx run schemas:build

# Server build (critical test - imports from workspace packages)
pnpm exec nx run server:build

# Dependency graph visualization
pnpm exec nx graph --file=graph.html
```

**Success Criteria:**
✅ No manual paths in tsconfig.base.json
✅ Workspace dependencies declared in consuming packages
✅ Libraries inherit moduleResolution from base (Pattern 2 compliance)
✅ All imports use .js extensions where required (ESM standard)
✅ Jest configs use .cjs extension for ESM packages
✅ Server build succeeds with workspace package imports resolving correctly
✅ Nx dependency graph shows clean structure

**Warning Signs (for AI agents):**

❌ **Do not** add manual paths to tsconfig.base.json to "fix" import errors
- **Why**: Old pattern that conflicts with modern Nx workspaces
- **Instead**: Add workspace dependencies to consuming package's package.json

❌ **Do not** suggest removing `"type": "module"` from packages
- **Why**: Established consistent pattern across all workspace packages
- **Instead**: Rename jest.config.js to .cjs for ESM compatibility

❌ **Do not** override moduleResolution in library tsconfig.lib.json
- **Why**: Violates Pattern 2 - libraries should inherit from base
- **Instead**: Only override in test configs (tsconfig.spec.json) and Node.js apps (tsconfig.app.json)

✅ **Do** add workspace dependencies with `"workspace:*"` version
- Required for package manager to link workspace packages
- Run `pnpm install` after adding

✅ **Do** use explicit .js extensions in imports when required
- Test files (use "nodenext")
- Production code when consumed by "nodenext" context

**References:**
- Nx Official Docs: [Switch to Workspaces and Project References](https://nx.dev/technologies/typescript/recipes/switch-to-workspaces-project-references)
- Community Best Practice: ["Manually editing path mappings" listed as common pitfall](https://mayallo.com/nx-monorepo-typescript-configurations/)
- TypeScript ESM: Requires explicit .js extensions with moduleResolution "nodenext"
- Investigation findings: Sequential Thinking MCP (10 thoughts), Vibe-Check MCP validation
- Context7 MCP: TypeScript compiler documentation on paths vs Project References
- Exa MCP: Nx monorepo configuration patterns

**Applies To:**
- Nx 21.6+ monorepos using pnpm workspaces
- TypeScript 5.9+ with Project References
- Cross-package imports in monorepo applications
- ESM packages with Jest testing

**Date Resolved:** 2025-11-01
**Resolved By:** AI Agent (investigation-first approach with MCP server validation)

---

## [Database Configuration] - Supabase PostgreSQL Connection URL Encoding - 2025-11-01

**Decision:** URL-encode special characters (especially `!`) in PostgreSQL connection strings for Supabase

**Context:** Prisma migration failed with "FATAL: Tenant or user not found" error despite correct credentials retrieved from Supabase MCP server. Project status showed ACTIVE_HEALTHY, but connection failed intermittently.

**Root Cause:** Password contained special character `!` which must be URL-encoded as `%21` in PostgreSQL connection strings. Unencoded special characters in passwords cause authentication failures.

**Technical Implementation:**

**Before (connection failed):**
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald!1tt123@aws-0-eu-north-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald!1tt123@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
```

**After (connection successful):**
```env
DATABASE_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald%211tt123@aws-0-eu-north-1.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres.pjbnwtsufqpgsdlxydbo:Arald%211tt123@aws-0-eu-north-1.pooler.supabase.com:5432/postgres"
```

**Characters requiring URL encoding:**
- `!` → `%21`
- `@` → `%40`
- `#` → `%23`
- `$` → `%24`
- `%` → `%25`
- `^` → `%5E`
- `&` → `%26`
- `*` → `%2A`
- ` ` (space) → `%20`

**Verification Process:**

1. **Used Supabase MCP server to retrieve credentials:**
   ```bash
   - list_projects → identified "nx-monorepo" project
   - get_project → verified ACTIVE_HEALTHY status
   - get_project_url → retrieved API URL
   - get_publishable_keys → retrieved anon key
   ```

2. **Verified credentials match .env file** (except URL encoding)

3. **Applied migration using Supabase MCP** (bypassed Prisma CLI):
   ```typescript
   mcp__plugin_dev-additional_Supabase_MCP__apply_migration({
     project_id: "pjbnwtsufqpgsdlxydbo",
     name: "create_health_check",
     query: "CREATE TABLE health_checks..."
   })
   ```

4. **Confirmed table creation:**
   ```bash
   list_tables → health_checks table exists
   execute_sql → SELECT COUNT(*) works
   ```

**Windows ARM64 Limitation:**

Prisma Client query engine does not support Windows ARM64:
- **Error**: "query_engine-windows.dll.node is not a valid Win32 application"
- **Workaround**: Use Supabase MCP server for direct SQL operations during development
- **Solution**: Run Prisma tests in CI (Linux) or on x64 platform
- **Rationale**: Database schema and migrations work correctly; runtime limitation only affects local testing

**Verification Commands:**

```bash
# Verify table exists via Supabase MCP
list_tables(project_id)

# Test connection via SQL query
execute_sql(project_id, "SELECT COUNT(*) FROM health_checks")

# Enable RLS (if not in migration)
execute_sql(project_id, "ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY")
```

**Implementation Details:**

**Location:** `.env` (workspace root)

**Dual Connection Strategy:**
- **DATABASE_URL** (port 6543): Pooled connection for Prisma runtime queries (Transaction Mode via Supavisor)
- **DIRECT_URL** (port 5432): Direct connection for migrations and DDL operations (Session Mode)

**Success Criteria:**
✅ Connection strings use URL-encoded password
✅ health_checks table exists in Supabase with correct schema
✅ RLS enabled on health_checks table
✅ Direct SQL queries work via Supabase MCP
✅ CI/Linux environments can run full Prisma tests

**Warning Signs (for AI agents):**

❌ **Do not** use unencoded special characters in connection string passwords
- **Why**: Causes authentication failures with cryptic "Tenant or user not found" errors
- **Instead**: URL-encode password before placing in .env file

❌ **Do not** attempt to run Prisma Client tests on Windows ARM64
- **Why**: Query engine binary not available for this platform
- **Instead**: Use Supabase MCP for verification, defer Prisma tests to CI

✅ **Do** verify credentials match between Supabase dashboard and .env
- Use Supabase MCP tools: list_projects, get_project, get_publishable_keys
- Compare retrieved values with .env (accounting for URL encoding)

✅ **Do** use Supabase MCP for migrations when Prisma CLI has environment issues
- apply_migration, execute_sql, list_tables tools available
- Bypasses local Prisma CLI environment variable loading issues

**Symptom Patterns:**
- "Tenant or user not found" with correct-looking credentials → Check URL encoding
- Prisma migration command can't find environment variables → Run from workspace root or use explicit env vars
- "Not a valid Win32 application" on Windows → ARM64 limitation, use CI for testing

**Applies To:**
- Supabase PostgreSQL connections
- Any PostgreSQL connection string with special characters in password
- Prisma migrations targeting Supabase
- Windows ARM64 development environments

**References:**
- Supabase MCP Server: Direct database operations when Prisma CLI blocked
- PostgreSQL URL format: https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING
- RFC 3986 (URL encoding): https://datatracker.ietf.org/doc/html/rfc3986#section-2.1
- Prisma Platform Support: https://pris.ly/d/system-requirements

**Date Resolved:** 2025-11-01
**Resolved By:** AI Agent (Supabase MCP server + URL encoding investigation)

---

## [Nx Configuration] - Nx dependsOn Syntax: String Form vs Object Form - 2025-11-02

**Decision:** String form `"@scope/project:target"` is valid and appropriate for explicit cross-project dependencies in Nx

**Context:** During dependency wiring implementation, an agent review claimed that string form dependency syntax was "fragile" and "nonstandard," recommending conversion to object form. Investigation via Context7 MCP and official Nx documentation revealed this claim was incorrect.

**Alternatives Considered:**

1. **Object form `{"target": "...", "projects": [...]}`**
   - Use case: Required for parameter forwarding, wildcards, or dependency placeholders
   - Example: `{"target": "build", "projects": "dependencies"}`
   - When needed: Dynamic dependency resolution, passing parameters between tasks
   - Rejected for our use case: Adds unnecessary complexity when explicit dependency is sufficient

2. **String form `"@scope/project:target"`**
   - Use case: Simple explicit cross-project dependencies
   - Example: `"@nx-monorepo/database:typecheck"`
   - When appropriate: Known project, known target, no parameter forwarding
   - **CHOSEN**: Official Nx syntax, clear, readable, no complexity overhead

**Chosen Approach:** String form for explicit dependencies (no parameter forwarding needed)

**Technical Rationale:**

**Why string form is valid:**
- Officially documented in Nx v21.6.3 documentation (verified via Context7 MCP)
- Used extensively in Nx official examples and recipes
- Provides explicit, readable dependency declarations
- No fragility - Nx validates project and target names at build time
- Nx graph visualization shows these dependencies correctly

**Why object form is NOT required here:**
- No parameter forwarding needed (our targets don't pass parameters)
- No wildcard patterns needed (explicit project dependencies)
- No dependency placeholders needed (e.g., `"dependencies"`, `"^"`)
- Object form would add visual noise without functional benefit

**When to use each form:**

**Use string form when:**
```json
"dependsOn": [
  "@nx-monorepo/database:typecheck",
  "@nx-monorepo/schemas:build"
]
```
- Fixed, known project and target
- No parameters to forward
- Simple explicit dependency

**Use object form when:**
```json
"dependsOn": [
  {"target": "build", "projects": "dependencies"},
  {"target": "^build", "params": "forward"}
]
```
- Dynamic dependency resolution (`"dependencies"`, `"self"`)
- Parameter forwarding between tasks
- Wildcard patterns (all deps, all dependents)
- Using `^` for upstream dependencies

**Implementation Details:**

**Location:** `packages/database/project.json`, `packages/schemas/project.json`

**Example configuration:**
```json
{
  "targets": {
    "typecheck": {
      "dependsOn": ["@nx-monorepo/schemas:build"]
    }
  }
}
```

**Verification:**
```bash
# Nx graph shows dependency correctly
pnpm exec nx graph

# Nx validates project/target names
pnpm exec nx run database:typecheck
```

**Warning Signs (for AI agents):**

❌ **Do not** claim string form is "fragile" or "nonstandard"
- **Why**: Officially documented Nx syntax, used in official examples
- **Result**: Creates unnecessary churn converting valid syntax

❌ **Do not** convert string form to object form without specific need
- **Why**: Adds complexity without benefit
- **When to convert**: Only if parameter forwarding or wildcards are needed

✅ **Do recognize** string form is appropriate for explicit dependencies
- Clear intent: This target depends on that specific project's target
- Nx validates names at build time (not fragile)

✅ **Do use** object form when you need advanced features
- Dynamic resolution: `"projects": "dependencies"`
- Parameter forwarding: `"params": "forward"`
- Wildcard patterns: `"^build"` for all upstream deps

**Cross-References:**
- Related to: [TypeScript Configuration] - Nx Modern Pattern: Workspaces + Project References (2025-11-01)
- Complements: TypeScript Project References for compile-time dependencies
- Used with: Workspace dependency resolution strategy

**References:**
- Nx Official Docs: [dependsOn configuration](https://nx.dev/reference/project-configuration#dependson) (verified via Context7 MCP /nrwl/nx/v21.6.3)
- Nx Task Pipeline: https://nx.dev/concepts/task-pipeline-configuration
- Context7 MCP validation: 2025-11-02
- Investigation: Agent review disagreement → MCP server fact-check

**Applies To:**
- Nx 21.6+ monorepos
- Cross-project task dependencies
- Build orchestration and dependency wiring

**Date Resolved:** 2025-11-02
**Resolved By:** AI Agent (Context7 MCP documentation validation)

---

## [Web App Configuration] - API URL Configuration: Rewrites + Environment Variable Override - 2025-11-02

**Decision:** Use Next.js rewrites for development + NEXT_PUBLIC_API_URL override for production (Option 3)

**Context:** The web app had hardcoded API URL `http://localhost:3001/api`, which broke portability (different port configurations) and caused CORS issues. Need flexible configuration that works in development and production with minimal setup.

**Alternatives Considered:**

1. **Environment variable only**
   - Implementation: `NEXT_PUBLIC_API_URL` in .env.local, client uses `process.env.NEXT_PUBLIC_API_URL`
   - Rejected: Requires manual .env.local creation for all developers
   - Problem: CORS issues in development (browser → localhost:3000 → localhost:3001)
   - Problem: No automatic fallback if env var missing

2. **Next.js rewrites only**
   - Implementation: `rewrites()` in next.config.js proxying /api → http://localhost:3001/api
   - Rejected: Inflexible for production deployments
   - Problem: Can't override API URL for different deployment patterns (Docker, cloud hosting, etc.)
   - Problem: Hardcodes localhost assumptions

3. **Both: Rewrites for dev + env var override for production** ✅ **CHOSEN**
   - Implementation: next.config.js rewrites + `NEXT_PUBLIC_API_URL` optional override
   - Client code: `const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api'`
   - Development: Rewrites work immediately (no .env.local needed)
   - Production: Override via environment variable if needed

**Chosen Approach:** Rewrites + environment variable override

**Technical Rationale:**

**Why this combination works:**

**Development (default behavior):**
1. Developer runs `pnpm run dev` (web on :3000, server on :3001)
2. No .env.local configuration needed
3. Next.js rewrites `/api/*` → `http://localhost:3001/api/*` server-side
4. Client makes requests to `/api/health` (same-origin, no CORS)
5. Next.js proxy forwards to server
6. Result: Zero configuration, works immediately

**Production (environment variable override):**
1. Set `NEXT_PUBLIC_API_URL=https://api.example.com` in deployment environment
2. Client code uses env var: `process.env.NEXT_PUBLIC_API_URL || '/api'`
3. Requests go directly to production API URL (no proxy)
4. Supports any deployment pattern:
   - Docker Compose: Container-to-container networking
   - Cloud platforms: Separate API domain
   - Kubernetes: Service mesh routing
   - Edge deployments: CDN + API separation

**Implementation Details:**

**Location:** `apps/web/next.config.js`, `apps/web/.env.local.example`, client API code

**next.config.js configuration:**
```javascript
async rewrites() {
  return [
    {
      source: '/api/:path*',
      destination: 'http://localhost:3001/api/:path*',
    },
  ];
}
```

**.env.local.example (template for developers):**
```env
# Optional: Override API URL for production or custom server port
# NEXT_PUBLIC_API_URL=http://localhost:3001/api
# NEXT_PUBLIC_API_URL=https://api.example.com
```

**Client code pattern:**
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Usage in API client
fetch(`${API_BASE_URL}/health`)
```

**CORS configuration (server):**
```typescript
// apps/server/src/main.ts
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
```

**Why rewrites solve CORS in development:**
- Browser request: `http://localhost:3000/api/health` (same-origin)
- Next.js server: Proxies to `http://localhost:3001/api/health` (server-to-server, no CORS)
- Response: Returns to browser with same-origin headers
- Result: No CORS preflight, no CORS headers needed for development

**Verification Commands:**
```bash
# Development (default, no env var)
pnpm run dev
curl http://localhost:3000/api/health  # Should proxy to server

# Production (with env var override)
NEXT_PUBLIC_API_URL=http://localhost:3001/api pnpm run dev
curl http://localhost:3000/api/health  # Should call server directly
```

**Success Criteria:**
✅ Development works without .env.local configuration
✅ No CORS errors in browser console
✅ Production deployments can override API URL via environment variable
✅ .env.local.example documents the override option
✅ Client code uses consistent pattern: `process.env.NEXT_PUBLIC_API_URL || '/api'`

**Warning Signs (for AI agents):**

❌ **Do not** hardcode API URLs in client code
- **Why**: Breaks portability and deployment flexibility
- **Instead**: Use `process.env.NEXT_PUBLIC_API_URL || '/api'` pattern

❌ **Do not** remove rewrites to "simplify" configuration
- **Why**: Forces all developers to create .env.local manually
- **Result**: Poor developer experience, CORS issues

❌ **Do not** rely only on environment variables
- **Why**: Requires manual setup for every developer
- **Result**: "Works on my machine" syndrome

✅ **Do preserve** rewrites in next.config.js for development
- Zero-config development experience
- Automatic CORS handling via proxy

✅ **Do support** NEXT_PUBLIC_API_URL override for production
- Deployment flexibility
- Different API URL patterns (cloud, containers, edge)

**Applies To:**
- Next.js applications in Nx monorepo
- Development with separate frontend/backend processes
- Production deployments with flexible API URL requirements
- Any scenario requiring CORS-free development + production override

**Symptom Patterns:**
- CORS errors in development → Missing rewrites configuration
- Hardcoded localhost URLs → Missing environment variable override pattern
- "API not found" after deployment → No NEXT_PUBLIC_API_URL set in production

**References:**
- Next.js Rewrites: https://nextjs.org/docs/app/api-reference/next-config-js/rewrites
- Next.js Environment Variables: https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
- Implementation: apps/web/next.config.js, apps/web/.env.local.example (2025-11-02)
- Related issue: Hardcoded API URL causing portability problems

**Date Resolved:** 2025-11-02
**Resolved By:** AI Agent (API URL configuration strategy design)

---

## Future Entries

[Add new technical findings below using the template above]

