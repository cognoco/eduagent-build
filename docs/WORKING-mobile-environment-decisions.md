# WORKING: Mobile Environment Decisions

> **Status:** Working document for decision session
> **Date:** 2025-12-13
> **Participants:** Jørn, Vimes (Architect)
> **Final destination:** `docs/mobile-environment-strategy.md`

---

## Phase 1: Mobile Development Education

### The Mobile App Lifecycle (Code → User's Device)

Unlike web apps, mobile apps don't just "get served." They go through a **compilation and distribution** process:

```
SOURCE CODE (TypeScript/JavaScript + React Native)
        │
        ▼
DEVELOPMENT MODE
  • Metro Bundler serves JS over network
  • Device runs a "shell app" (Expo Go or Dev Build) that loads your JS
  • Changes hot-reload instantly
  • NO native compilation needed
        │
        ▼
BUILD PROCESS (Required for production)
  • JS bundle created (your code, minified)
  • Native shell compiled (iOS: Xcode, Android: Gradle)
  • Assets embedded (images, fonts)
  • Output: .ipa (iOS) or .apk/.aab (Android)
        │
        ▼
DISTRIBUTION
  • Internal: TestFlight (iOS), Internal Track (Android), direct APK
  • Production: App Store (iOS), Play Store (Android)
  • Requires: Developer accounts ($99/yr Apple, $25 once Google)
  • Review: Apple 24-48hrs, Google 1-3 days (first app longer)
```

### Development vs Production: Different Beasts

| Aspect | Development Mode | Production |
|--------|-----------------|------------|
| **JS Code** | Served over network by Metro | Bundled inside the app |
| **Native Code** | Pre-built shell (Expo Go or Dev Build) | Custom compiled for your app |
| **Updates** | Instant hot reload | App Store submission (or OTA) |
| **Installation** | Expo Go + QR scan, or pre-installed Dev Build | Download from store |
| **Native APIs** | Limited to shell's built-in modules | Can use any native module |

### Expo Go vs Development Build

#### Expo Go
- Pre-built app from App Store / Play Store
- Contains all of Expo's standard native modules
- Your JS code runs INSIDE this shell
- **Pros:** Zero setup, just scan QR, fast iteration
- **Cons:** Can't add custom native modules, doesn't match production behavior

#### Development Build
- A debug version of YOUR actual app
- Compiled specifically for your project
- Includes `expo-dev-client` for development features
- **Pros:** Matches production, can add any native module, test real app behavior
- **Cons:** Requires build (5-30 min), need developer accounts for device install

### EAS (Expo Application Services)

| Service | What It Does | Cost |
|---------|--------------|------|
| **EAS Build** | Compiles your app in the cloud (no Xcode/Android Studio needed locally) | Free tier: 30 builds/month |
| **EAS Submit** | Uploads to App Store / Play Store | Free |
| **EAS Update** | Push JS-only updates without App Store review | Free tier available |

### The Networking Problem

```
YOUR MACHINE (WSL)                        YOUR PHONE
┌─────────────────────────┐              ┌─────────────────────────┐
│ Metro Bundler (:8081)   │◄────────────►│ Expo Go / Dev Build     │
│      ✅ Works           │   Tunnel     │ (loads JS bundle)       │
│                         │              │                         │
│ Express Server (:4000)  │◄─────X───────│ Your App Code           │
│      ❌ Unreachable     │  Can't reach │ (tries to call API)     │
│                         │  localhost   │                         │
└─────────────────────────┘              └─────────────────────────┘

WHY?
• Metro uses ngrok tunnel → Creates public URL → Phone can reach it
• Express server has NO tunnel → localhost:4000 is YOUR machine
• Phone's "localhost" is the PHONE, not your machine

SOLUTIONS:
1. Tunnel the backend too (ngrok/localtunnel for Express)
2. Use deployed staging backend (Railway)
3. Use emulator instead (localhost works differently)
4. Configure WSL mirrored networking + same WiFi
```

---

## Context

- Moving away from Expo Go (except possibly quick smoke tests)
- Have paid EAS subscription (not just free tier)
- Goal: Gold standard template quality
- Must integrate with existing environment strategy

---

## Domain 1: Local Development

