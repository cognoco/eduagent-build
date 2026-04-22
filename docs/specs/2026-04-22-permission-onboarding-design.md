# Permission Onboarding Gate — Design Spec

**Date:** 2026-04-22
**Status:** Draft
**Scope:** Mobile app (`apps/mobile`)

## Problem

Users must currently discover permission needs scattered across the app:
- **Microphone** — only requested when entering a session (ChatShell mount)
- **Notifications** — requested silently on app launch (no user education)
- **Camera** — requested when opening homework camera (has its own permission phase)
- **Photo library** — implicit via expo-image-picker

This creates two problems:
1. Users who deny permissions have no guided path to re-enable them — they must find system Settings on their own.
2. The camera permission screen gets stuck after returning from Settings because the `useCameraPermissions` hook doesn't auto-refresh on app resume (fix shipped separately, same session).

## Solution

A **one-time permission setup gate** in the `(app)/_layout.tsx` gate chain that asks for **microphone + notifications** before the user reaches the main app. Camera and photo library remain just-in-time (not every user needs homework camera).

## Design Decisions

### Which permissions to request upfront

| Permission | Upfront? | Rationale |
|---|---|---|
| Microphone | Yes | Every user needs voice input for sessions — core feature |
| Notifications | Yes | Study reminders and progress digests — high engagement value |
| Camera | No | Only needed for homework OCR — not all users use it |
| Photo library | No | Handled implicitly by expo-image-picker on use |

### Where in the gate chain

The gate slots into the existing sequential gate pattern in `AppLayout`:

```
isLoaded?           → spinner
isSignedIn?         → redirect to sign-in
pendingAuthRedirect → spinner
isProfileLoading?   → spinner
!activeProfile?     → CreateProfileGate
consentPending?     → ConsentPendingGate
consentWithdrawn?   → ConsentWithdrawnGate
showPostApproval?   → PostApprovalLanding
showPermSetup?      → PermissionSetupGate    ← NEW
(all clear)         → Tab navigator
```

### When to show / skip

The gate renders when ALL of these are true:
- `permissionSetupSeen_${profileId}` is NOT `'true'` in SecureStore
- At least one **renderable** permission row exists (see below)

A permission row is renderable when:
- **Mic row**: speech recognition module is available (`micAvailable`) AND mic is not yet granted
- **Notification row**: `Platform.OS !== 'web'` AND notifications are not yet granted

If zero rows are renderable, the gate auto-dismisses (writes the SecureStore flag and skips). This prevents showing an empty gate on web or when all supported permissions are already granted.

Auto-skip means:
- Users who granted permissions via the onboarding interview pre-warm never see it
- Users who upgrade from an older app version with permissions already granted skip it
- Second profile creations on the same device skip if permissions carry over
- Web users never see it (no native permission APIs)

### Android <33 behavior note

On Android API <33 (pre-Tiramisu), notification permission is granted by default — there is no runtime prompt. The notification row shows an immediate checkmark with no user action. On these devices, the gate is effectively a mic-only prompt (or auto-skips entirely if mic is also granted).

### SecureStore key

`permissionSetupSeen_${profileId}` — follows the exact pattern of `postApprovalSeen_${profileId}`. Per-profile so each child profile on a shared device gets the prompt once.

## Component: `PermissionSetupGate`

### Location

Defined inline in `apps/mobile/src/app/(app)/_layout.tsx`, following the same pattern as `PostApprovalLanding` and `CreateProfileGate`. The component is ~80 lines, pushing the file to ~1360 lines total. This is consistent with the existing pattern but approaching a threshold — future gates should consider extracting to a `_gates/` directory.

### Hook: `usePermissionSetup`

```ts
function usePermissionSetup(
  profileId: string | undefined
): [
  shouldShow: boolean,
  dismiss: () => void,
  permState: PermState,
  requestMic: () => Promise<void>,
  requestNotif: () => Promise<void>,
]
```

Follows the same shape as `usePostApprovalLanding`:
1. On mount, reads `permissionSetupSeen_${profileId}` from SecureStore
2. Checks current mic + notification permission status (read-only, no prompting)
3. If both already granted → writes the flag and returns `[false, noop]`
4. If flag is `'true'` → returns `[false, noop]`
5. Otherwise → returns `[true, dismiss]`

`dismiss()` writes the SecureStore flag and sets `shouldShow` to `false`.

### UI Layout

