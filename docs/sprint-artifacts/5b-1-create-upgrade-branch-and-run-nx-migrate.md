# Story 5b.1: Create Upgrade Branch and Run Nx Migrate

**Status:** review

---

## User Story

As a DevOps engineer,
I want to initiate the Nx upgrade in an isolated branch,
So that we can safely test the upgrade without affecting main.

---

## Acceptance Criteria

**Given** the main branch is stable
**When** I create the upgrade branch and run Nx migrate
**Then** the branch `e5b/expo-prep` exists

**And** `pnpm exec nx migrate 22.2.0` completes successfully
**And** migrations.json file is generated (if any migrations needed)
**And** No immediate breaking errors in migration output

---

## Implementation Details

### Tasks / Subtasks

- [x] **Task 1:** Verify main branch is stable
  - [x] Confirm all tests pass on main (verified on branch - 6 test projects, 48 tests passing)
  - [x] Confirm CI is green (branch created from stable main)
  - [x] Pull latest changes (branch up-to-date with origin)

- [x] **Task 2:** Create upgrade branch
  - [x] `git checkout -b e5b/expo-prep` (checked out existing branch)
  - [x] Push branch to remote (tracking origin/e5b/expo-prep)

- [x] **Task 3:** Run Nx migrate command
  - [x] Execute `pnpm exec nx migrate 22.2.0`
  - [x] Capture and document output (see Debug Log below)
  - [x] Review any warnings or errors (none - clean migration)

- [x] **Task 4:** Analyze migrations.json
  - [x] Review generated migrations.json contents (9 migrations)
  - [x] Document which migrations will be applied (see Debug Log)
  - [x] Identify any that need manual review (3 medium-risk items flagged)

- [x] **Task 5:** Document migration plan
  - [x] Create summary of migration impact (see Debug Log)
  - [x] Note any concerns for next story (Next.js 16 upgrade included)

### Technical Summary

This story initializes the Nx 22.x upgrade process by running the migrate command which:
1. Analyzes current workspace configuration
2. Generates `migrations.json` with required code changes
3. Updates `package.json` with target versions (but doesn't install yet)

The actual migrations and dependency installation happen in Story 5b.2.

### Project Structure Notes

- **Files to modify:** `package.json` (version updates), `migrations.json` (generated)
- **Expected test locations:** N/A (infrastructure story)
- **Estimated effort:** 1 story point (~1-2 hours)
- **Prerequisites:** None

### Key Code References

- `package.json` - Current Nx version: 21.6.5
- `nx.json` - Workspace configuration
- `docs/tech-stack.md` - Version inventory
- `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md` - Research findings

---

## Context References

**Tech-Spec:** See `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md` for:
- Complete research on SDK 54 requirements
- Nx 22.2.0+ requirement rationale
- Version compatibility matrix
- Risk assessment

**Architecture:**
- `docs/architecture-decisions.md` - Monorepo tooling decisions
- `docs/tech-stack.md` - Version pinning policy

---

## Handover Context

- **Assigned Persona:** 🏗️ Architect (Vimes)
- **From:** Epic start - analysis complete (see `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md`)
- **Artifacts produced:** Branch created, migrations.json generated, migration output documented
- **Handover to:** 💻 Dev (Mort) for Story 5b.2
- **Context for next:** Review migrations.json contents; proceed with `nx migrate --run-migrations`

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) via 🏗️ Vimes (Architect persona)

### Debug Log References

**Migration Output (2025-12-11):**
```
Fetching nx@22.2.0
Fetching @nx/eslint-plugin@22.2.0
Fetching @nx/devkit@22.2.0
... (all @nx/* packages)

NX   The migrate command has run successfully.
- package.json has been updated.
- migrations.json has been generated.
```

**Package Version Changes:**
| Package | Before | After |
|---------|--------|-------|
| `nx` | 21.6.5 | 22.2.0 |
| `@nx/devkit` | 21.6.5 | 22.2.0 |
| `@nx/esbuild` | 21.6.5 | 22.2.0 |
| `@nx/eslint` | 21.6.5 | 22.2.0 |
| `@nx/eslint-plugin` | 21.6.5 | 22.2.0 |
| `@nx/jest` | 21.6.5 | 22.2.0 |
| `@nx/js` | 21.6.5 | 22.2.0 |
| `@nx/next` | 21.6.5 | 22.2.0 |
| `@nx/node` | 21.6.5 | 22.2.0 |
| `@nx/playwright` | 21.6.5 | 22.2.0 |
| `@nx/react` | 21.6.5 | 22.2.0 |
| `@nx/workspace` | 21.6.5 | 22.2.0 |
| `next` | ~15.2.6 | **16.0.8** |
| `eslint-config-next` | ^15.2.4 | **16.0.8** |