### Decision 1.1: Primary Development Method

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Emulators + Dev Build** | iOS Simulator / Android Emulator with a development build | Production-accurate, localhost works, fast iteration | Requires Xcode (Mac) for iOS, Android Studio setup |
| **B. Physical Device + Dev Build** | Development build installed on real device | Real device testing, no emulator overhead | Build required for each change to native code, networking complexity |
| **C. Hybrid** | Emulator for daily dev, physical device for periodic validation | Best of both worlds | More setup, context switching |

**Architect Recommendation:** Option C (Hybrid)
- Emulators for fast daily iteration (localhost just works)
- Physical device with dev build for touch/gesture/performance validation
- Expo Go only for onboarding new devs who don't have emulators set up yet

**Discussion:**
- WSL environment means no iOS Simulator available (Mac only)
- Android Emulator works on WSL
- Physical device testing important for real-world validation
- **CONSTRAINT (PoC/Phase 2):** Android-only testing for the foreseeable future — no iOS device available
- iOS support should still be documented in strategy for future use

**Decision:** `APPROVED: Option C (Hybrid)`
- Android Emulator for daily development (localhost works)
- Physical Android device for validation
- iOS documented but deferred until device/Mac available

---

### Decision 1.2: Backend Connectivity During Development

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Localhost (emulators only)** | Emulators connect to localhost:4000 | Simple, no external dependencies | Physical devices can't use this |
| **B. Tunnel backend** | Run ngrok/localtunnel for Express server | Physical devices can reach local backend | Extra process, latency, flaky connections |
| **C. Staging backend** | Physical devices always use deployed staging | Reliable, no tunneling | Can't test local backend changes on device, requires deploy |
| **D. Tiered approach** | Emulator→localhost, Physical device→staging | Each context uses optimal approach | Two different test environments |

**Architect Recommendation:** Option D (Tiered)
- Emulator development: `localhost:4000` (fast, simple)
- Physical device testing: Staging backend (reliable, realistic)
- Optional: Tunnel when you specifically need to test local backend on device

**Discussion:**
- Physical device + local backend scenario is rare — can't identify concrete use cases
- Emulator can test all backend changes (API logic, database schema)
- Physical device testing is for: touch, gestures, camera, GPS, performance — none of which depend on local backend
- Technical debt if we skip tunneling: **near zero** (purely configuration, ~30 min to add later)
- Complexity if we add tunneling now: more docs, flaky connections, CORS config
- **Decision:** Keep it simple, document tunneling as "Advanced" option for future if needed

**Decision:** `APPROVED: Option D (Tiered)`
- Android Emulator → `localhost:4000` (via `10.0.2.2` alias)
- Physical Android device → Staging backend (Railway)
- Tunneling intentionally not supported initially; documented as advanced option if need arises

---

### Decision 1.3: Nx Command Strategy

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Accept direct Expo commands** | Document that `cd apps/mobile && expo start` is the way | Works reliably, interactive | Breaks Nx consistency |
| **B. Create run-commands target** | Add `nx run mobile:dev` using `nx:run-commands` | Nx-consistent command surface | Still may have TTY issues |
| **C. Fix @nx/expo:start** | Investigate/fix the executor, contribute upstream | Proper solution | Time investment, may not be fixable |
| **D. Script wrapper** | Create `pnpm run mobile:dev` script that does the right thing | Simple, works | Another abstraction layer |

**Architect Recommendation:** Option B + A fallback
- Create `nx run mobile:dev` using `nx:run-commands` with proper command
- Document direct Expo command as fallback if TTY issues persist
- File issue upstream for visibility

**Discussion:**
- Key insight: **Development Builds don't need interactive mode**
- With dev builds, app is pre-installed — just needs Metro running, connects automatically
- QR code is only needed for Expo Go (scan to load)
- Keyboard shortcuts (s, a, i, r, m) are convenience, not essential
- Port 19000 vs 8081: Not problematic, both are just Metro bundler port
- Nx consistency important for full-stack startup (backend + web + mobile together)
- VS Code/Cursor Nx extension integration is a "should-have"
- Expo Go with interactive mode is edge case for quick smoke tests only

