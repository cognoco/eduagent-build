# Maestro E2E Tests

Black-box UI tests for the EduAgent mobile app using [Maestro](https://maestro.mobile.dev/).

## Prerequisites

1. **Install Maestro CLI** (not an npm package):

   ```bash
   # macOS / Linux
   curl -fsSL "https://get.maestro.mobile.dev" | bash

   # Windows (via WSL2 or Git Bash)
   curl -fsSL "https://get.maestro.mobile.dev" | bash
   ```

   Verify: `maestro --version`

2. **Running emulator or device**:
   - Android: Start an emulator via Android Studio or `emulator -avd <name>`
   - iOS: Start a simulator via Xcode (macOS only)

3. **App running on the device/emulator**:
   - Start the Expo dev server: `pnpm exec nx start mobile`
   - Open the app on the emulator (press `a` for Android, `i` for iOS in Metro)

## Running Flows

```bash
# Run all flows
pnpm test:e2e

# Run only smoke-tagged flows
pnpm test:e2e:smoke

# Run a single flow
maestro test apps/mobile/e2e/flows/app-launch.yaml

# Record a flow interactively
pnpm test:e2e:record
```

## Directory Structure

```
e2e/
  config.yaml              # Maestro config (appId, timeouts)
  README.md                # This file
  flows/
    app-launch.yaml        # App boot + auth gate check
    onboarding/
      create-subject.yaml  # Create subject -> interview screen
      view-curriculum.yaml # Home navigation + curriculum review
    learning/
      start-session.yaml   # Start session + send a message
    _setup/                # (future) Seed/teardown helper flows
```

## Writing New Flows

1. Read the [Maestro YAML reference](https://maestro.mobile.dev/reference).
2. Use `testID` props from the React Native components as selectors:
   ```yaml
   - tapOn:
       id: "sign-in-button"
   ```
3. Use text selectors as a fallback:
   ```yaml
   - assertVisible: "Welcome back"
   ```
4. Tag flows for filtering:
   ```yaml
   tags:
     - smoke
     - onboarding
   ```
5. Keep `appId: com.zwizzly.eduagent` in each flow file, or rely on `config.yaml`.

## Notes

- Flows assume the app is already running on the target device/emulator.
- The `app-launch.yaml` flow uses `clearState: true` to test cold-start behavior.
- Authenticated flows require a signed-in user. In CI, use a test seeding endpoint
  or a setup flow in `_setup/` to handle authentication before running other flows.
- See `docs/e2e-testing-strategy.md` for the full testing strategy and CI plan.
