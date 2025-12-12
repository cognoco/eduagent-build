## Nx Configuration – Nx Cloud Cache Invalidation After Major Upgrades (2025-12-12)

**Decision:** When Nx Cloud remote cache becomes stale after a major Nx version upgrade, use a `sharedGlobals` runtime input to bust the entire cache rather than disabling caching on individual targets.

**Context:** During the Nx 21→22 migration (Epic 5b, PR #42), the `spec-write` target failed in CI with `Cannot find module '../routes/hello.openapi.js'`. The target configuration was correct per module-20 patterns, but CI was hitting stale Nx Cloud cache entries created under Nx 21.

**Problem Scenario:**
1. Project upgrades from Nx 21 to Nx 22
2. Nx Cloud contains cached artifacts from Nx 21 builds
3. Hash computation may have changed between versions, OR cached outputs are incompatible
4. CI retrieves stale cache entries that don't match current build expectations
5. Tasks fail despite correct configuration

**Root Cause:** Nx Cloud cache entries are immutable and don't expire quickly. After major version upgrades, old cache entries may be retrieved even when they're no longer compatible with the new Nx version's behavior.

**Alternatives Considered:**
1. Set `cache: false` on affected targets — **Rejected** (violates module-20 patterns, defeats Nx performance benefits)
2. Use `--skip-nx-cache` in CI — **Rejected** (disables all caching, significant performance hit)
3. Wait for old cache to expire — **Rejected** (can take weeks, blocks CI in the meantime)
4. **Add cache bust to `sharedGlobals`** — **Chosen** (invalidates all cache, keeps caching enabled)

**Chosen Approach:** Add a runtime input to `sharedGlobals` in `nx.json` that changes the hash baseline for all tasks.

**Technical Rationale:**
- `sharedGlobals` is included in the `default` namedInput
- `default` is used by most task inputs
- Adding a runtime input changes the hash for ALL tasks
- New hash = no match with old cache entries = fresh builds
- The runtime output is constant, so subsequent runs WILL cache (not continuous invalidation)

**Implementation Details:**

**Cache Bust Addition (`nx.json`):**
```json
{
  "namedInputs": {
    "sharedGlobals": [
      "{workspaceRoot}/.github/workflows/ci.yml",
      { "runtime": "echo 'nx22-cache-bust:added=2025-12-12:remove-after=2026-01-12'" }
    ]
  }
}
```

**Key Points:**
- The string value is arbitrary but should be self-documenting with dates
- The `runtime` input executes the command and includes its output in the hash
- Since `echo` always outputs the same string, the hash is deterministic (caching works)
- The hash is just DIFFERENT from pre-bust hashes (old cache not hit)

**How It Works (Mental Model):**

```
Before bust:  hash("inputs") = abc123 → matches stale Nx 21 cache
After bust:   hash("inputs" + "bust-string") = xyz789 → no match, fresh build
Next CI run:  hash("inputs" + "bust-string") = xyz789 → matches NEW cache entry
```

The bust creates a new "cache namespace" that doesn't contain the old stale entries.

**Removal Criteria:**
- Safe to remove after ~30 days (old cache entries will have aged out)
- Removal will cause ONE cold CI run (fresh cache population)
- After that, caching resumes normally under original hash formula

**Warning Signs (for AI agents):**
- CI fails with module resolution errors after Nx version upgrade
- Local builds work, CI fails with "cached" tasks
- `--skip-nx-cache` fixes the issue locally
- Target configuration is correct per module-20 patterns

**When NOT to Use This:**
- Don't use for routine cache issues (check configuration first per module-20)
- Don't use if the target configuration is wrong (fix the config, not the cache)
- Only use after confirming: correct config + stale remote cache = root cause

**Applies To:**
- Major Nx version upgrades (e.g., 20→21, 21→22)
- Any situation where Nx Cloud remote cache becomes globally stale
- NOT for individual target cache issues (use proper inputs per module-20)

**References:**
- Related Finding: `module-20-nx-configuration-custom-target-cache-inputs-2025-12-05.md` (why `cache: false` is wrong)
- PR #42: Nx 22.x + @nx/expo infrastructure upgrade
- Nx Caching Documentation: https://nx.dev/concepts/how-caching-works
- Governing Document: `docs/architecture-decisions.md`

**Alignment Rationale:** This finding preserves the caching benefits documented in module-20 while providing an escape hatch for major version upgrades. It ensures CI reliability without sacrificing Nx's performance optimization.

### Manifest & Validation Checklist
1. [x] Add entry to `docs/memories/tech-findings-log/manifest.yaml`
2. [x] Governing artefact identified: `docs/architecture-decisions.md`
3. [ ] Set `validation_status: needs_review` (pending cache bust removal verification)
4. [x] Update `last_updated_by` and `last_updated_at` in manifest
5. [x] Cross-reference with module-20 (custom target cache inputs)
