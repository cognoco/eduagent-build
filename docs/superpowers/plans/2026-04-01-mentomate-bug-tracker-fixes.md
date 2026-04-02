# MentoMate Bug Tracker — Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 13 bugs from the MentoMate Bug Tracker in Notion (L-Space > ZAF > MentoMate Bug Tracker, DB `b8ce802f`).

**Architecture:** Bugs cluster into three root causes: (A) NativeWind CSS variable cascade may not propagate through Expo Router Stack boundaries on Android — causing gray backgrounds, low contrast, invisible cards; (B) Home screen UX mismatch — chat input present when design calls for card-only hub; (C) Minor cleanup — accent picker removal, non-bug closures. Theme cascade (A) is the likely blocker for visual bugs, so it must be verified and fixed first.

**Tech Stack:** Expo SDK 54, NativeWind 4.2.1, Expo Router, React Native, Tailwind CSS 3.4.19

**Source of truth:** Notion MentoMate Bug Tracker — `collection://1fe3c648-b909-4692-8dba-e14b153831da`

---

## Root Cause Analysis Summary

### Cluster A: Theme Cascade (BUG-1, BUG-2, BUG-3, BUG-12)

**Code state:** Both root layout (`_layout.tsx:250`) and learner layout (`(learner)/_layout.tsx:674`) inject `tokenVars` via `useTokenVars()`. The `(auth)/_layout.tsx` does NOT inject tokenVars but auth screens reportedly look correct, so it's not the auth layout that's broken.

**Reported symptom:** "Gray background instead of dark navy" on all post-auth (learner) screens.

