# Animation Improvements Design Spec

**Date:** 2026-04-16
**Status:** Draft
**Branch:** bugfix

## Problem

The current animation components have three issues:

1. **PenWritingAnimation** — the pen body was never built. Only a tiny triangle nib exists, making the "pen" invisible at normal sizes. The commit `f300bc1b` attempted to move the nib into SVG via `AnimatedG` with `x`/`y` animatedProps, but this approach doesn't work on Fabric (New Architecture).
2. **BookPageFlipAnimation** — uses flat 2D `scaleX` flips. Looks static and unimpressive. A 3D page-turn effect was expected but never implemented.
3. **BrandCelebration** — rendered at 36px (too small for its 12+ SVG elements). `AnimatedCircle` with animated `r` starting at 0 may not reliably animate on Fabric, leaving everything invisible.

Additionally, no distinction exists between "AI is thinking" and "waiting for child input" — the same pen animation is used for both.

## Design

### 1. Magic Pen Animation (new: `MagicPenAnimation`)

**Purpose:** "Waiting for the child to respond" indicator. Shown after 20s of idle time when the AI has finished and the child hasn't typed.

**Visual concept:** A cartoon fountain pen with a visible body, grip section, and nib. The pen follows a cursive stroke path as ink flows from the tip.

**Pen shape (static SVG group):**
- Barrel: elongated rounded rectangle, angled ~45deg for a natural writing posture
- Grip section: slightly tapered, darker shade
- Nib: pointed triangle tip where ink appears
- Optional: subtle sparkle/glow aura at the nib tip (magic feel)

**Ink animation:**
- The cursive stroke draws itself (existing `strokeDashoffset` technique — proven to work on Fabric)
- Ink starts bold/opaque near the nib and fades behind (gradient opacity via a second overlay path)
- 2-3 tiny ink droplets occasionally detach from the nib (animated `Animated.View` dots that fall and fade out)
- On reset, the ink trail fades away like being absorbed into the page

**Pen movement:**
- The entire pen is positioned via `Animated.View` overlay with `useAnimatedStyle` (translateX, translateY, rotate) — the proven reliable approach on Fabric
- The static SVG pen shape sits inside this `Animated.View`
- The animated transform tracks `progress` (0→1) to follow the stroke start→end

**Loop timing:**
- Draw: 1500ms (cursive stroke draws, pen follows)
- Pause: 600ms (pen rests at end)
- Fade/Reset: 300ms (ink fades, pen returns to start)

**Sizes used:**
- Book topic loading (`[bookId].tsx`): 100px — full animation with ink droplets
- ChatShell idle: 48px — simplified (no droplets, pen + stroke only)

**Colors:**
- Pen body: theme `accent` color (passed via `color` prop)
- Ink: same color at varying opacity
- Nib glow: warm amber (`#fbbf24`) at low opacity

**Replaces:** `PenWritingAnimation` at the `showIdleAnim` location in ChatShell, and the book topic loading screen.

### 2. Light Bulb Animation (new: `LightBulbAnimation`)

**Purpose:** "AI is thinking" indicator. Shown when `isStreaming === true` — from the moment the user sends a message until the first tokens start appearing or the stream ends.

**Visual concept:** A cartoon-style incandescent bulb that gradually fills with warm light and pulses.

**Bulb shape (static SVG):**
- Classic bulb silhouette: rounded top, narrowing to a screw base
- Filament lines inside (2-3 curved paths)
- Screw base at bottom (horizontal ridges)

**Animation phases:**
1. **Filament heats up** (0-400ms): filament paths draw themselves (strokeDashoffset), turning from dark to warm amber
2. **Glow fills** (400-800ms): a radial glow `Animated.View` behind the bulb scales up and fades in (warm golden, `#fbbf24` → `#f59e0b`, opacity 0→0.4)
3. **Pulse** (800ms+, looping): the glow pulses gently (scale 0.95→1.05, opacity 0.3→0.5) with `withRepeat`
4. **Rays appear** (only at size >= 80px): 6-8 short lines radiate from the bulb, animated via strokeDashoffset

