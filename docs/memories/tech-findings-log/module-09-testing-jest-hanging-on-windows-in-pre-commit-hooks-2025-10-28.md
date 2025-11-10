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