```
┌─────────────────────────────┐
│         (safe area)         │
│                             │
│     Let's get you set up    │  ← heading
│                             │
│  ┌───────────────────────┐  │
│  │ 🎤  Microphone        │  │  ← tappable row
│  │  Voice is how you'll  │  │
│  │  chat with your tutor │  │
│  │                   [✓] │  │  ← checkmark when granted
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ 🔔  Notifications     │  │  ← tappable row
│  │  Get reminders and    │  │
│  │  progress updates     │  │
│  │                   [✓] │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │      Continue          │  │  ← primary button
│  └───────────────────────┘  │
│                             │
│       Skip for now          │  ← secondary text link
│                             │
└─────────────────────────────┘
```

### Behavior

**Permission rows:**
- Each row is a `Pressable` that triggers the OS permission dialog for that permission
- After the OS dialog returns, the row updates to show a checkmark (granted) or stays unchanged (denied)
- If the OS won't show the dialog again (`canAskAgain === false`), tapping opens `Linking.openSettings()` with a brief toast/subtitle: "Tap to open Settings"
- Rows use Ionicons: `mic-outline` / `mic` for microphone, `notifications-outline` / `notifications` for notifications

**"Continue" button:**
- Always enabled — the user can continue even without granting any permissions
- On press: calls `dismiss()` (writes SecureStore flag, hides gate)
- If both permissions are granted, the button text stays "Continue" (no change needed)

**"Skip for now" link:**
- Calls `dismiss()` — identical behavior to Continue
- Exists as a secondary affordance for users who want to clearly signal "not now"
- Uses `text-text-secondary` styling, no background

**AppState refresh (same pattern as camera fix):**
- If a user taps a row, gets sent to `Linking.openSettings()`, and returns — the gate must re-check permission status
- Add an `AppState` listener inside the gate that re-reads both permission statuses on `'active'` transition
- This reuses the exact same pattern we just shipped for the camera screen

### Permission APIs

| Permission | Check | Request |
|---|---|---|
| Microphone | `ExpoSpeechRecognitionModule.getPermissionsAsync()` | `ExpoSpeechRecognitionModule.requestPermissionsAsync()` |
| Notifications | `Notifications.getPermissionsAsync()` | `Notifications.requestPermissionsAsync()` |

For microphone, use the same dynamic import pattern as `use-speech-recognition.ts` (the module is lazy-loaded). On web or devices without the native module, the mic row should be hidden (not shown with an error).

**Prerequisite — add `getPermissionsAsync` to the local type:** The native `expo-speech-recognition` module exports `getPermissionsAsync` (confirmed in `ExpoSpeechRecognitionModule.types.d.ts:565`), but our local `SpeechRecognitionModule` type at `hooks/use-speech-recognition.ts:33-45` only declares `requestPermissionsAsync`. The type must be extended:

```ts
type SpeechRecognitionModule = {
  getPermissionsAsync: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  // ... existing fields
};
```

Without this, the gate's passive permission check (`getPermissionsAsync`) will fail at the type level. This also unblocks the ChatShell AppState refresh described below.

### Interaction with existing permission code

- **`usePushTokenRegistration`**: Currently runs on `AppLayout` mount (line 1055) and immediately requests notification permission via the OS dialog — before the user has any context. After this change:
  1. Remove the `Notifications.requestPermissionsAsync()` call from the hook (keep only the token registration logic). The gate owns the permission prompt.
  2. Add a `notificationGranted` boolean parameter to the hook. This value comes from the gate's `permState.notif === 'granted'` and is included in the effect's dependency array.
  3. When the gate grants notification permission, `notificationGranted` flips from `false` to `true`, causing the effect to re-fire and register the push token in the same session.
  4. The `hasRegistered` ref guard prevents duplicate registrations on subsequent re-renders.

  **Why this is necessary:** The hook mounts and fires its effect *before* the gate renders. On first fire, `getPermissionsAsync()` returns `undetermined` → the hook exits. Without the reactive `notificationGranted` signal, the effect never re-fires because its only dependency (`registerPushToken`) is a stable mutation ref. The push token would not register until the next cold app launch.

  Call site in `AppLayout`:
  ```ts
  const [showPermSetup, dismissPermSetup, permState, requestMic, requestNotif] =
    usePermissionSetup(activeProfile?.id);
  usePushTokenRegistration(permState.notif === 'granted');
  ```
