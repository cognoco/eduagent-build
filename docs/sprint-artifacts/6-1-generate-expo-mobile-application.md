# Story 6.1: Generate Expo Mobile Application

Status: review

## Story

As a developer,
I want to generate an Expo mobile application using the @nx/expo generator,
so that I have a properly scaffolded mobile app integrated into the Nx monorepo with correct dependencies and configuration.

## Acceptance Criteria

1. **AC-6.1.1**: `pnpm exec nx g @nx/expo:application mobile --directory=apps/mobile` succeeds without errors
2. **AC-6.1.2**: `pnpm exec nx run mobile:start` launches Expo dev server and displays QR code
3. **AC-6.1.3**: `pnpm exec nx run mobile:lint` passes with no errors
4. **AC-6.1.4**: `pnpm exec nx run mobile:test` passes (default generated tests)
5. **AC-6.1.5**: TypeScript path aliases resolve correctly (can import from `@nx-monorepo/*` packages)
6. **AC-6.1.6**: Single React version validated (`pnpm why react` shows only 19.1.0)
7. **AC-6.1.7**: `nx graph` shows mobile app with correct dependency relationships

## Tasks / Subtasks

- [x] **Task 1: Generate Expo Application** (AC: 1) ✅
  - [x] 1.1 Run `pnpm exec nx g @nx/expo:application mobile --directory=apps/mobile`
  - [x] 1.2 Verify generator completes without errors
  - [x] 1.3 Verify `apps/mobile/` directory structure - **NOTE: Traditional RN structure, not Expo Router**
  - [x] 1.4 Nx targets inferred from package.json (no project.json - Nx 22 pattern)

- [x] **Task 2: Apply Post-Generation Checklist** (AC: 3, 4) ✅
  - [x] 2.1 Check `tsconfig.json` - `moduleResolution: bundler` ✅
  - [x] 2.2 Jest configuration uses `jest-expo` preset ✅
  - [x] 2.3 `metro.config.js` uses `withNxMetro` wrapper ✅
  - [x] 2.4 Fixed `app.json`: Set `newArchEnabled: false` (Legacy Architecture constraint)
  - [x] 2.5 Deviations documented below

- [x] **Task 3: Verify TypeScript Path Aliases** (AC: 5) ✅
  - [x] 3.1 Created test file: `apps/mobile/src/lib/api.ts`
  - [x] 3.2 Added import: `import type { paths } from '@nx-monorepo/api-client';`
  - [x] 3.3 Fixed: Added `"@nx-monorepo/api-client": "workspace:*"` to package.json
  - [x] 3.4 `pnpm exec nx run mobile:typecheck` passes ✅

- [x] **Task 4: Validate React Version Alignment** (AC: 6) ✅
  - [x] 4.1 `pnpm why react` - single version 19.1.0 ✅
  - [x] 4.2 `pnpm why react-native` - version 0.81.5 ✅
  - [x] 4.3 No resolution needed - versions aligned