**Possible root causes (ranked):**
1. **NativeWind `vars()` not propagating through Expo Router `Stack` on Android** — the root layout applies tokenVars to a View, then `<Stack>` creates native navigation containers that may break CSS variable inheritance. The learner layout re-injects, but if the intermediate Stack discards the inheritance chain, `var(--color-background)` resolves to transparent (appears gray on Android's default light surface).
2. **`:root` CSS fallbacks don't apply on React Native** — `global.css` has `:root { --color-background: #1a1a3e }` but React Native has no DOM `:root`. These fallbacks only work during Tailwind compilation, not runtime. If `vars()` fails, there's no runtime fallback.
3. **Race condition** — ThemeContext not ready when learner layout mounts, so `useTokenVars()` returns empty/default values.
4. **Build-specific issue** — bugs reported from a stale build before Epic 11.1 merge.

**Key insight:** BUG-2 (low contrast), BUG-3 (invisible inputs), and BUG-12 (tab bar layering) are ALL cascading symptoms of BUG-1. If `var(--color-background)` doesn't resolve, ALL color tokens fail simultaneously.

### Cluster B: Home Screen UX (BUG-7, BUG-13, BUG-8, BUG-10)

**Code state:** Coaching cards ARE implemented and rendered (`home.tsx:376-425`). `AdaptiveEntryCard` for teen persona, `CoachingCard` for others. Chat input at bottom (`home.tsx:596-632`) is intentional — comment says "Bug #10" (internal tracking).

**Reported symptom:** "Home screen empty — no coaching cards." But cards ARE in the code.

**Root cause hypothesis:** If Cluster A (theme cascade) is broken, `bg-coaching-card` resolves to `var(--color-coaching-card)` which would be transparent. The cards render but are INVISIBLE — same color as the broken gray background. Fixing Cluster A likely makes cards visible.

**Genuine UX issues (regardless of theme):**
- BUG-13: Chat input on home screen contradicts card-based hub design
- BUG-8: Static greeting text, not personalized
- BUG-10: Persona profiles buried in More screen

### Cluster C: Session & Cleanup (BUG-5, BUG-9, BUG-4, BUG-6, BUG-11)

- **BUG-5:** Session screen DOES have opening message (`session/index.tsx:134-136`). If empty, it's a data flow issue or theme visibility issue.
- **BUG-9:** AccentPicker IS rendered in More screen (`more.tsx:257`). Per brand decision (`project_brand_dark_first.md`), it should be removed.
- **BUG-4:** Message input bar size — likely theme-related (invisible borders).
- **BUG-6 & BUG-11:** Confirmed non-bugs — Android screenshot UI artifacts.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/mobile/src/app/_layout.tsx` | Investigate | Root tokenVars injection (line 250) |
| `apps/mobile/src/app/(auth)/_layout.tsx` | Modify | Add tokenVars injection (currently bare Stack) |
| `apps/mobile/src/app/(learner)/_layout.tsx` | Investigate/Modify | Verify tokenVars working (line 674), debug tab bar |
| `apps/mobile/src/app/(learner)/home.tsx` | Modify | Chat input removal, greeting enhancement |
| `apps/mobile/src/app/(learner)/more.tsx` | Modify | Remove AccentPicker |
| `apps/mobile/src/app/(learner)/session/index.tsx` | Investigate | Verify opening message rendering |
| `apps/mobile/src/lib/theme.ts` | Investigate | `useTokenVars()` return value |
| `apps/mobile/src/lib/design-tokens.ts` | Read-only | Token definitions |
| `apps/mobile/global.css` | Read-only | CSS fallbacks |
| `apps/mobile/tailwind.config.js` | Read-only | Color → CSS variable mapping |
| `apps/mobile/src/components/coaching/CoachingCard.tsx` | Investigate | Verify rendering / visibility |
| `apps/mobile/src/components/coaching/AdaptiveEntryCard.tsx` | Investigate | Verify rendering / visibility |

---

## Task 0: Verify — Reproduce on Current Build

**Goal:** Determine which bugs are real in current `main` vs. stale-build artifacts. This gates the entire plan — if theme cascade works, Cluster A bugs may already be fixed.

**Files:**
- Read: `apps/mobile/src/app/_layout.tsx`
- Read: `apps/mobile/src/app/(learner)/_layout.tsx`
- Read: `apps/mobile/src/lib/theme.ts`

- [ ] **Step 1: Add diagnostic logging to `useTokenVars()`**

Add temporary console.log to verify tokenVars returns valid values at runtime:

```typescript
// In apps/mobile/src/lib/theme.ts, inside useTokenVars():
export function useTokenVars(): ReturnType<typeof vars> {
  const { persona, colorScheme, accentPresetId } = useTheme();
  return useMemo(() => {
    const base = tokens[persona][colorScheme];
    if (!accentPresetId) {
      const result = vars(tokensToCssVars(base));
      console.log('[THEME DEBUG] tokenVars keys:', Object.keys(result));
      console.log('[THEME DEBUG] persona:', persona, 'scheme:', colorScheme);
      return result;
    }
    // ... rest unchanged
```

- [ ] **Step 2: Add diagnostic to learner layout**

```typescript
// In apps/mobile/src/app/(learner)/_layout.tsx, before the return:
console.log('[THEME DEBUG] learner layout tokenVars type:', typeof tokenVars, 'keys:', Object.keys(tokenVars).length);
```

- [ ] **Step 3: Start Metro + run on Android emulator**

```bash
cd apps/mobile
pnpm exec expo start --dev-client
```

Open the app on Android emulator. Navigate past auth to home screen.

- [ ] **Step 4: Check Metro logs for diagnostic output**

Expected output if theme is working:
```
[THEME DEBUG] tokenVars keys: ['--color-background', '--color-surface', ...]
[THEME DEBUG] persona: teen scheme: dark
[THEME DEBUG] learner layout tokenVars type: object keys: 20+
```

If tokenVars has 0 keys or is undefined → **Cluster A is confirmed, proceed to Task 1.**
If tokenVars has correct keys but screens are still gray → **NativeWind vars() propagation issue, proceed to Task 1 with focus on View wrapping.**
If screens look correct → **Bugs were stale-build artifacts. Skip to Task 3 for UX fixes.**

- [ ] **Step 5: Screenshot each screen for Notion evidence**

Take screenshots of: home screen, session screen, More screen, create-subject screen. Compare against bug report descriptions. Save to `docs/E2Edocs/` for reference.

- [ ] **Step 6: Remove diagnostic logging**

Remove all `console.log('[THEME DEBUG]` lines added in Steps 1-2.

- [ ] **Step 7: Commit**

```bash
# Only if diagnostics revealed changes were needed
git add apps/mobile/src/lib/theme.ts apps/mobile/src/app/(learner)/_layout.tsx
git commit -m "chore: remove theme diagnostic logging"
```

---

## Task 1: Fix Theme Cascade (BUG-1, BUG-2, BUG-3, BUG-12)

**Skip this task if Task 0 confirms theme is working correctly.**

**Goal:** Ensure NativeWind CSS variables propagate correctly to all post-auth screens on Android.

**Files:**
- Modify: `apps/mobile/src/app/(auth)/_layout.tsx`
- Investigate: `apps/mobile/src/app/(learner)/_layout.tsx:674`
- Test: `apps/mobile/src/app/(auth)/_layout.test.tsx` (if exists, else verify manually)

- [ ] **Step 1: Add tokenVars injection to auth layout**

The `(auth)/_layout.tsx` is a bare Stack with no tokenVars. While auth screens reportedly look correct (they may use fallback CSS values from compilation), adding tokenVars here ensures consistency and matches the pattern used by `(learner)` and `(parent)` layouts:

```typescript
import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTokenVars } from '../../lib/theme';

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();
  const tokenVars = useTokenVars();

  if (isSignedIn) {
    return <Redirect href="/(learner)/home" />;
  }

  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
}
```

- [ ] **Step 2: Verify learner layout tokenVars wrapping**

Read `apps/mobile/src/app/(learner)/_layout.tsx:670-690`. Confirm the `<View style={[{ flex: 1 }, tokenVars]}>` wraps the entire `<Tabs>` component. If not, add it.

Current code (line 674) already does this:
```tsx
return (
  <View style={[{ flex: 1 }, tokenVars]}>
    <Tabs ...>
```

If this is correct, the issue is upstream. Check if the root layout's tokenVars injection at line 250 properly propagates through the Stack navigator to the learner layout's View.

- [ ] **Step 3: Test on Android — verify background colors**

```bash
cd apps/mobile && pnpm exec expo start --dev-client
```

Navigate: sign-in → home → session → More. Verify:
- Background is dark navy (#1a1a3e), NOT gray
- Text is light (#f5f5f5) on dark background
- Input fields have visible borders and contrast
- Tab bar has single background color (surface), not layered

- [ ] **Step 4: If still gray — add intermediate tokenVars injection**

If the Stack navigator breaks CSS variable inheritance, we need tokenVars at every Stack boundary. Check if adding `contentStyle` to Stack.Screen fixes propagation:

```tsx
// In root _layout.tsx, add contentStyle to each screen:
<Stack screenOptions={{ headerShown: false, contentStyle: tokenVars }}>
  <Stack.Screen name="(auth)" options={{ contentStyle: tokenVars }} />
  <Stack.Screen name="(learner)" options={{ contentStyle: tokenVars }} />
  <Stack.Screen name="(parent)" options={{ contentStyle: tokenVars }} />
```

**CAUTION:** `contentStyle` is a react-navigation prop that sets the style of the screen content container. Test carefully — this may conflict with the tokenVars injection in child layouts.

- [ ] **Step 5: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/_layout.tsx src/app/\(auth\)/_layout.tsx --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/\(auth\)/_layout.tsx
git commit -m "fix(mobile): inject tokenVars in auth layout for CSS variable cascade

Fixes BUG-1 (wrong background colors), BUG-2 (low contrast text),
BUG-3 (invisible inputs), BUG-12 (tab bar layering).

Root cause: NativeWind CSS variables set via vars() on the root layout
View did not propagate through Expo Router Stack boundaries to nested
route groups. Auth layout was the only route group without tokenVars
re-injection."
```

---

## Task 2: Re-verify Home Screen Visibility (BUG-7)

**Goal:** After fixing theme cascade, verify coaching cards are now visible. If still invisible, investigate data flow.

**Files:**
- Read: `apps/mobile/src/app/(learner)/home.tsx:376-425`
- Read: `apps/mobile/src/hooks/use-coaching-card.ts`
- Read: `apps/mobile/src/components/coaching/CoachingCard.tsx`
- Read: `apps/mobile/src/components/coaching/AdaptiveEntryCard.tsx`

- [ ] **Step 1: Check coaching card rendering after theme fix**

Launch app, navigate to home screen. Coaching cards should now be visible against the dark navy background. The `bg-coaching-card` class maps to `var(--color-coaching-card)` which is `#2a2a54` — a slightly lighter shade of navy that should be visible against `#1a1a3e` background.

- [ ] **Step 2: If cards still invisible — add diagnostic to useCoachingCard**

```typescript
// In apps/mobile/src/hooks/use-coaching-card.ts
// Add at the end of the hook, before return:
console.log('[COACHING] headline:', headline, 'subtext:', subtext, 'isLoading:', isLoading);
```

Check if `headline` and `subtext` are empty strings (data not loaded) vs. present (rendering issue).

- [ ] **Step 3: If data is empty — check API connectivity**

The coaching card depends on `useContinueSuggestion()` and `useStreaks()`. If the API is unreachable or returns errors, the coaching card data may be empty. Check:
- Is `EXPO_PUBLIC_API_URL` set correctly in the build?
- Is the API running and reachable from the emulator?
- Does `useApiReachability()` return `isApiReachable: true`?

- [ ] **Step 4: Document findings**

If cards are now visible after theme fix → BUG-7 was a symptom of BUG-1.
If cards have data issues → separate bug, document and address.

---

## Task 3: Home Screen UX — Remove Chat Input (BUG-13)

**Goal:** Remove the "Ask me anything..." chat input from the home screen. The home screen should be a card-based hub only.

**Files:**
- Modify: `apps/mobile/src/app/(learner)/home.tsx:596-632`
- Test: Run existing home screen tests

- [ ] **Step 1: Comment out the chat input section**

Per project rules (comment out, don't delete unreleased UI features):

```typescript
// In apps/mobile/src/app/(learner)/home.tsx
// Comment out lines 596-632 (the chat input footer):

      {/* COMMENTED OUT: Chat input removed per BUG-13 — home screen is card-based hub,
          chat input belongs on session screen only.
          See Notion BUG-13: b8ce802f / MentoMate Bug Tracker
      <View
        className="px-4 py-3 bg-surface border-t border-surface-elevated flex-row items-end"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        ... (full chat input JSX)
      </View>
      */}
```

- [ ] **Step 2: Remove unused state and handler**

Comment out the chat input state and handler that are no longer needed:

```typescript
// Comment out line 68:
// const [chatInput, setChatInput] = useState('');

// Comment out lines 125-150 (handleChatSubmit):
// const handleChatSubmit = useCallback((): void => { ... }, [...]);
```

- [ ] **Step 3: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/home.tsx --no-coverage
```

Fix any tests that reference `home-chat-input` or `home-send-button` testIDs.

- [ ] **Step 4: Visual verify on emulator**

Home screen should now show: header greeting → coaching card → subject/retention strip → (no chat input at bottom). The tab bar should be the only bottom element.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/home.tsx
git commit -m "fix(mobile): remove chat input from home screen (BUG-13)

Home screen is a card-based hub — chat input belongs on session screen.
Commented out per project convention (unreleased UI features)."
```

---

## Task 4: Remove Accent Color Picker (BUG-9)

**Goal:** Remove the AccentPicker from the More screen per brand decision (fixed brand: teal primary + lavender secondary, no accent picker).

**Files:**
- Modify: `apps/mobile/src/app/(learner)/more.tsx:256-260`
- Test: Run existing More screen tests

- [ ] **Step 1: Comment out AccentPicker**

```typescript
// In apps/mobile/src/app/(learner)/more.tsx, around line 256:
// Comment out the AccentPicker section:

        {/* COMMENTED OUT: AccentPicker removed per brand decision (project_brand_dark_first.md).
            Fixed brand: teal primary + lavender secondary. No user-configurable accents at MVP.
            See Notion BUG-9: MentoMate Bug Tracker
        <View className="mt-4">
          <AccentPicker
            persona={persona}
            accentPresetId={accentPresetId}
            onSelect={setAccentPresetId}
          />
        </View>
        */}
```

- [ ] **Step 2: Remove unused import if AccentPicker is only used here**

Check if `AccentPicker` import is used elsewhere in this file. If not, comment it out:

```typescript
// import { AccentPicker } from '../../components/settings';
```

Also check if `accentPresetId` and `setAccentPresetId` are used elsewhere in this file. If only used by AccentPicker, comment those out too.

- [ ] **Step 3: Run related tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(learner\)/more.tsx --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/more.tsx
git commit -m "fix(mobile): remove accent color picker from More screen (BUG-9)

Fixed brand decision: teal primary + lavender secondary. No user-configurable
accent colors at MVP. Commented out per project convention."
```

---

## Task 5: Verify Session Opening Message (BUG-5)

**Goal:** Confirm session screen shows an opening message from the tutor on new session creation.

**Files:**
- Read: `apps/mobile/src/app/(learner)/session/index.tsx:125-136`
- Read: `apps/mobile/src/components/session/sessionModeConfig.ts`

- [ ] **Step 1: Verify getOpeningMessage returns non-empty string**

Read `sessionModeConfig.ts` and trace `getOpeningMessage(effectiveMode, sessionExperience, initialProblemText)`. For each mode, verify the function returns a non-empty opening message for experience level 0 (first session).

- [ ] **Step 2: Test on emulator — start a new session**

1. Open app → home screen → tap coaching card action (e.g., "Just ask something")
2. Session screen should show an AI message immediately (before user types anything)
3. Message should be warm and contextual (e.g., "Hey there! I'm excited to learn with you.")

- [ ] **Step 3: If opening message is present but invisible — theme fix (Task 1) resolves this**

If the message IS in the DOM but not visible (text color same as background), this is another Cluster A symptom. Confirm by checking message text color:
- `text-text-primary` → `var(--color-text-primary)` → should be `#f5f5f5` (light)
- If resolving to transparent/dark → theme cascade issue

- [ ] **Step 4: If opening message is genuinely missing — check session creation flow**

Trace: coaching card action → router.push to session → session/index.tsx mounts → `getOpeningMessage()` called → `messages` state initialized with `[{ id: 'opening', role: 'ai', content: openingContent }]`.

If `openingContent` is empty, check:
- Is `effectiveMode` correctly derived from URL params?
- Is `streak?.longestStreak` undefined (causing `sessionExperience` to be 0)?
- Does `getOpeningMessage('learning', 0, undefined)` return empty?

- [ ] **Step 5: Document findings**

If opening message works after theme fix → BUG-5 was a visibility issue (symptom of BUG-1).
If genuinely missing → file a code fix (likely in `getOpeningMessage` fallback logic).

---

## Task 6: Close Non-Bugs in Notion (BUG-6, BUG-11)

**Goal:** Update Notion tracker for confirmed non-bugs.

- [ ] **Step 1: Update BUG-6 in Notion**

Use MCP `notion-update-page` to set:
- Status: Done
- Resolution: "Not a bug — the Share/Edit/Add to/Trash bar was Android's screenshot sharing UI overlay, not the app's bottom navigation. The underlying tab bar layering (BUG-12) is tracked separately."
- Resolved: 2026-04-01

- [ ] **Step 2: Update BUG-11 in Notion**

Use MCP `notion-update-page` to set:
- Status: Done
- Resolution: "Not a bug — the date/time overlay was from Android's screenshot UI, not the app. Verified by comparing with non-screenshot app state."
- Resolved: 2026-04-01

---

## Task 7: Update Notion Tracker — Resolved Bugs

**Goal:** After each fix is verified, update the corresponding Notion bug entries.

- [ ] **Step 1: Update BUG-1 (theme cascade)**

Set Status: Done, Resolution: describe the fix, Fixed In: commit hash or PR number.

- [ ] **Step 2: Update BUG-2, BUG-3, BUG-12 (cascade symptoms)**

Set Status: Done, Resolution: "Resolved by BUG-1 fix — CSS variable cascade now propagates correctly through all route group layouts."

- [ ] **Step 3: Update BUG-7 (empty home screen)**

If resolved by theme fix: Resolution: "Coaching cards were rendered but invisible due to CSS variable cascade failure (BUG-1). Theme fix restored visibility."
If data issue: Resolution: describe specific fix.

- [ ] **Step 4: Update BUG-5, BUG-13, BUG-9**

Set appropriate resolution text per the actual fix applied.

- [ ] **Step 5: Update BUG-4, BUG-8, BUG-10**

These may need separate assessment:
- BUG-4 (input bar size): Likely theme-related — check after theme fix
- BUG-8 (generic greeting): Current behavior is intentional but could be enhanced (defer to UX discussion)
- BUG-10 (persona on home): Architectural change — defer to Epic 12 (persona removal) or discuss scope

---

## Dependency Graph

```
Task 0 (Verify) ──┬──→ Task 1 (Theme Fix) ──→ Task 2 (Re-verify Cards)
                   │                                    │
                   │         ┌──────────────────────────┘
                   │         ▼
                   ├──→ Task 3 (Remove Chat Input)  [independent]
                   ├──→ Task 4 (Remove Accent Picker) [independent]
                   ├──→ Task 5 (Verify Session Msg) [after Task 1]
                   └──→ Task 6 (Close Non-Bugs)     [independent]
                              │
                              ▼
                         Task 7 (Update Notion) [after all fixes verified]
```

Tasks 3, 4, and 6 are independent and can run in parallel.
Task 1 must complete before Tasks 2 and 5.
Task 7 runs last after all fixes are verified.

---

## Deferred / Out of Scope

| Bug | Reason | Where to Track |
|-----|--------|---------------|
| BUG-8 (generic greeting) | UX enhancement, not a bug. Current greeting is persona-aware. Richer personalization is a feature request. | Discuss during UX review |
| BUG-10 (personas on home) | Architectural change. Epic 12 (persona removal) replaces persona concept with intent-as-cards. | Epic 12 in `docs/epics.md` |