**Implementation:**
- Bulb outline + filament: static SVG paths (no AnimatedG/AnimatedCircle — Fabric-safe)
- Glow: `Animated.View` with `useAnimatedStyle` (scale + opacity). Positioned behind the SVG via absolute positioning
- Rays: `AnimatedPath` with `strokeDashoffset` (proven to work)
- All animation driven by `useSharedValue` + `withTiming`/`withRepeat`

**Sizes used:**
- ChatShell "AI thinking": 48px — bulb + glow only, no rays
- Could be reused elsewhere at larger sizes if needed

**Colors:**
- Bulb outline: passed `color` prop (defaults to theme muted)
- Filament/glow: warm amber `#fbbf24`
- Rays: theme `accent` at low opacity

**Reduced motion:** Shows static fully-lit bulb immediately.

### 3. Book Page-Flip Animation (upgrade: `BookPageFlipAnimation`)

**Purpose:** Loading indicator for the library screen.

**Current:** Three rectangles flip via flat `scaleX`. Looks like colored cards flipping, not pages turning.

**New visual:** 3D perspective page turns using `Animated.View` with `perspective` and `rotateY`.

**Book structure (same proportional layout as current):**
- Left cover, right cover, spine — static `View` elements (unchanged)
- 3 pages — `Animated.View` with 3D transforms

**Page-flip animation:**
- Each page: `rotateY` from `0deg` → `-180deg`, anchored at left edge via `transformOrigin: ['0%', '50%', 0]` (same spine anchor as current)
- **New:** `perspective: 800` on each page creates depth — the page edge lifts toward the viewer mid-flip
- **New:** `elevation` / shadow increases at the midpoint (90deg) of each flip, creating a "lifting off the page" feel
- Stagger: 300ms between pages (same as current)
- Pages have a slight color gradient — the front side uses `color` prop, the back side is slightly darker (simulated by changing backgroundColor mid-flip at the 90deg crossover point)

**Timing (unchanged):**
- Page flip: 500ms per page
- Stagger: 300ms
- Pause: 400ms at fully flipped
- Reset: 300ms

**Implementation:**
- Pure `Animated.View` — no SVG. Same approach as current but with added `perspective` and `rotateY` instead of `scaleX`
- The 90deg color-swap is achieved by interpolating backgroundColor at the midpoint
- `useAnimatedStyle` for each page (proven Fabric-safe)

**Size:** 80px on library loading.

### 4. ChatShell Animation Wiring

**Current state machine in ChatShell:**
```
isStreaming=true  → AI is processing (no animation currently)
isStreaming=false → AI finished
  → 20s idle timer → showIdleAnim=true → PenWritingAnimation
```

**New wiring:**
```
isStreaming=true  → show LightBulbAnimation (AI is thinking)
isStreaming=false → AI finished
  → 20s idle timer → showIdleAnim=true → MagicPenAnimation (child should write)
```

**Changes to ChatShell.tsx:**
- Import `LightBulbAnimation` and `MagicPenAnimation` (replacing `PenWritingAnimation` import)
- Add a new conditional block before the messages list OR at the bottom of the scroll area:
  ```tsx
  {isStreaming && (
    <View className="items-center py-4" testID="thinking-bulb-animation">
      <LightBulbAnimation size={48} color={colors.muted} />
    </View>
  )}
  ```
- Replace the existing `showIdleAnim` block:
  ```tsx
  {showIdleAnim && (
    <View className="items-center py-4" testID="idle-pen-animation">
      <MagicPenAnimation size={48} color={colors.muted} />
    </View>
  )}
  ```

### 5. Celebration Fixes (BrandCelebration + CelebrationAnimation)