**Decision:** `APPROVED: Option A-revised`
- **Standard workflow (Dev Build):** `pnpm exec nx run mobile:start` — works fine, no interactivity needed
- **Expo Go edge case:** `cd apps/mobile && expo start --tunnel` — full interactivity when needed
- This gives Nx consistency for daily dev while preserving escape hatch for Expo Go

---

## Domain 2: Build & Distribution

### Decision 2.1: Where Builds Happen

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. EAS Build only** | All builds in Expo's cloud | No local native tooling needed, consistent | Dependency on Expo service, queue times |
| **B. Local builds only** | Use `expo run:ios` / `expo run:android` | No external dependency, faster for dev | Requires Xcode/Android Studio, Mac for iOS |
| **C. EAS for CI, Local for dev** | Local development builds, EAS for CI/production | Fast local iteration, consistent CI | Potential inconsistencies between local/CI |
| **D. EAS for everything, local as fallback** | Primary: EAS, Fallback: local when needed | Best of both, EAS handles complexity | Still need local setup as backup |

**Architect Recommendation:** Option D
- EAS Build as primary (consistent, no Mac requirement for iOS)
- Local builds documented as advanced option
- With paid EAS, queue times are minimal

**Discussion:**
- Clarification: EAS builds in cloud, but app runs locally on emulator/device
- Flow: EAS compiles → download .apk → install on emulator → Metro serves JS locally
- Native shell installed once; JS hot-reloads without rebuild
- Only rebuild when: native modules change, SDK update, app.json config changes
- WSL can't do local iOS builds anyway (requires Mac)
- Paid EAS subscription means minimal queue times

**Decision:** `APPROVED: Option D`
- EAS Build as primary for all builds
- Local builds documented as advanced fallback (Android only on WSL)
- Consistent builds across developers and CI

---

### Decision 2.2: Development Build Distribution

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. EAS internal distribution** | Install link via Expo dashboard | Easy sharing, no store accounts | Requires EAS account access |
| **B. TestFlight / Play Internal** | Use App Store Connect / Play Console | Familiar to testers, official flow | More setup, review delays |
| **C. Direct APK/IPA** | Build and manually share files | No dependencies | iOS requires signing, messy |

**Architect Recommendation:** Option A (EAS Internal)
- For development builds, EAS internal distribution is simplest
- TestFlight/Play Console for staging/production releases

**Discussion:**
- Clarified: Build TYPE (development/preview/production) is separate from DISTRIBUTION method
- Development build: has expo-dev-client, connects to Metro, hot reload works
- Preview/Production build: JS bundled inside, standalone, production-identical
- EAS Internal can distribute ANY build type — not just development builds
- Can test production-identical builds via EAS Internal without going through Play Store
- Workflow: preview build → EAS Internal testing → production build → Play Store

**Decision:** `APPROVED: Option A (EAS Internal)`
- Development builds → EAS Internal Distribution (simple, fast)
- Preview builds for QA → EAS Internal Distribution (production-identical testing)
- Staging/Production → TestFlight (iOS) / Play Internal Track (Android) for wider testing

---

## Domain 3: Backend Connectivity (Environments)

### Decision 3.1: API URL Configuration Strategy

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Build-time env vars** | `EXPO_PUBLIC_API_URL` baked in at build | Simple, clear | Rebuild needed to change URL |
| **B. EAS environment configs** | Different EAS profiles for dev/staging/prod | Clean separation, no code changes | More EAS config complexity |
| **C. Runtime config (app.json extra)** | URL in app.json, changeable via EAS Update | Can change without rebuild | More indirection |
| **D. Combined** | EAS profiles set env vars at build time | Best practices, clear environment separation | Need to understand EAS profiles |

**Architect Recommendation:** Option D (Combined)

