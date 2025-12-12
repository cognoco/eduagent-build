# Story 5b.7: Install and Configure Expo CLIs

**Status:** done

---

## User Story

As a mobile developer,
I want the Expo and EAS CLIs properly installed and configured,
So that I can run development commands and cloud builds.

---

## Acceptance Criteria

**Given** @nx/expo plugin is installed
**When** I install and configure the CLIs
**Then** the following are working:

**Expo CLI (bundled with expo package):**
- `npx expo --version` returns version info
- `npx expo doctor` runs successfully

**EAS CLI (separate global install):**
- `npm install -g eas-cli` completes successfully
- `eas --version` returns version info
- `eas login` authenticates with Expo account
- `eas whoami` confirms logged-in user

**And** EAS project is initialized (if needed): `eas init`
**And** CLI versions are documented in `docs/tech-stack.md`

---

## Implementation Details

### Tasks / Subtasks

- [x] **Task 1:** Verify Expo CLI availability
  - [x] Expo CLI is bundled with `expo` package
  - [x] Run `npx expo --version` → 54.0.19
  - [x] Run `npx expo-doctor` to check setup (16/17 passed; known Jest 30 version warning)

- [x] **Task 2:** Install EAS CLI
  - [x] EAS CLI already installed globally → 16.28.0
  - [x] Alternatively: Add to devDependencies for CI consistency (documented, not added)
  - [x] Verify with `eas --version` → 16.28.0

- [x] **Task 3:** Configure EAS authentication
  - [x] Run `eas login`
  - [x] Authenticate with Expo account (jojorgen)
  - [x] Verify with `eas whoami` → jojorgen (accounts: jojorgen, zwizzly)

- [x] **Task 4:** Initialize EAS project (if needed)
  - [x] Deferred to Epic 6 - no mobile app exists yet
  - [x] `eas init` will be run in Story 6-1 when Expo app is generated

- [x] **Task 5:** Document CLI setup
  - [x] Update `docs/tech-stack.md` with CLI versions
  - [x] Add CLI commands reference to documentation
  - [x] Add Mobile Stack section with Expo/EAS versions
  - [x] Add Expo to compatibility matrix

- [x] **Task 6:** Consider CI configuration
  - [x] Document EAS CLI setup for CI in tech-stack.md
  - [x] Note authentication requirements (EXPO_TOKEN)
  - [x] Document --non-interactive and --no-wait flags

### Technical Summary

**Two CLIs, Two Purposes:**

| CLI | Installation | Purpose |
|-----|--------------|---------|
| **Expo CLI** | Bundled with `expo` package | Local development: `expo start`, `expo install`, `expo doctor` |
| **EAS CLI** | Global or devDependency | Cloud services: builds, updates, submissions |

**Expo CLI Commands:**
```bash
npx expo start          # Start Metro bundler
npx expo install        # Install compatible packages
npx expo doctor         # Diagnose project issues
npx expo prebuild       # Generate native directories
```

**EAS CLI Commands:**
```bash
eas login               # Authenticate with Expo account
eas init                # Initialize EAS project
eas build               # Create cloud builds
eas update              # Push OTA updates
eas submit              # Submit to app stores
```

### Project Structure Notes

- **Files to modify:** `docs/tech-stack.md`, potentially `package.json` (if adding eas-cli as devDep)
- **Expected test locations:** N/A (tooling installation)
- **Estimated effort:** 1 story point (~1-2 hours)
- **Prerequisites:** Story 5b.6 complete

### Key Code References

- `package.json` - May add eas-cli
- `docs/tech-stack.md` - CLI documentation
- Future: `eas.json` - EAS configuration (Epic 6)

---

## Context References

**Tech-Spec:** See `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md` for:
- Expo SDK 54 tooling requirements

**Architecture:**
- Expo official documentation: https://docs.expo.dev/more/expo-cli/
- EAS documentation: https://docs.expo.dev/eas/

---

## Handover Context

- **Assigned Persona:** 💻 Dev (Mort)
- **From:** 🏗️ Architect (Vimes) - Story 5b.6 (@nx/expo installed)
- **Artifacts produced:** Expo CLI verified, EAS CLI installed and authenticated, docs/tech-stack.md updated
- **Handover to:** 📚 Tech Writer (Twoflower) for Story 5b.8
- **Context for next:** All tooling installed; document the upgrade for team awareness

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101) via BMAD Dev Agent (Mort)

### Debug Log References

- **Task 1**: `npx expo --version` returned 54.0.19. `npx expo-doctor` (formerly `expo doctor`) ran with 16/17 checks passing. Known warnings for Jest 30 vs expected 29.7 and @types/react version differences are intentional project choices.
- **Task 2**: EAS CLI was already installed globally (16.28.0). No action needed.
- **Task 3**: EAS login initially hung in WSL (known issue with interactive prompts). User authenticated via browser/token method. `eas whoami` confirmed jojorgen with access to jojorgen and zwizzly accounts.
- **Task 4**: Deferred - no mobile app exists (only web, server, web-e2e in apps/). Will run `eas init` in Epic 6 Story 6-1.
- **Task 5-6**: Updated docs/tech-stack.md with comprehensive Mobile Stack section including CLI versions, commands reference, and CI/CD configuration.

### Completion Notes

All acceptance criteria satisfied:
- ✅ Expo CLI verified (54.0.19, bundled with expo package)
- ✅ EAS CLI working (16.28.0, global install)
- ✅ EAS authentication configured (jojorgen account)
- ✅ EAS init deferred appropriately to Epic 6
- ✅ CLI versions documented in docs/tech-stack.md with commands reference
- ✅ CI configuration documented (EXPO_TOKEN, --non-interactive flags)

