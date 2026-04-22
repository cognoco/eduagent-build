# Permission Onboarding Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time permission setup gate that asks for microphone + notifications before the user reaches the main tab navigator.

**Architecture:** A `usePermissionSetup` hook + `PermissionSetupGate` component in `(app)/_layout.tsx`, following the exact pattern of `usePostApprovalLanding` + `PostApprovalLanding`. The gate slots between the post-approval landing and the tab navigator. A `permissionSetupSeen_${profileId}` SecureStore key ensures one-shot behavior. The `usePushTokenRegistration` hook is modified to stop requesting permission itself (the gate now owns that).

**Tech Stack:** React Native, Expo (expo-notifications, expo-speech-recognition), SecureStore, AppState

**Spec:** `docs/specs/2026-04-22-permission-onboarding-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/src/app/(app)/_layout.tsx` | Modify | Add `usePermissionSetup` hook, `PermissionSetupGate` component, wire into gate chain |
| `apps/mobile/src/app/(app)/_layout.test.tsx` | Modify | Add tests for the permission gate |
| `apps/mobile/src/hooks/use-push-token-registration.ts` | Modify | Remove `requestPermissionsAsync` call, only register token when already granted |
| `apps/mobile/src/hooks/use-push-token-registration.test.ts` | Modify | Update tests for the new check-only behavior |

---

### Task 1: Modify `usePushTokenRegistration` to stop requesting permission

The gate now owns permission prompting. The hook should only check + register.

**Files:**
- Modify: `apps/mobile/src/hooks/use-push-token-registration.ts`
- Test: `apps/mobile/src/hooks/use-push-token-registration.test.ts`

- [ ] **Step 1: Update the test for "already granted" path**

In `apps/mobile/src/hooks/use-push-token-registration.test.ts`, the first test (`'requests permissions and registers push token'`) relies on the default mock which returns `{ status: 'granted' }` from `getPermissionsAsync`. This test should still pass unchanged — the hook should still register the token when already granted.

Verify the test still describes correct behavior — no change needed to this test.

- [ ] **Step 2: Update the test for "not granted" path**

The test `'requests permission when not already granted'` currently expects `requestPermissionsAsync` to be called. Change it to expect the hook does NOT call `requestPermissionsAsync` and does NOT register the token:

```ts
it('does not request permission or register when not already granted', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    status: 'undetermined',
  });

  renderHook(() => usePushTokenRegistration(false));

  // Give time for the async effect to complete
  await new Promise((r) => setTimeout(r, 50));

  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Update the "denied" test**

The test `'does not register when permission is denied'` currently calls `requestPermissionsAsync` then checks it returns denied. Simplify — the hook should bail out after `getPermissionsAsync` returns non-granted without ever calling `requestPermissionsAsync`:

```ts
it('does not register when permission is denied', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    status: 'denied',
  });

  renderHook(() => usePushTokenRegistration(false));

  await new Promise((r) => setTimeout(r, 50));

  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-push-token-registration.ts --no-coverage`

Expected: 2 tests fail (the "not granted" and "denied" tests expect `requestPermissionsAsync` not to be called, but the old hook still calls it).

- [ ] **Step 5: Update the hook implementation**

In `apps/mobile/src/hooks/use-push-token-registration.ts`, remove the `requestPermissionsAsync` call, add `notificationGranted` parameter, and include it in the dependency array:

```ts
/**
 * Registers the Expo push token with the API when notification permission
 * is already granted. Does NOT prompt for permission — the permission
 * onboarding gate owns that dialog.
 *
 * @param notificationGranted - reactive signal from the permission gate.
 *   When this flips from false→true (gate granted permission), the effect
 *   re-fires and registers the token in the same session.
 */