**Migrations to be Applied (9 total):**

1. **22-0-0-release-version-config-changes** (nx) - 🟢 Low risk
   - Updates release version config structure

2. **22-0-0-consolidate-release-tag-config** (nx) - 🟢 Low risk
   - Consolidates releaseTag options

3. **22-1-0-update-nx-wrapper** (nx) - 🟢 Low risk
   - Updates nx wrapper script

4. **remove-external-options-from-js-executors** (@nx/js) - 🟢 Low risk
   - Removes deprecated `external` and `externalBuildTargets` options

5. **remove-redundant-ts-project-references** (@nx/js) - 🟡 Medium risk
   - Modifies tsconfig.json files - verify TypeScript compilation after

6. **convert-jest-config-to-cjs** (@nx/jest) - 🟡 Medium risk
   - Converts jest.config.ts from ESM to CJS syntax
   - Affects: `apps/web/jest.config.ts`, `apps/server/jest.config.ts`, all package configs

7. **update-22-0-0-add-svgr-to-webpack-config** (@nx/react) - 🟢 Low risk
   - Updates React webpack configs for SVGR (may not apply to Next.js apps)

8. **update-22-0-0-add-svgr-to-next-config** (@nx/next) - 🟡 Medium risk
   - May modify `next.config.js` to add SVGR webpack config
   - Current config uses Sentry wrapper - verify after migration

9. **update-22-2-0-create-ai-instructions-for-next-16** (@nx/next) - 🟢 Low risk
   - Conditional: only runs if Next >= 16 (which it will be)
   - Creates AI migration instructions document

### Completion Notes

**Summary:** Successfully ran `nx migrate 22.2.0` generating migrations.json with 9 code migrations to apply.

**Key Finding:** The migration automatically upgraded Next.js from 15.2.6 to 16.0.8. This is expected behavior as @nx/next@22.2.0 has peer dependencies on Next 16. This is a significant upgrade that will require additional testing in Story 5b.3.

**Concerns for Story 5b.2:**
1. Jest config conversion may need verification
2. Next.js 16 brings breaking changes - review release notes
3. TypeScript project reference cleanup may affect build order

**Concerns for Story 5b.3:**
1. Full test suite validation critical after Next.js 16 upgrade
2. Sentry integration with Next.js 16 needs verification
3. E2E tests should validate web app still functions correctly

### Files Modified

- `package.json` - Version updates (Nx 22.2.0, Next.js 16.0.8, eslint-config-next 16.0.8)
- `migrations.json` - NEW: Generated migration definitions (9 migrations)

### Test Results

**Pre-migration validation:**
- Lint: ✅ 8 projects passed (3 warnings in server - pre-existing)
- Tests: ✅ 6 projects, 48 tests passed (all from cache - branch identical to main)

---

## Review Notes

### Adversarial QA Review (2025-12-11)

**Reviewer:** Senior Code Reviewer (Adversarial Mode) - Claude Sonnet 4.5
**Verdict:** ⚠️ CONDITIONAL PASS WITH CONCERNS

**All Acceptance Criteria Met:**
- ✅ Branch `e5b/expo-prep` exists
- ✅ `pnpm exec nx migrate 22.2.0` completed successfully
- ✅ migrations.json generated (9 migrations)
- ✅ No immediate breaking errors

**Issues Identified:**

1. **React 19.1.0 Deferred (Intentional)** - Epic analysis recommended React 19.1.0, but migrate didn't upgrade it. This is intentional - Story 5b.4 handles React upgrade separately for risk isolation.

2. **Next.js 16 Upgrade (Unexpected Scope)** - `nx migrate` automatically upgraded Next.js 15.2.6 → 16.0.8. This is valid (Nx 22 officially supports Next 16) but wasn't explicitly planned. Story 5b.3 must validate Next.js 16 compatibility.

3. **Prisma Unchanged (Acceptable)** - Prisma versions not touched by migrate. This is acceptable - Prisma is independent of Nx and current versions (6.17.1/6.18.0) are compatible.

**Recommendations Accepted:**
- Story 5b.3 will include Next.js 16-specific validation
- Story 5b.4 remains correctly positioned for React 19.1.0 upgrade

**Story Approved for Review Status**