**Size bump:** Change `<BrandCelebration size={36} />` to `size={56}` at both call sites:
- `session-summary/[sessionId].tsx:456`
- `library.tsx:483`

56px gives the complex SVG animation enough room to be visible while remaining inline with text.

**Fabric animation safety net:** Add a fallback timer in `BrandCelebration` and `CelebrationAnimation`:
```tsx
useEffect(() => {
  // If animations haven't started after 150ms (Fabric native module hiccup),
  // jump shared values to their final static positions
  const fallback = setTimeout(() => {
    if (studentR.value < 0.1) {
      // Animation didn't fire — set final state
      studentR.value = 15;
      // ... all other final values
    }
  }, 150);
  return () => clearTimeout(fallback);
}, []);
```

This ensures celebrations are always visible, even if `AnimatedCircle` prop updates don't fire on Fabric. The animation is single-shot (~700ms), so the 150ms detection window is well within the first frame.

## Components Summary

| Component | File | Type | Approach |
|---|---|---|---|
| `MagicPenAnimation` | `components/common/MagicPenAnimation.tsx` | New | SVG pen shape in Animated.View overlay |
| `LightBulbAnimation` | `components/common/LightBulbAnimation.tsx` | New | SVG bulb + Animated.View glow |
| `BookPageFlipAnimation` | `components/common/BookPageFlipAnimation.tsx` | Rewrite | Animated.View with perspective + rotateY |
| `BrandCelebration` | `components/common/BrandCelebration.tsx` | Patch | Fabric fallback timer |
| `CelebrationAnimation` | `components/common/CelebrationAnimation.tsx` | Patch | Fabric fallback timer |
| `ChatShell` | `components/session/ChatShell.tsx` | Patch | Wire LightBulb + MagicPen |
| Session summary | `app/session-summary/[sessionId].tsx` | Patch | BrandCelebration size 36→56 |
| Library | `app/(app)/library.tsx` | Patch | BrandCelebration size 36→56 |
| Book topic | `app/(app)/shelf/[subjectId]/book/[bookId].tsx` | Patch | PenWritingAnimation → MagicPenAnimation |
| Barrel export | `components/common/index.ts` | Patch | Export new components |

## Fabric Safety Rules

All animations MUST follow these rules to work reliably on Fabric (New Architecture):

1. **Never use `Animated.createAnimatedComponent(G)` with `x`/`y` animatedProps** — doesn't propagate on Fabric
2. **`Animated.View` with `useAnimatedStyle` is the gold standard** — always works for position, scale, opacity, rotation
3. **`AnimatedPath` with `strokeDashoffset`/`strokeDasharray` works** — proven in existing animations
4. **`AnimatedCircle` with animated `r` starting at 0 is unreliable** — use `R_FLOOR` + fallback timer
5. **Position SVG elements via `Animated.View` wrapper, not SVG-native `x`/`y` props**

## Old Component Cleanup

- `PenWritingAnimation.tsx` — keep but deprecate (or remove if no other consumers). Book topic screen and ChatShell both switch to new components.
- Actually: delete `PenWritingAnimation.tsx` entirely. All 2 call sites (ChatShell, book topic) switch to the new components. No consumers remain.

## Testing

Each new/modified component needs:
- Renders without crash (default props)
- Accepts custom size/color props
- Honors `useReducedMotion` (static final state, no animation loop)
- Cleanup on unmount (cancel animations)
- Accessibility label present

ChatShell wiring test:
- LightBulbAnimation shown when `isStreaming=true`
- MagicPenAnimation shown when idle timer fires
- Neither shown during normal conversation flow

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Reanimated native module fails | Fabric init error | Static fallback (reduced motion path) | Automatic — `useReducedMotion` returns true |
| AnimatedCircle r=0 stuck | Fabric prop update miss | BrandCelebration invisible | Fallback timer sets final values at 150ms |
| SVG not rendering | react-native-svg crash | Empty space where animation should be | Graceful — no crash, just missing visual |
