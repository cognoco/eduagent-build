**What was done:**
Added a root pnpm override for `tar >=7.5.16` to force the vulnerable transitive `tar@7.5.2` path from `@expo/cli` onto the patched release line.

**What changed:**
- Updated `package.json` with a `pnpm.overrides.tar` constraint.
- Refreshed `pnpm-lock.yaml` so all `@expo/cli` tar snapshots resolve to `tar@7.5.16`.

**Verification:**
- `pnpm install` completed after the override and updated the lockfile.
- `rg -n '^\\s+tar@|tar:' pnpm-lock.yaml package.json` shows only `tar@7.5.16` and the `>=7.5.16` override.
- `pnpm why tar` shows all `@expo/cli` paths resolving to `tar 7.5.16`.
- `pnpm audit --json` filtered for `module_name == "tar"` reported `tarAdvisories=0` (`pnpm audit` still exits 1 because of unrelated advisories).
- `pnpm exec nx run mobile:typecheck` exited 0.

**Caveats / Follow-ups:**
- No unit regression test was added because the accepted verification for this dependency-security item is lockfile/audit/typecheck evidence; exercising the underlying CVEs would require OS-level malicious tarball extraction outside the app code.
