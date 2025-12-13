# Story 6.5: Document Mobile Development Setup

Status: ready-for-dev

## Story

As a new mobile developer joining the project,
I want comprehensive documentation for mobile development setup and workflow,
So that I can get started quickly and troubleshoot common issues independently.

## Acceptance Criteria

1. **AC-6.5.1**: README section for mobile development added (or dedicated `apps/mobile/README.md`)
2. **AC-6.5.2**: iOS Simulator setup documented with prerequisites and launch commands
3. **AC-6.5.3**: Android Emulator setup documented with prerequisites and launch commands
4. **AC-6.5.4**: Network configuration for local development documented (localhost, 10.0.2.2)
5. **AC-6.5.5**: Running against staging API documented
6. **AC-6.5.6**: Troubleshooting section with common issues and solutions
7. **AC-6.5.7**: New developer can follow docs to run mobile app within 15 minutes

## Tasks / Subtasks

- [ ] **Task 1: Create Mobile README Structure** (AC: 1)
  - [ ] 1.1 Create `apps/mobile/README.md` (or add section to root README)
  - [ ] 1.2 Add table of contents for easy navigation
  - [ ] 1.3 Include quick start section at the top
  - [ ] 1.4 Add badges for Expo SDK version and platform support

- [ ] **Task 2: Document Prerequisites** (AC: 2, 3)
  - [ ] 2.1 Document Node.js version requirement (from root package.json)
  - [ ] 2.2 Document pnpm version requirement
  - [ ] 2.3 Document Xcode installation and version (for iOS)
  - [ ] 2.4 Document Android Studio installation and version (for Android)
  - [ ] 2.5 Document Expo CLI (bundled) usage
  - [ ] 2.6 Document EAS CLI (optional, for cloud builds)
  - [ ] 2.7 Include links to official installation guides

- [ ] **Task 3: Document iOS Simulator Setup** (AC: 2)
  - [ ] 3.1 List macOS-only requirement
  - [ ] 3.2 Document Xcode installation from App Store
  - [ ] 3.3 Document Xcode Command Line Tools installation
  - [ ] 3.4 Document iOS Simulator launch via Xcode
  - [ ] 3.5 Document `pnpm exec nx run mobile:run-ios` command
  - [ ] 3.6 Include screenshot of successful iOS launch (optional)

- [ ] **Task 4: Document Android Emulator Setup** (AC: 3)
  - [ ] 4.1 Document Android Studio installation
  - [ ] 4.2 Document AVD (Android Virtual Device) creation
  - [ ] 4.3 Recommend emulator specs (API level, device profile)
  - [ ] 4.4 Document emulator launch via Android Studio
  - [ ] 4.5 Document `pnpm exec nx run mobile:run-android` command
  - [ ] 4.6 Document ANDROID_HOME environment variable
  - [ ] 4.7 Include screenshot of successful Android launch (optional)

- [ ] **Task 5: Document Network Configuration** (AC: 4)
  - [ ] 5.1 Explain localhost differences between platforms
  - [ ] 5.2 Document iOS Simulator networking (uses host localhost)
  - [ ] 5.3 Document Android Emulator networking (10.0.2.2 alias)
  - [ ] 5.4 Document environment variable configuration for API URL
  - [ ] 5.5 Include diagram showing network topology
  - [ ] 5.6 Document how to verify API connectivity from mobile

- [ ] **Task 6: Document Development Workflow** (AC: 1-5)
  - [ ] 6.1 Document daily development commands:
    - Starting server: `pnpm exec nx run server:serve`
    - Starting mobile: `pnpm exec nx run mobile:start`
    - Running tests: `pnpm exec nx run mobile:test`
    - Running linter: `pnpm exec nx run mobile:lint`
  - [ ] 6.2 Document Expo Go vs Development Build differences
  - [ ] 6.3 Document hot reload and fast refresh behavior
  - [ ] 6.4 Document debugging with React DevTools

- [ ] **Task 7: Document Staging API Testing** (AC: 5)
  - [ ] 7.1 Document how to point mobile app at staging API
  - [ ] 7.2 Include staging API URL (Railway)
  - [ ] 7.3 Document physical device testing with staging URL
  - [ ] 7.4 Note: Physical devices cannot reach localhost

- [ ] **Task 8: Create Troubleshooting Section** (AC: 6)
  - [ ] 8.1 Document common issues:
    - Metro bundler not starting
    - "Network request failed" error
    - iOS Simulator not found
    - Android emulator not detected
    - TypeScript path alias resolution
    - Watchman issues (if applicable)
  - [ ] 8.2 Include symptom, cause, and solution for each
  - [ ] 8.3 Link to Expo troubleshooting docs
  - [ ] 8.4 Add section for reporting new issues

- [ ] **Task 9: Validate Documentation** (AC: 7)
  - [ ] 9.1 Fresh checkout test: clone repo to new location
  - [ ] 9.2 Follow documentation step-by-step
  - [ ] 9.3 Time the process (target: < 15 minutes)
  - [ ] 9.4 Note any unclear or missing steps
  - [ ] 9.5 Update documentation based on findings

- [ ] **Task 10: Cross-Reference Other Docs** (AC: 1)
  - [ ] 10.1 Add mobile section reference to root README.md
  - [ ] 10.2 Update CLAUDE.md if mobile commands are important
  - [ ] 10.3 Link from mobile docs to tech-stack.md for version info
  - [ ] 10.4 Link to epic-6-design-decisions.md for architectural context