export function usePushTokenRegistration(
  notificationGranted = false
): void {
  const hasRegistered = useRef(false);
  const registerPushToken = useRegisterPushToken();

  useEffect(() => {
    if (hasRegistered.current) return;

    async function register() {
      try {
        // Only check current status — the permission gate handles prompting
        const { status } = await Notifications.getPermissionsAsync();

        if (status !== 'granted') return;

        // Android requires a notification channel
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        // Get the Expo push token
        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          Constants.easConfig?.projectId;

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId,
        });

        // Register with our API
        await registerPushToken.mutateAsync(tokenData.data);
        hasRegistered.current = true;
      } catch (err) {
        // Push registration is non-critical, but log for prod observability [SC-3]
        console.error('[Push Token] Registration failed:', err);
      }
    }

    void register();
  }, [registerPushToken, notificationGranted]);
}
```

- [ ] **Step 6: Add test for reactive re-fire when notificationGranted flips**

```ts
it('registers token when notificationGranted flips from false to true (gate grants permission)', async () => {
  // First render: not granted
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'undetermined',
  });

  const { rerender } = renderHook(
    ({ granted }: { granted: boolean }) => usePushTokenRegistration(granted),
    { initialProps: { granted: false } }
  );

  await new Promise((r) => setTimeout(r, 50));
  expect(mockMutateAsync).not.toHaveBeenCalled();

  // Gate grants notification → notificationGranted flips to true
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });

  rerender({ granted: true });

  await waitFor(() => {
    expect(mockMutateAsync).toHaveBeenCalledWith(
      'ExponentPushToken[mock-token]'
    );
  });
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests src/hooks/use-push-token-registration.ts --no-coverage`

Expected: All 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/hooks/use-push-token-registration.ts apps/mobile/src/hooks/use-push-token-registration.test.ts
git commit -m "refactor(mobile): usePushTokenRegistration no longer prompts for permission

The permission onboarding gate now owns the notification permission dialog.
The hook only checks current status and registers the token if already granted."
```

---

### Task 2: Add `usePermissionSetup` hook to `_layout.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` (add hook near line 135, after `usePostApprovalLanding`)

- [ ] **Step 1: Write the failing test**

In `apps/mobile/src/app/(app)/_layout.test.tsx`, add a mock for `expo-notifications` (needed for permission checking) and `expo-speech-recognition` at the top of the file alongside other mocks:

```ts
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
}));

const mockSpeechRequestPermissions = jest.fn().mockResolvedValue({ granted: true });
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: mockSpeechRequestPermissions,
  },
}));
```

Then add the test at the end of the `describe('AppLayout', ...)` block, before the closing `});`:

```ts
it('shows permission setup gate when permissions are not granted and flag is not set', async () => {
  // Notifications not granted
  const ExpoNotifications = require('expo-notifications');
  (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'undetermined',
  });
  // Speech recognition not granted
  mockSpeechRequestPermissions.mockResolvedValue({ granted: false });

  // SecureStore: no permissionSetupSeen flag
  const SecureStoreMock = require('expo-secure-store');
  (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

  render(<AppLayout />);

  await waitFor(() => {
    expect(screen.getByTestId('permission-setup-gate')).toBeTruthy();
  });
  expect(screen.queryByTestId('tabs')).toBeNull();
});
```

