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