Example `eas.json` profiles:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "http://10.0.2.2:4000/api" }
    },
    "preview": {
      "distribution": "internal",
      "env": { "EXPO_PUBLIC_API_URL": "https://nx-monoreposerver-staging.up.railway.app/api" }
    },
    "production": {
      "env": { "EXPO_PUBLIC_API_URL": "https://nx-monoreposerver-production.up.railway.app/api" }
    }
  }
}
```

**Discussion:**
- Aligns with Decision 1.2 (Tiered backend connectivity)
- Development profile uses emulator localhost alias (10.0.2.2)
- Preview profile uses staging backend for QA/physical device testing
- Production profile uses production backend
- Works with existing `getApiUrl()` code that reads `EXPO_PUBLIC_API_URL`

**Decision:** `APPROVED: Option D (Combined)`
- EAS profiles define environment-specific API URLs
- Build-time env vars baked into each build
- Clean separation, standard pattern

---

## Domain 4: CI/CD Integration

### Decision 4.1: When to Build

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Every PR** | Build dev build on every PR | Catch issues early, always testable | Cost (EAS builds), time |
| **B. Main branch only** | Build only on merge to main | Cheaper, faster PRs | Issues found later |
| **C. Manual trigger** | GitHub Actions workflow_dispatch | Full control | Easy to forget |
| **D. Smart trigger** | Build when mobile code changes (Nx affected) | Efficient, relevant | More complex CI config |

**Architect Recommendation:** Option D (Smart trigger)
- Use `nx affected` to detect mobile changes
- Only trigger EAS build when mobile code actually changed
- Always build on main branch merges

**Discussion:**
- EAS builds take time (5-30 min) and cost money
- No point building if only web/server code changed
- Nx `affected` detects mobile impact from dependency graph
- PR with mobile changes → build preview profile
- Merge to main → build production profile

**Decision:** `APPROVED: Option D (Smart trigger)`
- Use Nx affected to detect mobile changes
- PR with mobile changes → EAS preview build
- PR without mobile changes → skip mobile build
- Merge to main → always build production

---

### Decision 4.2: CI Workflow Structure

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Extend existing CI** | Add mobile steps to current ci.yml | Single workflow, Nx integration | Workflow gets complex |
| **B. Separate mobile CI** | New workflow for mobile builds | Clear separation, different triggers | Two workflows to maintain |
| **C. Nx-orchestrated** | Nx task triggers EAS build | Full Nx integration | Nx executor for EAS needed |

**Architect Recommendation:** Option B (Separate workflow)
- Mobile builds are fundamentally different (EAS cloud, not local)
- Separate workflow with clear triggers
- Can still use Nx affected for trigger logic

**Discussion:**
- Mobile builds take 5-30 min — shouldn't block web/server CI (3-5 min)
- Different triggers: only when mobile affected
- EAS builds happen in cloud, not on GitHub runners
- Mobile build failures shouldn't block unrelated PRs
- Cleaner separation of concerns

**Decision:** `APPROVED: Option B (Separate workflow)`
- New `.github/workflows/mobile-ci.yml` for mobile builds
- Existing `ci.yml` unchanged (web + server)
- Mobile CI: check affected → trigger EAS → report status
- Clear separation, independent timing

---

## Domain 5: App Store Deployment

### Decision 5.1: Release Strategy

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Full automation** | Merge to main → TestFlight/Play Console auto | Fast, consistent | Risky for mobile (App Store review) |
| **B. Semi-automated** | Auto build, manual submission trigger | Control over releases | Extra step |
| **C. Manual gates** | Human approval at each stage | Maximum control | Slower, bottleneck |

**Architect Recommendation:** Option B (Semi-automated)
- Auto build and upload to TestFlight/Play Console
- Manual trigger to submit for App Store review
- Production releases are intentional, not accidental

**Discussion:**
- App Store review is unpredictable (24 hrs to 1 week)
- Don't want accidental production releases
- But also don't want manual builds — too error-prone
- Build process should be automated (consistent artifacts)
- Submission/release should be intentional human action
- Workflow: main merge → auto build → auto upload to TestFlight/Play Console → manual trigger to submit for review

**Decision:** `APPROVED: Option B (Semi-automated)`
- Merge to main → automatic production build (EAS)
- Auto-upload to TestFlight (iOS) / Play Console Internal Track (Android)
- Manual workflow_dispatch to submit for App Store / Play Store review
- Intentional releases, automated builds

---

### Decision 5.2: OTA Updates

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Use EAS Update** | Push JS changes without App Store | Fast fixes, no review wait | Only for JS changes, not native |
| **B. No OTA** | All changes via App Store | Simpler mental model | Slower fixes |
| **C. OTA for staging only** | Test OTA capability but don't use in prod | Safe experimentation | Feature not fully utilized |

**Architect Recommendation:** Option A (EAS Update)
- It's a key benefit of Expo ecosystem
- JS-only bug fixes can ship instantly
- Native changes still require store release

**Discussion:**
- OTA is a key differentiator for Expo — one of the main reasons to use it
- JS-only changes (UI fixes, logic bugs, copy changes) can ship in minutes
- Native changes (SDK upgrade, native modules, app.json) still require App Store
- Instant rollback capability if an update causes issues
- Already included in paid EAS subscription
- Can target by channel (staging vs production)
- Integrates with semi-automated release strategy:
  - Native changes → EAS Build → App Store flow
  - JS-only changes → EAS Update → instant deployment

**Decision:** `APPROVED: Option A (EAS Update)`
- Enable EAS Update for production deployments
- JS-only bug fixes ship instantly without App Store review
- Native changes continue through App Store flow
- Rollback available via `eas update:rollback`

---

## Decision Summary

| ID | Domain | Decision | Status | Choice |
|----|--------|----------|--------|--------|
| 1.1 | Local Dev | Primary dev method | **APPROVED** | C (Hybrid) + Android-only constraint |
| 1.2 | Local Dev | Backend connectivity | **APPROVED** | D (Tiered) - emulator→localhost, device→staging |
| 1.3 | Local Dev | Nx command strategy | **APPROVED** | A-revised: Nx for dev builds, direct for Expo Go |
| 2.1 | Build | Build location | **APPROVED** | D - EAS primary, local as fallback |
| 2.2 | Build | Dev build distribution | **APPROVED** | A - EAS Internal for dev/preview builds |
| 3.1 | Connectivity | API URL config | **APPROVED** | D - EAS profiles with env vars |
| 4.1 | CI/CD | Build triggers | **APPROVED** | D - Smart trigger (Nx affected) |
| 4.2 | CI/CD | CI structure | **APPROVED** | B - Separate mobile-ci.yml workflow |
| 5.1 | App Store | Release strategy | **APPROVED** | B - Semi-automated (auto-build, manual submit) |
| 5.2 | App Store | OTA updates | **APPROVED** | A - EAS Update for JS-only changes |

---

## Additional Notes

### Phase 3: Strategy Document Created

Created `docs/mobile-environment-strategy.md` with comprehensive coverage of:
- Development workflow (Daily dev, Nx commands, backend connectivity)
- Build & distribution (EAS profiles, build types, installation flow)
- Environment configuration (eas.json patterns, API URL resolution)
- CI/CD integration (Smart triggers, separate mobile workflow)
- App Store deployment (Semi-automated releases, OTA updates)
- Quick reference (Common commands, troubleshooting, key files)

### Phase 4: Epic 6 Stories Updated

**Story 6.4 (Validate Cross-Platform Sync):**
- Added Android-only constraint notice
- Marked Task 5 (iOS testing) as SKIPPED
- Updated validation checklist with iOS = N/A
- Added reference to mobile-environment-strategy.md

**Story 6.5 (Document Mobile Development Setup):**
- Added scope reduction notice (most work done via strategy doc)
- Marked Tasks 1-8 as COMPLETE/COVERED
- Only remaining work: Tasks 9-11 (validation, cross-refs, status update)
- Added mobile-environment-strategy.md as primary reference

### Phase 5: Implementation Roadmap

**Immediate Next Steps:**
1. **Story 6.3 Task 6**: Manual testing on Android Emulator (user action required)
2. **Story 6.4**: Cross-platform sync validation (Android only)
3. **Story 6.5 Tasks 9-11**: Documentation validation and cross-references

**EAS Configuration Changes Needed:**
- Update `apps/mobile/eas.json` to match Decision 3.1 pattern (profiles with env vars)
- Consider creating first development build to validate the workflow

**CI/CD Implementation (Future):**
- Create `.github/workflows/mobile-ci.yml` per Decision 4.2
- Implement Nx affected check per Decision 4.1
- Configure EAS submit workflow per Decision 5.1

**OTA Setup (Future):**
- Configure EAS Update channels per Decision 5.2
- Document OTA workflow in strategy doc