### Files Modified

- `docs/tech-stack.md` - Added Mobile Stack (Expo) section with:
  - CLI version table (expo 54.0.0, @nx/expo 22.2.0, eas-cli 16.28.0)
  - CLI commands reference (expo and eas commands)
  - CI/CD configuration with EXPO_TOKEN setup
  - Compatibility matrix entry for Expo SDK
  - Reference documentation links
- `docs/sprint-artifacts/sprint-status.yaml` - Status: ready-for-dev → in-progress → review
- `docs/sprint-artifacts/5b-7-install-and-configure-expo-clis.md` - Task checkboxes, Dev Agent Record

### Test Results

- Lint: ✅ Passed (0 errors, 3 pre-existing warnings in server middleware)
- No code changes requiring unit tests (tooling installation/documentation only)

---

## Review Notes

<!-- Will be populated during code review -->

---

## Senior Developer Review (AI)

### Reviewer
Jørn (via BMAD Code Review Workflow)

### Date
2025-12-12

### Outcome
**✅ APPROVE**

All acceptance criteria satisfied, all tasks verified complete, no significant issues found.

### Summary
Story 5b.7 successfully installed and configured the Expo and EAS CLIs for mobile development. The Expo CLI (bundled with expo 54.0.0) was verified working, the EAS CLI was confirmed globally installed and authenticated with the Expo account (jojorgen), and comprehensive documentation was added to `docs/tech-stack.md` including CLI commands reference and CI/CD configuration with EXPO_TOKEN.

### Key Findings

**No blocking issues found.**

| Severity | Count | Description |
|----------|-------|-------------|
| 🔴 HIGH | 0 | - |
| 🟠 MEDIUM | 0 | - |
| 🟡 LOW | 1 | React Native version documentation inconsistency (advisory) |

### Acceptance Criteria Coverage

| AC# | Description | Status | Evidence |
|-----|-------------|--------|----------|
| AC1 | `npx expo --version` returns version info | ✅ IMPLEMENTED | Story debug log: 54.0.19 |
| AC2 | `npx expo doctor` runs successfully | ✅ IMPLEMENTED | Story debug log: 16/17 checks passing |
| AC3 | `npm install -g eas-cli` completes successfully | ✅ IMPLEMENTED | Story debug log: already installed globally (16.28.0) |
| AC4 | `eas --version` returns version info | ✅ IMPLEMENTED | Story debug log: 16.28.0 |
| AC5 | `eas login` authenticates with Expo account | ✅ IMPLEMENTED | Story debug log: browser/token authentication |
| AC6 | `eas whoami` confirms logged-in user | ✅ IMPLEMENTED | Story debug log: jojorgen confirmed |
| AC7 | EAS project initialized (if needed) | ✅ IMPLEMENTED | Correctly deferred to Epic 6 |
| AC8 | CLI versions documented in tech-stack.md | ✅ IMPLEMENTED | Mobile Stack section (lines 106-168) |

**Summary: 8 of 8 acceptance criteria fully implemented**

### Task Completion Validation

| Task | Description | Marked | Verified | Evidence |
|------|-------------|--------|----------|----------|
| 1 | Verify Expo CLI availability | [x] | ✅ VERIFIED | expo 54.0.19, expo-doctor 16/17 |
| 2 | Install EAS CLI | [x] | ✅ VERIFIED | eas-cli 16.28.0 global |
| 3 | Configure EAS authentication | [x] | ✅ VERIFIED | jojorgen authenticated |
| 4 | Initialize EAS project | [x] | ✅ VERIFIED | Correctly deferred to Epic 6 |
| 5 | Document CLI setup | [x] | ✅ VERIFIED | Mobile Stack in tech-stack.md |
| 6 | Consider CI configuration | [x] | ✅ VERIFIED | EXPO_TOKEN documented |

**Summary: 6 of 6 completed tasks verified, 0 questionable, 0 false completions**

### Test Coverage and Gaps

- **Unit Tests:** N/A - Tooling/documentation story, no application code changed
- **Integration Tests:** N/A
- **Lint Check:** ✅ Passed (0 errors)

### Architectural Alignment

- ✅ **Tech-Spec Compliance:** Aligns with epic-5b-nx-upgrade-analysis.md requirements
- ✅ **Documentation Standards:** Follows established tech-stack.md format
- ✅ **No Unauthorized Dependencies:** No package.json changes in this story

### Security Notes

- ✅ **No secrets in documentation** - Proper use of environment variables
- ✅ **EXPO_TOKEN** correctly documented as repository secret
- ✅ **No hardcoded credentials**

### Best-Practices and References

- [Expo CLI Documentation](https://docs.expo.dev/more/expo-cli/)
- [EAS CLI Documentation](https://docs.expo.dev/eas/)
- [EAS Build CI/CD](https://docs.expo.dev/build/building-on-ci/)

### Action Items

**Code Changes Required:**
- [ ] [Low] Correct React Native version in tech-stack.md from "0.79" to "0.81.5" [file: docs/tech-stack.md:119, 333]

**Advisory Notes:**
- Note: The React Native version inconsistency (documented as 0.79 vs actual 0.81.5) should be corrected in Story 5b.8 (Update Documentation)
- Note: The Jest 30 vs 29.7 warning from expo-doctor is expected and documented as intentional project choice

---

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2025-12-12 | 1.0 | Story drafted with ACs and tasks |
| 2025-12-12 | 1.1 | Implementation complete, all tasks checked |
| 2025-12-12 | 1.2 | Senior Developer Review (AI) - APPROVED. Status: review → done |