- [ ] **Task 11: Update Sprint Status** (AC: all)
  - [ ] 11.1 Update sprint-status.yaml: set 6-5 status to done
  - [ ] 11.2 Document completion notes in Dev Agent Record

## Dev Notes

### Documentation Structure

Recommended structure for `apps/mobile/README.md`:

```markdown
# Mobile App (Expo)

## Quick Start
- 4-5 commands to get running

## Prerequisites
- Node.js, pnpm, Xcode/Android Studio

## iOS Development
- Simulator setup and commands

## Android Development
- Emulator setup and commands

## Network Configuration
- API URLs and localhost considerations

## Development Workflow
- Daily commands, testing, debugging

## Testing Against Staging
- Using Railway staging API

## Troubleshooting
- Common issues and solutions

## Further Reading
- Links to related docs
```

### Key Commands Reference

```bash
# Start Expo dev server
pnpm exec nx run mobile:start

# Run on iOS Simulator (macOS only)
pnpm exec nx run mobile:run-ios

# Run on Android Emulator
pnpm exec nx run mobile:run-android

# Run tests
pnpm exec nx run mobile:test

# Run linter
pnpm exec nx run mobile:lint

# Build for production (EAS)
eas build --platform ios
eas build --platform android
```

### Network Configuration Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Local Development                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     localhost:4000    ┌──────────────────┐│
│  │ iOS Simulator│ ─────────────────────▶│  Express Server  ││
│  └──────────────┘                        │  (Host Machine)  ││
│                                          │                  ││
│  ┌──────────────┐    10.0.2.2:4000      │  localhost:4000  ││
│  │Android Emul. │ ─────────────────────▶│                  ││
│  └──────────────┘                        └──────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  Physical Device Testing                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    https://api.xxx    ┌──────────────────┐│
│  │Physical Phone│ ─────────────────────▶│  Railway Staging ││
│  └──────────────┘   (Public HTTPS)      │  (Public API)    ││
│                                          └──────────────────┘│
│                                                              │
│  NOTE: Physical devices cannot reach localhost               │
│        Must use staging or tunneling (ngrok)                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Common Troubleshooting Reference

| Issue | Symptom | Cause | Solution |
|-------|---------|-------|----------|
| Metro won't start | "Unable to start server" | Port 8081 in use | Kill process on 8081, or use `--port 8082` |
| Network request failed | API calls fail | Wrong localhost URL | iOS: localhost, Android: 10.0.2.2 |
| iOS Simulator not found | "No iOS devices found" | Xcode not installed | Install Xcode from App Store |
| Android emulator missing | "No Android devices" | AVD not running | Start emulator from Android Studio |
| Path alias errors | Module not found | Metro config | Verify metro.config.js has monorepo support |
| Hot reload not working | Changes don't appear | Metro cache | Clear with `npx expo start --clear` |

### Prerequisites Checklist

**For iOS Development (macOS only):**
- [ ] macOS (any recent version)
- [ ] Xcode (latest stable from App Store)
- [ ] Xcode Command Line Tools: `xcode-select --install`
- [ ] iOS Simulator (bundled with Xcode)
- [ ] Accept Xcode license: `sudo xcodebuild -license accept`

**For Android Development (any OS):**
- [ ] Android Studio (latest stable)
- [ ] Android SDK (via Android Studio)
- [ ] At least one AVD (Android Virtual Device) created
- [ ] ANDROID_HOME environment variable set
- [ ] platform-tools in PATH

**For Both:**
- [ ] Node.js 18+ (check with `node -v`)
- [ ] pnpm 8+ (check with `pnpm -v`)
- [ ] Repository cloned and dependencies installed

### Time Estimates

| Step | Estimated Time |
|------|----------------|
| Prerequisites (first time) | 30-60 minutes |
| Clone and install | 5 minutes |
| Start server | 1 minute |
| Start mobile + simulator | 2-3 minutes |
| **Total (with prereqs)** | **~1 hour first time** |
| **Total (returning dev)** | **~10 minutes** |

### References

- [Source: docs/epics.md#Epic-6-Story-5] - Original story definition
- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#Story-6.5] - Detailed acceptance criteria
- [Source: docs/sprint-artifacts/epic-6-design-decisions.md] - SDK 54 architectural decisions
- [Source: docs/tech-stack.md] - Version information
- [Expo Documentation](https://docs.expo.dev)
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos)
- [React Native Networking](https://reactnative.dev/docs/network)

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/6-5-document-mobile-development-setup.context.xml` (generated 2025-12-13)

### Agent Model Used

<!-- To be filled during implementation -->

### Debug Log References

<!-- To be populated during implementation -->

### Validation Test Results

<!-- To be populated during implementation:
- Fresh clone test date/time
- Time taken to complete setup
- Any documentation gaps discovered
-->

### Completion Notes List

<!-- To be populated during implementation -->

### File List

<!-- Files created/modified - to be populated during implementation:
- apps/mobile/README.md
- README.md (mobile section added)
-->

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | SM Agent (Rincewind) | Initial draft |
| 2025-12-13 | SM Agent (Rincewind) | Added epics.md citation, Change Log section (validation fixes) |
| 2025-12-13 | SM Agent (Rincewind) | Generated story context XML, marked ready-for-dev |