- **`ChatShell` mic — add AppState refresh**: Currently, if a user denies mic in the gate, enters a session, gets the permission error alert, taps "Open Settings", grants mic, and returns — ChatShell has **no AppState listener** to detect the change. The `useSpeechRecognition` hook is stateless with respect to permission: it only checks on `startListening()` or `requestMicrophonePermission()` calls, not reactively.

  Add an `AppState` listener inside `ChatShell` (same pattern as the camera fix and this gate) that calls `getPermissionsAsync()` on `'active'` transition. If mic becomes granted, update local state so the mic button reflects the new status without requiring the user to tap it again. This depends on the `getPermissionsAsync` type addition described in Permission APIs above.

  ```ts
  // ChatShell — re-check mic permission on return from Settings
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next === 'active') {
        const mod = await loadSpeechModule();
        if (!mod) return;
        const { granted } = await mod.getPermissionsAsync();
        // Update local mic-available state if newly granted
      }
    });
    return () => sub.remove();
  }, []);
  ```

- **`ChatShell` mic pre-warm**: No change needed. If mic was granted in the gate, the pre-warm is a no-op. If denied, the pre-warm still fires as before.

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Both permissions already granted | Returning user / second profile | Gate auto-skips, user goes straight to tabs | N/A |
| User denies mic via OS dialog | Taps "Don't Allow" | Row stays unchecked, subtitle changes to "Tap to open Settings" | Tap row → Linking.openSettings(), AppState refresh on return |
| User denies notifications via OS dialog | Taps "Don't Allow" | Row stays unchecked, subtitle changes to "Tap to open Settings" | Tap row → Linking.openSettings(), AppState refresh on return |
| User skips without granting anything | Taps "Skip for now" or "Continue" | Gate dismisses, flag written | Mic: prompted just-in-time on session mount (ChatShell pre-warm). Notifications: **no further prompt** — user must enable manually in Settings. The gate is one-shot and the hook no longer requests. |
| SecureStore read fails | Device storage issue | Gate shows (safe default — better to show than skip) | User taps Continue, write attempt is fire-and-forget |
| Speech recognition module unavailable | Web or device without native module | Mic row hidden, only notifications row shown | Continue button still works |
| Notification API unavailable (web) | `Platform.OS === 'web'` | Notification row hidden, only mic row shown (if available) | Continue button still works |
| Zero renderable rows | Web + no speech module, or all permissions already granted | Gate auto-skips entirely (zero renderable rows → auto-dismiss) | N/A |

## Testing

### Unit tests (co-located in `_layout.tsx` test file or extracted component test)

1. Gate renders when `permissionSetupSeen` is not set and permissions are not granted
2. Gate auto-skips when both permissions are already granted
3. Gate auto-skips when SecureStore flag is `'true'`
4. Tapping mic row calls `requestPermissionsAsync` on the speech module
5. Tapping notification row calls `Notifications.requestPermissionsAsync`
6. Row shows checkmark after permission is granted
7. "Continue" calls dismiss and hides the gate
8. "Skip for now" calls dismiss and hides the gate
9. AppState 'active' transition re-checks permission status (same pattern as camera fix)
10. Mic row hidden when speech module is unavailable

11. Gate auto-skips when zero rows are renderable (web + no speech module)
12. Notification row hidden on web (`Platform.OS === 'web'`)

### Integration coverage

- The `usePushTokenRegistration` hook registers the push token reactively when `notificationGranted` flips to `true` after the gate grants permission (same session — no cold restart needed)
- ChatShell AppState listener re-checks mic permission on `'active'` transition and updates mic-available state when newly granted
- Existing permission flows (camera, ChatShell mic pre-warm) work unchanged
- Shake detector logs `__DEV__` warning when accelerometer module is missing or unavailable

## Related fix: Shake detector silent failure

The shake-to-feedback feature (`hooks/use-shake-detector.ts`) uses `expo-sensors` Accelerometer. It has the same silent-failure pattern this spec addresses for permissions: if the native module is missing or the sensor is unavailable, the hook exits silently with no log, no error, no user feedback. This means shake-to-feedback silently doesn't work on emulators and on any device without the dev-client native module.

While not part of the permission gate itself, this should be fixed alongside:

1. Add `__DEV__` console warnings when `Accelerometer` is `null` (module not available) or `isAvailableAsync()` returns `false`
2. Consider exposing a `shakeAvailable` boolean from the hook so `FeedbackProvider` can offer a fallback (e.g., a manual "Give Feedback" button in the More tab)

## Out of Scope

- Requesting camera/photo permissions upfront (kept just-in-time)
- Permission management UI in the More/Settings screen (separate feature)
- Re-prompting users who previously dismissed the gate (one-shot by design)
- Animated transitions or illustrations on the gate screen (keep it simple)