Also add `waitFor` to the import from `@testing-library/react-native` (line 1 — it's already imported as `{ act, render, screen }`, add `waitFor`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage`

Expected: FAIL — `permission-setup-gate` testID not found (component doesn't exist yet).

- [ ] **Step 3: Write the `usePermissionSetup` hook**

In `apps/mobile/src/app/(app)/_layout.tsx`, add `AppState` and `Linking` to the react-native import block (line 3):

```ts
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  AppState,
  Linking,
} from 'react-native';
```

Add the `expo-notifications` import after the existing imports (around line 37):

```ts
import * as Notifications from 'expo-notifications';
```

Then add the hook right after the `usePostApprovalLanding` function (after line 174):

```ts
/**
 * One-time permission setup gate. Prompts for mic + notifications before
 * the user reaches the tab navigator. Auto-skips if both are already granted.
 * Returns [shouldShow, dismiss, permState, requestMic, requestNotif].
 */
type PermState = {
  mic: 'unknown' | 'granted' | 'denied';
  notif: 'unknown' | 'granted' | 'denied';
  micCanAskAgain: boolean;
  notifCanAskAgain: boolean;
  micAvailable: boolean;
  checked: boolean;
};

function usePermissionSetup(
  profileId: string | undefined
): [
  shouldShow: boolean,
  dismiss: () => void,
  permState: PermState,
  requestMic: () => Promise<void>,
  requestNotif: () => Promise<void>,
] {
  const [shouldShow, setShouldShow] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [permState, setPermState] = React.useState<PermState>({
    mic: 'unknown',
    notif: 'unknown',
    micCanAskAgain: true,
    notifCanAskAgain: true,
    micAvailable: true,
    checked: false,
  });

  const checkPermissions = React.useCallback(async () => {
    // Check notification status
    let notifStatus: 'granted' | 'denied' = 'denied';
    let notifCanAskAgain = true;
    try {
      const result = await Notifications.getPermissionsAsync();
      notifStatus = result.status === 'granted' ? 'granted' : 'denied';
      notifCanAskAgain = result.canAskAgain ?? true;
    } catch {
      /* non-fatal */
    }

    // Check microphone status via expo-speech-recognition
    let micStatus: 'granted' | 'denied' = 'denied';
    let micCanAskAgain = true;
    let micAvailable = true;
    try {
      const mod = await import('expo-speech-recognition');
      const speechModule = mod.ExpoSpeechRecognitionModule;
      if (speechModule) {
        const { granted } = await speechModule.requestPermissionsAsync();
        micStatus = granted ? 'granted' : 'denied';
        // expo-speech-recognition requestPermissionsAsync doesn't return
        // canAskAgain — if not granted after calling request, treat as
        // permanently denied (the OS won't re-prompt)
        if (!granted) micCanAskAgain = false;
      } else {
        micAvailable = false;
      }
    } catch {
      micAvailable = false;
    }

    setPermState({
      mic: micStatus,
      notif: notifStatus,
      micCanAskAgain,
      notifCanAskAgain,
      micAvailable,
      checked: true,
    });

    return { micStatus, notifStatus, micAvailable };
  }, []);

  // Initial check: read SecureStore flag + current permission state
  React.useEffect(() => {
    if (!profileId) {
      setChecked(true);
      return;
    }

    const key = `permissionSetupSeen_${profileId}`;
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(key);
        if (value === 'true') {
          setChecked(true);
          return;
        }
      } catch {
        /* SecureStore failure — show gate (safe default) */
      }

      const { micStatus, notifStatus, micAvailable } =
        await checkPermissions();

      // Count renderable rows — a row is renderable when the permission
      // is not yet granted AND the platform supports prompting for it.
      const hasMicRow = micAvailable && micStatus !== 'granted';
      const hasNotifRow =
        Platform.OS !== 'web' && notifStatus !== 'granted';

      // Auto-skip if zero renderable rows (all granted, or unsupported)
      if (!hasMicRow && !hasNotifRow) {
        // Write flag so we never check again
        void SecureStore.setItemAsync(
          `permissionSetupSeen_${profileId}`,
          'true'
        ).catch(() => {});
        setChecked(true);
        return;
      }

      setShouldShow(true);
      setChecked(true);
    })();
  }, [profileId, checkPermissions]);

  // Re-check permissions when returning from system Settings
  React.useEffect(() => {
    if (!shouldShow) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void checkPermissions();
      }
    });
    return () => sub.remove();
  }, [shouldShow, checkPermissions]);

  const dismiss = React.useCallback(() => {
    if (!profileId) return;
    setShouldShow(false);
    const key = `permissionSetupSeen_${profileId}`;
    void SecureStore.setItemAsync(key, 'true').catch(() => {
      /* non-fatal */
    });
  }, [profileId]);

  const requestMic = React.useCallback(async () => {
    try {
      const mod = await import('expo-speech-recognition');
      const speechModule = mod.ExpoSpeechRecognitionModule;
      if (!speechModule) return;
      const { granted } = await speechModule.requestPermissionsAsync();
      setPermState((prev) => ({
        ...prev,
        mic: granted ? 'granted' : 'denied',
      }));
    } catch {
      /* non-fatal */
    }
  }, []);

  const requestNotif = React.useCallback(async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      setPermState((prev) => ({
        ...prev,
        notif: status === 'granted' ? 'granted' : 'denied',
      }));
    } catch {
      /* non-fatal */
    }
  }, []);

  return [checked && shouldShow, dismiss, permState, requestMic, requestNotif];
}
```

- [ ] **Step 4: Run test to verify it still fails**

The hook exists now but the gate component doesn't render yet. The test should still fail because `permission-setup-gate` testID isn't rendered.

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage`

Expected: FAIL — testID `permission-setup-gate` not found.

- [ ] **Step 5: Commit the hook (red phase)**

```bash
git add apps/mobile/src/app/(app)/_layout.tsx apps/mobile/src/app/(app)/_layout.test.tsx
git commit -m "feat(mobile): add usePermissionSetup hook (red — gate UI pending)"
```

---

### Task 3: Add `PermissionSetupGate` component and wire into the gate chain

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.tsx` (add component + wire at line ~1191)

- [ ] **Step 1: Add the `PermissionSetupGate` component**

Add it in `_layout.tsx` right after the `usePermissionSetup` function:

```tsx
function PermissionSetupGate({
  permState,
  onRequestMic,
  onRequestNotif,
  onContinue,
}: {
  permState: PermState;
  onRequestMic: () => Promise<void>;
  onRequestNotif: () => Promise<void>;
  onContinue: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const handleMicPress = React.useCallback(async () => {
    if (permState.mic === 'granted') return;
    if (!permState.micCanAskAgain) {
      void Linking.openSettings();
      return;
    }
    await onRequestMic();
  }, [permState.mic, permState.micCanAskAgain, onRequestMic]);

  const handleNotifPress = React.useCallback(async () => {
    if (permState.notif === 'granted') return;
    if (!permState.notifCanAskAgain) {
      void Linking.openSettings();
      return;
    }
    await onRequestNotif();
  }, [permState.notif, permState.notifCanAskAgain, onRequestNotif]);

  return (
    <View
      className="flex-1 bg-background px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="permission-setup-gate"
    >
      <View className="flex-1 justify-center">
        <Text
          className="text-h1 font-bold text-text-primary mb-2 text-center"
          accessibilityRole="header"
        >
          Let's get you set up
        </Text>
        <Text className="text-body text-text-secondary mb-8 text-center">
          These help your tutor work best.
        </Text>

        {permState.micAvailable && (
          <Pressable
            testID="permission-row-mic"
            onPress={handleMicPress}
            className="flex-row items-center bg-surface rounded-xl px-4 py-4 mb-3"
            accessibilityRole="button"
            accessibilityLabel={
              permState.mic === 'granted'
                ? 'Microphone enabled'
                : 'Enable microphone'
            }
          >
            <Ionicons
              name={permState.mic === 'granted' ? 'mic' : 'mic-outline'}
              size={24}
              color={
                permState.mic === 'granted' ? colors.accent : colors.textPrimary
              }
            />
            <View className="flex-1 ml-3">
              <Text className="text-body font-semibold text-text-primary">
                Microphone
              </Text>
              <Text className="text-caption text-text-secondary">
                {permState.mic !== 'granted' && !permState.micCanAskAgain
                  ? 'Tap to open Settings'
                  : 'Voice is how you\'ll chat with your tutor'}
              </Text>
            </View>
            {permState.mic === 'granted' && (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.accent}
                testID="mic-granted-check"
              />
            )}
          </Pressable>
        )}

        <Pressable
          testID="permission-row-notif"
          onPress={handleNotifPress}
          className="flex-row items-center bg-surface rounded-xl px-4 py-4 mb-8"
          accessibilityRole="button"
          accessibilityLabel={
            permState.notif === 'granted'
              ? 'Notifications enabled'
              : 'Enable notifications'
          }
        >
          <Ionicons
            name={
              permState.notif === 'granted'
                ? 'notifications'
                : 'notifications-outline'
            }
            size={24}
            color={
              permState.notif === 'granted' ? colors.accent : colors.textPrimary
            }
          />
          <View className="flex-1 ml-3">
            <Text className="text-body font-semibold text-text-primary">
              Notifications
            </Text>
            <Text className="text-caption text-text-secondary">
              {permState.notif !== 'granted' && !permState.notifCanAskAgain
                ? 'Tap to open Settings'
                : 'Get reminders and progress updates'}
            </Text>
          </View>
          {permState.notif === 'granted' && (
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={colors.accent}
              testID="notif-granted-check"
            />
          )}
        </Pressable>
      </View>

      <View style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <Pressable
          testID="permission-continue"
          onPress={onContinue}
          className="bg-primary rounded-button py-3.5 items-center w-full mb-3"
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text className="text-body font-semibold text-text-inverse">
            Continue
          </Text>
        </Pressable>

        <Pressable
          testID="permission-skip"
          onPress={onContinue}
          className="py-3 items-center w-full"
          accessibilityRole="button"
          accessibilityLabel="Skip for now"
        >
          <Text className="text-body text-text-secondary">Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Wire the hook and gate into `AppLayout`**

In the `AppLayout` function, add the hook call after the `usePostApprovalLanding` call (after line ~1119):

```ts
const [showPermSetup, dismissPermSetup, permState, requestMic, requestNotif] =
  usePermissionSetup(activeProfile?.id);

// Pass reactive notificationGranted signal so the hook re-fires after
// the gate grants notification permission (Issue 1 fix — see spec).
usePushTokenRegistration(permState.notif === 'granted');
```

**Important:** Remove the existing `usePushTokenRegistration()` call at line ~1055 — the new call above replaces it with the reactive `notificationGranted` parameter.

Then add the gate render between the post-approval landing check and the tab navigator return (after line ~1191, before the `return <FeedbackProvider>` block):

```tsx
// One-time permission setup: prompt for mic + notifications
if (showPermSetup) {
  return (
    <PermissionSetupGate
      permState={permState}
      onRequestMic={requestMic}
      onRequestNotif={requestNotif}
      onContinue={dismissPermSetup}
    />
  );
}
```

- [ ] **Step 3: Run tests to verify the new test passes**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage`

Expected: All tests pass including the new `'shows permission setup gate'` test.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/(app)/_layout.tsx
git commit -m "feat(mobile): add PermissionSetupGate component and wire into gate chain

One-time gate between post-approval landing and tabs. Requests mic +
notifications upfront. Auto-skips if already granted."
```

---

### Task 4: Add remaining tests for the permission gate

**Files:**
- Modify: `apps/mobile/src/app/(app)/_layout.test.tsx`

- [ ] **Step 1: Add test — gate auto-skips when both permissions granted**

```ts
it('skips permission gate when both permissions are already granted', async () => {
  const ExpoNotifications = require('expo-notifications');
  (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
  });
  mockSpeechRequestPermissions.mockResolvedValue({ granted: true });

  const SecureStoreMock = require('expo-secure-store');
  (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);

  render(<AppLayout />);

  await waitFor(() => {
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });
  expect(screen.queryByTestId('permission-setup-gate')).toBeNull();
});
```

- [ ] **Step 2: Add test — gate auto-skips when SecureStore flag is set**

```ts
it('skips permission gate when SecureStore flag is already set', async () => {
  const ExpoNotifications = require('expo-notifications');
  (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'undetermined',
  });
  mockSpeechRequestPermissions.mockResolvedValue({ granted: false });

  const SecureStoreMock = require('expo-secure-store');
  (SecureStoreMock.getItemAsync as jest.Mock).mockImplementation(
    (key: string) => {
      if (key.startsWith('permissionSetupSeen_')) return Promise.resolve('true');
      return Promise.resolve(null);
    }
  );

  render(<AppLayout />);

  await waitFor(() => {
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });
  expect(screen.queryByTestId('permission-setup-gate')).toBeNull();
});
```

- [ ] **Step 3: Add test — Continue button dismisses the gate**

```ts
it('dismisses permission gate when Continue is tapped', async () => {
  const ExpoNotifications = require('expo-notifications');
  (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'undetermined',
  });
  mockSpeechRequestPermissions.mockResolvedValue({ granted: false });

  const SecureStoreMock = require('expo-secure-store');
  (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);

  render(<AppLayout />);

  await waitFor(() => {
    expect(screen.getByTestId('permission-setup-gate')).toBeTruthy();
  });

  await act(async () => {
    screen.getByTestId('permission-continue').props.onPress();
  });

  await waitFor(() => {
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });
  expect(SecureStoreMock.setItemAsync).toHaveBeenCalledWith(
    'permissionSetupSeen_p1',
    'true'
  );
});
```

- [ ] **Step 4: Add test — Skip button dismisses the gate**

```ts
it('dismisses permission gate when Skip is tapped', async () => {
  const ExpoNotifications = require('expo-notifications');
  (ExpoNotifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'undetermined',
  });
  mockSpeechRequestPermissions.mockResolvedValue({ granted: false });

  const SecureStoreMock = require('expo-secure-store');
  (SecureStoreMock.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStoreMock.setItemAsync as jest.Mock).mockResolvedValue(undefined);

  render(<AppLayout />);

  await waitFor(() => {
    expect(screen.getByTestId('permission-setup-gate')).toBeTruthy();
  });

  await act(async () => {
    screen.getByTestId('permission-skip').props.onPress();
  });

  await waitFor(() => {
    expect(screen.getByTestId('tabs')).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run all layout tests**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" --no-coverage`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/(app)/_layout.test.tsx
git commit -m "test(mobile): add permission setup gate tests — auto-skip, continue, skip"
```

---

### Task 5: Run full verification

**Files:** None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec tsc --noEmit`

Expected: No errors.

- [ ] **Step 2: Run related tests for all changed files**

Run: `cd C:/Dev/Projects/Products/Apps/eduagent-build/apps/mobile && pnpm exec jest --findRelatedTests "src/app/(app)/_layout.tsx" "src/hooks/use-push-token-registration.ts" --no-coverage`

Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run: `pnpm exec nx lint mobile`

Expected: No errors.

- [ ] **Step 4: Commit any lint/type fixes if needed**

If any issues are found, fix them and commit:

```bash
git commit -m "fix(mobile): address lint/type issues from permission gate"
```
