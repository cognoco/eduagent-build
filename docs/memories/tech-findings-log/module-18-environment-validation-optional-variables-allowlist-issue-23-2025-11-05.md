## [Environment Validation] - Optional Variables Allowlist (Issue #23) - 2025-11-05

**Context**: Environment validation script warning about unexpected CORS_ORIGIN variable

**Problem**

The `scripts/validate-env.js` validation script flagged CORS_ORIGIN as an "unexpected variable" even though:
1. It's documented in .env.example
2. It has a runtime default in apps/server/src/app.ts
3. It's a legitimate optional configuration variable

This created confusion for developers who thought they might have a configuration error.

**Root Cause**

The validation script only knew about REQUIRED_VARS and variables starting with NEXT_PUBLIC_. It had no concept of "optional but valid" variables, leading to false positive warnings.

**Solution Implemented**

**Solution #1: Explicit Allowlist** (chosen for clarity and explicit validation)

Added OPTIONAL_VARS configuration array with:
- Variable name
- Description

**Optional variables recognized:**
1. CORS_ORIGIN - Comma-separated CORS origins (default: localhost:3000-3002 in dev)
2. HOST - Server host address (default: localhost)
3. PORT - Server port number (default: 4000)
4. NODE_ENV - Node environment (default: development)

**Validation behavior:**
- Optional variables are NOT required to be present
- If present, they are validated for correct format
- Format errors are reported as validation failures
- Unexpected variables still generate warnings

**Benefits**

✅ **Explicit documentation**: Clear list of all recognized variables
✅ **Format validation**: Catches configuration mistakes early
✅ **No false positives**: CORS_ORIGIN and other optional vars no longer warn
✅ **Maintainable**: Easy to add new optional variables
✅ **Educational**: Developers learn what variables are available

**Implementation Details**

**Files modified:**
1. `scripts/validate-env.js`:
   - Added OPTIONAL_VARS array (lines 31-50)
   - Added validator functions: validateCorsOrigin, validateHost, validatePort, validateNodeEnv (lines 151-228)
   - Updated validation logic to recognize optional variables (lines 277-314)

2. `.env.example`:
   - Updated CORS_ORIGIN comment to indicate it's optional (line 67)
   - Added "Optional Server Configuration" section with examples (lines 77-90)

3. `docs/environment-setup.md`:
   - Added "Optional Variables" section explaining defaults (lines 57-66)
   - Updated validation explanation to clarify optional vs required (lines 209-232)

4. `docs/memories/tech-findings-log.md`:
   - This entry

**IPv6 Support Fix (2025-11-05):**

Initial implementation blocked IPv6 addresses (e.g., `::1`, `::`, `fe80::1`) because `validateHost()` rejected any value containing colons. Fixed by:
- Detecting IPv6 addresses (contain colons + hex/colon characters)
- Skipping port number check for IPv6
- Preserving hostname:port error detection for non-IPv6 values

Tested and validated:
- ✅ IPv6 localhost (`::1`) - passes
- ✅ IPv6 all interfaces (`::`) - passes
- ✅ Full IPv6 addresses (`fe80::1`) - passes
- ✅ IPv4 addresses (`0.0.0.0`) - passes
- ✅ Hostnames (`localhost`) - passes
- ✅ Invalid hostname:port (`localhost:4000`) - fails as expected

**Alternatives Considered**

**Solution #2: Environment Profiles**
- Profile system (dev/test/prod) with categorization
- Rejected: More complex than needed for current scope (4-6 hours vs 50 minutes)

**Solution #3: Zod Schema Migration**
- Migrate to Zod with full type safety
- Rejected: Architectural shift, 7-11 hours, better for Phase 2+

**Solution #4: Runtime Context Detection**
- Automatic context detection via call stack analysis
- Rejected: Very high complexity (7-9 days), fragile, over-engineered

**Rationale for Solution #1:**
- Fast implementation (50 minutes vs days/weeks)
- Extends existing pattern (no architectural shift)
- Very low risk (minimal code changes)
- Can migrate to Solutions #2 or #3 later if needed
- Perfect for immediate Issue #23 fix before PR #20 merge

**References**

- Issue #23: "Unexpected variable warning for CORS_ORIGIN"
- `apps/server/src/app.ts:24` - CORS_ORIGIN usage with defaults
- `apps/server/src/main.ts:24-25` - HOST and PORT usage with defaults
- `.env.example:75` - CORS_ORIGIN documentation
- Multi-agent root cause analysis (2025-11-05)
- Solution comparison and ranking (2025-11-05)

