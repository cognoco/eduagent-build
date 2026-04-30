---
name: key={themeKey} AND persona fade animation both removed — device build safety
description: NEVER use key prop for nav remount OR Animated.View opacity fades on the root layout shell. Both cause device-only failures.
type: project
---

`key={themeKey}` was removed from `ThemedContent` (_layout.tsx), `LearnerLayout`, and `ParentLayout` on 2026-03-29 (commit a976e80, PR #85).

**Persona fade animation also removed (2026-04-02, PR #95):** The `Animated.View` opacity wrapper in `ThemedContent` (which faded from 0.6→1 on persona switch) was removed because it could get stuck mid-transition in release/device builds, leaving post-auth learner screens permanently washed out — including a hazy tab bar. The root layout shell is now a plain `<View>` with `tokenVars`.

**AnimatedEntry also neutralized (same PR):** The `AnimatedEntry` component (Reanimated fade+slide) was replaced with a pass-through `<>{children}</>` because its opacity-0 start value could fail to animate in Hermes release builds, leaving entire home screen sections invisible.

**Why:** Sentry MENTOMATE-MOBILE-6 (key crash) + device build triage 2026-04-02 (opacity failures). Reanimated shared values don't always fire timing callbacks in release Hermes builds.

**How to apply:**
- NEVER add `key` props that cause full navigation tree remounts on theme/persona changes
- NEVER wrap the root authenticated shell in an animated opacity container
- If entry animations are needed in the future, test on device release builds first — dev mode behavior differs
- NativeWind `vars()` style prop propagates CSS variable updates WITHOUT remounting