- [x] **Task 5: Start Expo Dev Server** (AC: 2) ✅
  - [x] 5.1 `pnpm exec nx run mobile:start` launches successfully
  - [x] 5.2 Metro bundler starts on http://localhost:19000
  - [x] 5.3 QR code available via web interface (headless CLI doesn't render it)
  - [x] 5.4 No startup warnings

- [x] **Task 6: Run Lint and Test** (AC: 3, 4) ✅
  - [x] 6.1 `pnpm exec nx run mobile:lint` - PASSED
  - [x] 6.2 `pnpm exec nx run mobile:test` - PASSED (1 test)
  - [x] 6.3 No failures to fix
  - [x] 6.4 Test baseline: 1 test (App renders correctly)

- [x] **Task 7: Validate Nx Graph Integration** (AC: 7) ✅
  - [x] 7.1 `nx graph` shows project structure
  - [x] 7.2 `@nx-monorepo/mobile` appears in graph
  - [x] 7.3 Dependency: mobile → api-client (static) ✅
  - [x] 7.4 15 Nx targets available (start, build, test, lint, typecheck, etc.)

- [x] **Task 8: Update Documentation** (AC: all) ✅
  - [x] 8.1 Updated sprint-status.yaml
  - [x] 8.2 Issues documented below
  - [x] 8.3 Generator quirks documented below

## Dev Notes

### Version Context (Critical)

| Package | Required Version | Source |
|---------|-----------------|--------|
| Expo SDK | ~54.0.0 | @nx/expo 22.2.0 requirement |
| React Native | 0.81.5 | SDK 54 bundled version |
| React | 19.1.0 | Monorepo-wide via pnpm overrides |
| expo-router | ~6.0.17 | SDK 54 bundled version |
| @nx/expo | 22.2.0 | Installed in Epic 5b |

### Generator Command

```bash
pnpm exec nx g @nx/expo:application mobile --directory=apps/mobile
```

**Expected prompts/options:**
- May ask about test runner (Jest expected)
- May ask about bundler configuration
- Accept defaults unless specifically documented otherwise

### Expected Project Structure

```
apps/mobile/
├── app/                        # Expo Router routes (file-based)
│   ├── _layout.tsx             # Root layout
│   ├── index.tsx               # Home screen (/)
│   └── +not-found.tsx          # 404 handler (optional)
├── assets/                     # Static assets
├── src/
│   └── lib/                    # Utilities (to be added)
│       └── api.ts              # API client configuration (Story 6.2)
├── app.json                    # Expo configuration
├── babel.config.js             # Babel configuration
├── metro.config.js             # Metro bundler config
├── tsconfig.json               # TypeScript configuration
├── jest.config.ts              # Jest configuration
└── project.json                # Nx project configuration
```

### Metro Configuration (SDK 52+ Auto-Configuration)

Since SDK 52, Expo automatically configures Metro for monorepos. **No manual watchFolders configuration needed.**

Expected `metro.config.js`:
```javascript
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
module.exports = config;
```

If @nx/expo generator uses `withNxMetro`, it should be compatible with auto-configuration.

### Testing Configuration

Follow workspace testing patterns from `docs/memories/testing-reference.md`:
- Tests co-located in `src/` (or wherever generator places them)
- Jest preset: `jest-expo` (provided by @nx/expo)
- Test file pattern: `*.spec.ts` / `*.spec.tsx`

### Open Questions to Resolve During Implementation

| Question | Decision Point | Default |
|----------|----------------|---------|
| Expo Go vs Dev Build? | During Task 5 | Start with Expo Go for simplicity |
| ESLint mobile-specific rules? | During Task 6 | Use default @nx/expo lint config |
| Additional testing libraries? | Post-generation checklist | Add @testing-library/react-native if not included |

### Learnings from Previous Story

**From Story 5b-9 (Final Validation and Merge to Main):**

- **Fresh Clone Requirement**: After `pnpm install`, run `pnpm --filter @nx-monorepo/database db:generate` to generate Prisma client
- **Infrastructure Ready**: Nx 22.2.0, @nx/expo plugin, React 19.1.0 all validated and working
- **Test Baseline**: 222 tests passing before mobile app addition
- **Context for This Story**: Proceed with `nx g @nx/expo:application` - infrastructure foundation is solid

[Source: docs/sprint-artifacts/5b-9-final-validation-and-merge-to-main.md#Completion-Notes]

### Project Structure Notes

- **Alignment**: Mobile app follows same patterns as web app
- **Path aliases**: Uses `@nx-monorepo/*` scope via `tsconfig.base.json`
- **No app-to-app imports**: Mobile must not import from web (use shared packages)

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#Story-6.1]
- [Source: docs/sprint-artifacts/epic-6-design-decisions.md#D3-Nx-Generation-Approach]
- [Source: docs/architecture.md#Project-Structure]
- [Source: docs/memories/post-generation-checklist.md] - Apply after generation

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/stories/6-1-generate-expo-mobile-application.context.xml`

### Agent Model Used

- Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Nx Cloud runs for lint, test, typecheck: https://cloud.nx.app

### Completion Notes List

#### Implementation Findings (2025-12-13)

1. **Generator Creates Traditional RN Structure, NOT Expo Router**
   - @nx/expo:application generator (v22.2.0) creates `src/app/App.tsx` entry point
   - NOT the expected Expo Router file-based routing structure (`app/` directory with `_layout.tsx`)
   - This is acceptable for Story 6.1 - Expo Router migration can be a future story if needed

2. **No project.json - Inferred Targets**
   - Nx 22 uses inferred targets from `package.json` rather than explicit `project.json`
   - All expected targets available (start, build, lint, test, typecheck, etc.)
   - 15 total targets inferred by @nx/expo plugin

3. **Workspace Dependencies Required for Path Aliases**
   - Generator doesn't add workspace dependencies to `package.json`
   - **Manual fix required**: Add `"@nx-monorepo/api-client": "workspace:*"` to dependencies
   - Without this, `pnpm` doesn't create symlinks and TypeScript can't resolve modules
   - Nx project references alone are insufficient - pnpm workspace protocol required

4. **Legacy Architecture Constraint Applied**
   - Generator set `newArchEnabled: true` by default
   - **Fixed**: Set to `false` per SDK 54 Legacy Architecture constraint
   - SDK 54 is the last version supporting Legacy Architecture

5. **TypeScript Configuration**
   - Uses composite TypeScript with project references (Nx 22 pattern)
   - `customConditions: ["@nx-monorepo/source"]` in tsconfig.base.json
   - Package exports use `@nx-monorepo/source` condition for source resolution

#### Post-Generation Checklist Applied

| Check | Result | Notes |
|-------|--------|-------|
| moduleResolution | `bundler` | Correct for SDK 54 |
| Jest preset | `jest-expo` | Correct |
| Metro config | `withNxMetro` | Monorepo compatible |
| newArchEnabled | Fixed to `false` | Required for Legacy Arch |
| Workspace deps | Added manually | Required for path aliases |

### File List

**Generated/Modified Files:**

| File | Action | Notes |
|------|--------|-------|
| `apps/mobile/` | Generated | Complete Expo app structure |
| `apps/mobile/app.json` | Modified | Set `newArchEnabled: false` |
| `apps/mobile/package.json` | Modified | Added `@nx-monorepo/api-client` dependency |
| `apps/mobile/src/lib/api.ts` | Created | Path alias test file |
| `apps/mobile/tsconfig.app.json` | Modified | nx sync added project reference |

**Key Generated Files:**

- `apps/mobile/src/app/App.tsx` - Main application component
- `apps/mobile/src/app/App.spec.tsx` - Test file (1 test)
- `apps/mobile/metro.config.js` - Metro bundler with `withNxMetro`
- `apps/mobile/jest.config.cts` - Jest configuration
- `apps/mobile/.babelrc.js` - Babel configuration
- `apps/mobile/eas.json` - EAS Build configuration
