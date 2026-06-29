**What was done:**
- Added a root pnpm override pinning `shell-quote` to `1.8.4` for WI-1024.

**What changed:**
- Updated `package.json` with the override.
- Updated `pnpm-lock.yaml` so all `shell-quote` package and snapshot references resolve to `1.8.4` instead of `1.8.3`.

**Verification:**
- `pnpm install --frozen-lockfile`
- `rg 'shell-quote(@|:) 1\.8\.[0-3]|shell-quote@1\.8\.[0-3]' pnpm-lock.yaml package.json` produced no matches.
- Targeted `pnpm audit --json` parsing produced `NO_MATCH shell-quote/CVE-2026-9277`.
- `pnpm run check:root-deps`
- `pnpm exec nx lint mobile`
- `pnpm exec nx run mobile:typecheck`
- Commit hooks and pre-push validation passed.

**Caveats / Follow-ups:**
- The full `pnpm audit` still reports unrelated existing advisories outside `shell-quote` / CVE-2026-9277; this branch intentionally does not broaden scope.