**Testing**

Validated that:
- ✅ Missing optional variables: No warnings
- ✅ Valid optional variables: No warnings
- ✅ Invalid format optional variables: Error reported
- ✅ Required variables: Still validated as before
- ✅ Truly unexpected variables: Still generate warnings

**Test Cases:**
1. No optional variables → Pass with no warnings
2. Valid optional variables → Pass with no warnings
3. Invalid CORS_ORIGIN format (missing http://) → Fail with format error
4. Invalid PORT format (not a number) → Fail with format error
5. Missing DATABASE_URL (regression test) → Fail as expected
6. Typo in variable name → Warning generated (not an error)

**Last Validated**

2025-11-05 (Node.js 20.x, validate-env.js v1.1)

**Tags**: #environment #validation #optional-variables #issue-23 #pr-20

---

### [Testing Architecture] - Per-Project Jest Setup Files (Principle of Least Privilege) - 2025-11-05

**Decision:** Use per-project `setupFiles` configuration instead of workspace-level `jest.preset.js` setup for loading environment variables

**Context:**
GitHub Issue #22 identified that all 7+ workspace projects were loading database credentials (`DATABASE_URL`, `DIRECT_URL`) during test execution, even though only 2 projects (database package and server application) actually need database access. This violated the Principle of Least Privilege and exposed credentials unnecessarily to frontend packages that should never have direct database access.

**Alternatives Considered:**

1. **Workspace-level setupFiles in jest.preset.js (original approach)**
   - Rejected: Violates Principle of Least Privilege
   - Problem: Gives database credentials to all projects (schemas, api-client, web, mobile)
   - Security risk: Frontend packages should never have direct database credentials
   - Architectural concern: Makes it easy to accidentally write direct database queries in wrong packages

2. **Conditional loading in workspace jest.setup.js**
   - Rejected: Still exposes credentials to all projects
   - Problem: Environment variables still loaded for all projects, just doesn't fail
   - Still violates PoLP: Even if not used, credentials are available in process.env
   - Doesn't enforce architectural boundaries

3. **Duplicate environment loading code in each project**
   - Rejected: Code duplication, harder to maintain
   - Problem: 2+ projects would have identical environment loading logic
   - Maintenance burden: Changes to loading logic require updates in multiple places
   - Bug risk: Easy to introduce inconsistencies (e.g., one project uses `process.cwd()`, another uses `__dirname`)

**Chosen Approach:** Per-project `setupFiles` with shared `@nx-monorepo/test-utils` package

**Technical Rationale:**

**Security (Principle of Least Privilege):**
- Only database and server projects load credentials
- Frontend packages (schemas, api-client, web, mobile) run tests WITHOUT database credentials
- Limits blast radius if credentials leak from test logs/CI artifacts
- Enforces architectural boundary: frontend must use API client, not direct database

**Code reuse without duplication:**
- Shared `loadDatabaseEnv()` utility in `@nx-monorepo/test-utils` package
- DRY principle maintained while allowing selective loading
- Single source of truth for environment loading logic
- Consistent error messages across projects

**Preserves existing patterns:**
- Maintains `__dirname` pattern (prevents `process.cwd()` bugs documented in earlier findings)
- Works with existing `@swc/jest` transformer configuration
- Compatible with `customExportConditions` for Nx unbundled architecture
- No changes needed to test or testTimeout settings

**Implementation Details:**

**Created:**
- `packages/test-utils/` - Buildable library with `loadDatabaseEnv()` utility
- `packages/database/jest.setup.ts` - Per-project setup file
- `apps/server/jest.setup.ts` - Per-project setup file

**Modified:**
- `jest.preset.js` - Removed workspace-level `setupFiles` (now just spreads `nxPreset`)
- `packages/database/jest.config.cjs` - Added `setupFiles: [join(__dirname, 'jest.setup.ts')]`
- `apps/server/jest.config.cjs` - Added `setupFiles: [join(__dirname, 'jest.setup.ts')]`
- `packages/database/package.json` - Added `@nx-monorepo/test-utils` devDependency
- `apps/server/package.json` - Added `@nx-monorepo/test-utils` devDependency

**Deleted:**
- `jest.setup.js` (workspace root) - No longer needed

**Test utilities pattern (CI-aware):**
```typescript
// packages/test-utils/src/lib/load-database-env.ts
export function loadDatabaseEnv(workspaceRoot: string): void {
  // If DATABASE_URL already exists (CI, Docker, cloud platforms), skip file loading
  if (process.env.DATABASE_URL) {
    console.log(
      '✅ DATABASE_URL already set (CI or pre-configured environment)'
    );
    return;
  }

  // Otherwise, load from .env file (local development)
  try {
    const env = process.env.NODE_ENV || 'development';
    const envFile = `.env.${env}.local`;
    const envPath = resolve(workspaceRoot, envFile);

    if (!existsSync(envPath)) {
      throw new Error(
        `Environment file not found: ${envFile}\n` +
          `Expected location: ${envPath}\n` +
          `See: docs/environment-setup.md`
      );
    }

    config({ path: envPath });
    console.log(`✅ Loaded environment variables from: ${envFile}`);
  } catch (error) {
    console.error('❌ Failed to load environment variables for tests:');
    if (error instanceof Error) {
      console.error(error.message);
    }
    console.error('\nTests cannot run without environment configuration.');
    console.error('See: docs/environment-setup.md\n');
    process.exit(1);
  }
}
```

**Why CI-aware pattern:**
- **Local development**: Loads from `.env.{NODE_ENV}.local` files (gitignored, contains real credentials)
- **CI/CD**: Uses environment variables set via GitHub Actions secrets (`DATABASE_URL` already in `process.env`)
- **Docker/Cloud**: Uses platform-provided environment variables (no file needed)
- **Early return**: If `DATABASE_URL` exists, skip file operations entirely (fast path for CI)

**Per-project usage:**
```typescript
// packages/database/jest.setup.ts
import { loadDatabaseEnv } from '@nx-monorepo/test-utils';
import { resolve } from 'path';

loadDatabaseEnv(resolve(__dirname, '../..'));
```

**Warning Signs (for AI agents):**

**If you see:**
- New project needs database access for tests
- Tests failing with "DATABASE_URL is not defined"
- Request to add environment variables to jest.preset.js

**Do NOT:**
- Add `setupFiles` back to `jest.preset.js` (violates PoLP)
- Add environment loading to workspace preset
- Suggest duplicating environment loading code

**DO instead:**
1. Add `@nx-monorepo/test-utils` to project's `devDependencies`
2. Create per-project `jest.setup.ts` that calls `loadDatabaseEnv()`
3. Add `setupFiles: [join(__dirname, 'jest.setup.ts')]` to project's jest.config
4. Verify project actually NEEDS database credentials (frontend shouldn't)

**Validation:**

Ran full test suite after implementation:
- ✅ All 52 tests passed across 6 projects
- ✅ Database tests pass (has credentials)
- ✅ Server tests pass (has credentials)
- ✅ api-client tests pass (no credentials - correct)
- ✅ schemas tests pass (no credentials - correct)
- ✅ supabase-client tests pass (no credentials - correct)
- ✅ web tests pass (no credentials - correct)

**Last Validated**

2025-11-05 (Nx 21.6, Jest 30, Node 22, pnpm 10.19)

**References:**
- GitHub Issue #22 - Security concern about credential exposure
- Pattern 15 in `docs/memories/adopted-patterns.md` - Full pattern documentation
- Pattern 13 in `docs/memories/adopted-patterns.md` - Database environment management

**Tags**: #testing #jest #security #principle-of-least-privilege #environment-variables #issue-22

---

### [CI/CD] - GitHub Actions PR Validation Script Pattern - 2025-11-06

**Finding:** GitHub Actions PR checkouts don't automatically fetch the base branch even with `fetch-depth: 0`, causing validation scripts using `git diff --name-only main...HEAD` to fail with "unknown revision" errors.

**Context:**
CI validation scripts (`tools/scripts/validate-research.js`, `tools/gates/run-internal-alignment.mjs`) failed in GitHub Actions with error:
```
Error getting changed files: Command failed: git diff --name-only main...HEAD
fatal: ambiguous argument 'main...HEAD': unknown revision or path not in the working tree
```

This occurred despite `.github/workflows/ci.yml` using `fetch-depth: 0`, which should fetch full git history.

**Root Cause:**

**GitHub Actions checkout behavior:**
1. `actions/checkout@v4` with `fetch-depth: 0` fetches full commit history for the PR branch
2. However, it does NOT automatically fetch the base branch (e.g., `main`) in PR contexts
3. Only the PR branch HEAD is available locally
4. `git diff main...HEAD` fails because `main` ref doesn't exist

**Why this is non-obvious:**
- `fetch-depth: 0` sounds like "fetch everything" but it only fetches the current branch's history
- Direct pushes to main work fine (checking out main itself)
- Only PR builds fail (checking out feature branch without base)
- Error message doesn't clearly indicate missing ref

**Solution Implemented:**

**1. CI Workflow - Explicit Base Branch Fetch** (`.github/workflows/ci.yml`):
```yaml
steps:
  - uses: actions/checkout@v4
    with:
      filter: tree:0
      fetch-depth: 0

  # Ensure base branch is available for git diff in validation scripts
  - name: Fetch base branch
    if: github.event_name == 'pull_request'
    run: |
      git fetch origin ${{ github.base_ref }}:refs/remotes/origin/${{ github.base_ref }}
```

**Why this works:**
- Only runs for PR builds (`if: github.event_name == 'pull_request'`)
- Uses `github.base_ref` (e.g., "main") from GitHub context
- Explicitly fetches base branch to `refs/remotes/origin/main`
- Now `git diff origin/main...HEAD` will work

**2. Validation Scripts - CI-Aware Pattern**:
```javascript
function getChangedFiles(base = 'main') {
  // In GitHub Actions PR context, use the base ref environment variable
  if (process.env.GITHUB_BASE_REF) {
    base = `origin/${process.env.GITHUB_BASE_REF}`;
  }

  try {
    const output = execSync(`git diff --name-only ${base}...HEAD`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.split('\n').filter(Boolean);
  } catch (error) {
    // In CI, base branch might not be available - silently skip
    if (!process.env.CI) {
      console.error('Warning: Unable to get changed files via git diff');
    }

    // Fallback to staged files
    try {
      const stagedOutput = execSync('git diff --cached --name-only', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return stagedOutput.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
```

**Why this pattern:**
- **Detects GitHub Actions PR context**: Uses `process.env.GITHUB_BASE_REF` (only set in PR builds)
- **Uses correct ref format**: `origin/main` instead of `main` (works with fetched remote branch)
- **Graceful degradation**: Falls back to staged files if git diff fails
- **Silent in CI**: Doesn't spam error logs when base branch unavailable
- **Works locally**: Uses `main` (local branch) when not in GitHub Actions

**Alternatives Considered:**

**1. Use `actions/checkout` with `ref: ${{ github.base_ref }}`**
- Rejected: This checks out the base branch, not the PR branch
- Problem: Tests would run against wrong code

**2. Change validation scripts to use `origin/main` always**
- Rejected: Doesn't work locally where base branch is just `main`
- Problem: Developer experience degraded

**3. Fetch all branches in workflow**
- Rejected: Unnecessary fetch time for branches we don't need
- Current solution is more targeted

**Warning Signs (for AI agents):**

**If you see:**
- New CI validation script using `git diff`
- Script works locally but fails in GitHub Actions PR builds
- Error: "unknown revision or path not in the working tree"
- `fetch-depth: 0` doesn't fix the issue

**DO NOT:**
- Assume `fetch-depth: 0` fetches all branches
- Use `main` ref directly in CI scripts without checking

**DO instead:**
1. Detect PR context via `process.env.GITHUB_BASE_REF`
2. Use `origin/${base_ref}` format when in PR context
3. Add explicit base branch fetch to CI workflow
4. Provide fallback to staged files when git diff unavailable

**References:**
- GitHub Actions Documentation: [Checking out the HEAD commit of a pull request](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request)
- Stack Overflow: [Git diff in GitHub Actions shows "unknown revision"](https://stackoverflow.com/questions/65954171/)
- GitHub Community: [actions/checkout doesn't fetch base branch in PR](https://github.com/actions/checkout/issues/439)
- Fixed in: PR #20 (commit 331f204 - "fix: Resolve validation script git diff errors in CI")
- Related scripts: `tools/scripts/validate-research.js`, `tools/gates/run-internal-alignment.mjs`

**Tags**: #ci-cd #github-actions #validation #git #pull-requests #issue-5

---
