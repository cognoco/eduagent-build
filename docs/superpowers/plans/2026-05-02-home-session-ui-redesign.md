# Home + Session UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Learner Home screen (Direction C: coach band + subject carousel + ask-anything + action grid) and the Session screen (escalation rung strip, memory chip, verification badge restyle, composer mic-in-pill).

**Architecture:** Home switches from a flat IntentCard stack to a structured layout: greeting → conditional coach band → horizontal subject carousel → ask-anything composer → 3-action grid. Session surfaces existing pedagogical state (escalation rungs, exchange budget) in the header, adds a memory chip, and consolidates the composer by moving mic into the input pill. All data comes from existing hooks (`useSubjects`, `useOverallProgress`, `useLearningResumeTarget`, `useReviewSummary`) — no new API endpoints needed.

**Tech Stack:** React Native, NativeWind/Tailwind, Expo Router, React Query, Ionicons, expo-linear-gradient, existing design tokens.

**Design reference:** `design_handoff_ui_improvements/README.md` (the spec) + `design_handoff_ui_improvements/screens.jsx` (visual mock code). Build Direction C. Do NOT build Direction B.

**Rollout strategy:** The coach band (Task 4b) and composer mic-in-pill (Task 8) are the highest-risk changes. Both should ship behind a simple runtime flag (e.g., a constant in `lib/feature-flags.ts`) so they can be disabled without a code deploy if telemetry shows regressions. The carousel + actions (Task 4a) and session header changes (Tasks 6–7) are additive and can ship directly.

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `apps/mobile/src/components/home/SubjectCard.tsx` | Single subject card for the carousel (icon tile, name, hint, progress bar) |
| `apps/mobile/src/components/home/SubjectCard.test.tsx` | Tests for SubjectCard |
| `apps/mobile/src/components/home/CoachBand.tsx` | Conditional coaching recommendation band |
| `apps/mobile/src/components/home/CoachBand.test.tsx` | Tests for CoachBand |
| `apps/mobile/src/lib/subject-tints.ts` | Deterministic subject → tint color mapping |
| `apps/mobile/src/lib/subject-tints.test.ts` | Tests for tint mapping |

### Modified files

| File | What changes |
|---|---|
| `apps/mobile/src/lib/design-tokens.ts` | Add `subjectTints` palette array |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Replace IntentCard stack with new layout (greeting row, coach band, carousel, ask-anything, action grid) |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | Update tests for new layout + testIDs |
| `apps/mobile/src/components/home/index.ts` | Add new component exports |
| `apps/mobile/src/components/session/ChatShell.tsx` | Add `pedagogicalState` + `memoryHint` props, rung strip in header, memory chip below header, composer mic-in-pill, default `hideInputModeToggle` to true |
| `apps/mobile/src/components/session/ChatShell.test.tsx` | Update tests for new props, rung strip, memory chip, composer layout |
| `apps/mobile/src/components/session/MessageBubble.tsx` | Restyle verification badge (pill → inline text chip below bubble) |
| `apps/mobile/src/components/session/MessageBubble.test.tsx` | Add tests for restyled badge |
| `apps/mobile/e2e/flows/learning/*.yaml` | Update testIDs (`intent-continue` → `home-subject-card-*`, etc.) |
| `apps/mobile/e2e/flows/homework/*.yaml` | Update `intent-homework` → `home-action-homework` |
| `apps/mobile/e2e/flows/edge/*.yaml` | Update `intent-learn` → `home-action-study-new` or `home-add-subject-tile` |

### Files to leave alone

| File | Why |
|---|---|
| `apps/mobile/src/components/home/IntentCard.tsx` | Keep — still used by `ParentGateway.tsx`. Do not delete. |
| `apps/mobile/src/components/home/EarlyAdopterCard.tsx` | Keep file but remove from LearnerScreen render. Relocation TBD (per README: confirm with product). |
| `apps/mobile/src/components/home/ParentGateway.tsx` | Untouched — parent home is separate. |

---

## Data Wiring Reference

The carousel needs per-subject data. Here's how to get it without new API endpoints:

```
useSubjects()              → Subject[] (id, name, status)            — typed via Hono RPC
useOverallProgress()       → unknown (return type is untyped!)       — see ⚠️ below
useLearningResumeTarget()  → LearningResumeTarget | null             — typed via schema
useReviewSummary()         → ReviewSummary                           — typed via schema
readSessionRecoveryMarker  → SessionRecoveryMarker | null            — typed locally
```

**⚠️ `useOverallProgress` typing gap:** The hook returns `UseQueryResult<unknown>` because the `queryFn` does `return await res.json()` with no generic parameter. The runtime shape is `{ subjects: SubjectProgress[], totalTopicsCompleted, totalTopicsVerified }`, but TypeScript won't guard access to `.subjects`. **Before using this hook in Task 4a, add a type parameter to the hook** (or create a local `OverallProgressResponse` interface and cast). Do NOT access `.subjects` on `unknown` — it will be a typecheck error.

**Per-card hint derivation** (in `LearnerScreen`, not in `SubjectCard`):
1. If `resumeTarget.subjectId === card.subjectId` AND `resumeKind` is `active_session` | `paused_session` → `"Continue {topicTitle}"`
2. Else if `reviewSummary.nextReviewTopic?.subjectId === card.subjectId` → `"Quiz: {topicTitle}"`
3. Else if `subjectProgress.topicsCompleted > 0` → `"Practice: {subjectName}"`
4. Else → `"Open"`

**Progress bar**: `subjectProgress.topicsCompleted / subjectProgress.topicsTotal` (momentum, not retention).

---

## Task 1: Subject tint palette + deterministic mapping

**Files:**
- Modify: `apps/mobile/src/lib/design-tokens.ts`
- Create: `apps/mobile/src/lib/subject-tints.ts`
- Create: `apps/mobile/src/lib/subject-tints.test.ts`

- [ ] **Step 1: Write failing test for `getSubjectTint`**

```ts
// apps/mobile/src/lib/subject-tints.test.ts
import { getSubjectTint, SUBJECT_TINT_PALETTE } from './subject-tints';

describe('getSubjectTint', () => {
  it('returns a tint object for a valid UUID', () => {
    const tint = getSubjectTint('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'dark');
    expect(tint).toHaveProperty('solid');
    expect(tint).toHaveProperty('soft');
    expect(SUBJECT_TINT_PALETTE.dark).toContainEqual(
      expect.objectContaining({ solid: tint.solid }),
    );
  });

  it('returns the same tint for the same ID across calls', () => {
    const id = 'deadbeef-dead-beef-dead-beefdeadbeef';
    expect(getSubjectTint(id, 'dark')).toEqual(getSubjectTint(id, 'dark'));
  });

  it('returns different colors for light vs dark scheme', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const lightTint = getSubjectTint(id, 'light');
    const darkTint = getSubjectTint(id, 'dark');
    expect(lightTint.solid).not.toEqual(darkTint.solid);
  });

  it('distributes 20 random UUIDs across at least 4 of 5 palette entries', () => {
    const ids = Array.from({ length: 20 }, () =>
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      }),
    );
    const tints = ids.map((id) => getSubjectTint(id, 'dark'));
    const uniqueSolids = new Set(tints.map((t) => t.solid));
    expect(uniqueSolids.size).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/lib/subject-tints.test.ts --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Add palette to design-tokens.ts**

In `apps/mobile/src/lib/design-tokens.ts`, add **after** the `tokens` object. The tint palette must respect both light and dark themes — the existing `tokens` object has different primary/secondary values per scheme (light primary is `#0d9488`, dark is `#2dd4bf`). The tints are decorative accents for subject cards, NOT brand primaries — they must be distinct from `primary`, `secondary`, and the retention palette.

```ts
export const SUBJECT_TINT_PALETTE = {
  light: [
    { name: 'teal',   solid: '#0f766e', soft: 'rgba(15,118,110,0.14)' },
    { name: 'purple', solid: '#7c3aed', soft: 'rgba(124,58,237,0.14)' },
    { name: 'amber',  solid: '#b45309', soft: 'rgba(180,83,9,0.14)' },
    { name: 'blue',   solid: '#2563eb', soft: 'rgba(37,99,235,0.14)' },
    { name: 'rose',   solid: '#db2777', soft: 'rgba(219,39,119,0.14)' },
  ],
  dark: [
    { name: 'teal',   solid: '#2dd4bf', soft: 'rgba(45,212,191,0.18)' },
    { name: 'purple', solid: '#a78bfa', soft: 'rgba(167,139,250,0.18)' },
    { name: 'amber',  solid: '#eab308', soft: 'rgba(234,179,8,0.18)' },
    { name: 'blue',   solid: '#60a5fa', soft: 'rgba(96,165,250,0.18)' },
    { name: 'rose',   solid: '#f472b6', soft: 'rgba(244,114,182,0.18)' },
  ],
} as const;

export type SubjectTint = (typeof SUBJECT_TINT_PALETTE)['light'][number];
```

**Why theme-aware tints:** The dark-mode tints (`#2dd4bf`) are too bright on light backgrounds (cream `#faf5ee`), and the light-mode tints (`#0f766e`) would be invisible on dark backgrounds (`#1a1a3e`). The palette must shift with the theme just like all other semantic colors in the design system.

- [ ] **Step 4: Implement `getSubjectTint`**

Uses FNV-1a on the hex-only portion of the UUID (stripping hyphens) for better distribution across the 5-element palette. The naive `hash * 31 + charCode` approach clusters on UUIDs because hyphens at fixed positions and the narrow hex charset skew the hash.

```ts
// apps/mobile/src/lib/subject-tints.ts
import { SUBJECT_TINT_PALETTE, type SubjectTint, type ColorScheme } from './design-tokens';

export { SUBJECT_TINT_PALETTE };

export function getSubjectTint(subjectId: string, colorScheme: ColorScheme): SubjectTint {
  const palette = SUBJECT_TINT_PALETTE[colorScheme];
  const hex = subjectId.replace(/-/g, '');
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < hex.length; i++) {
    hash ^= hex.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  const index = ((hash >>> 0) % palette.length);
  return palette[index];
}
```

In LearnerScreen, call it with the current color scheme: `getSubjectTint(s.id, colorScheme)` where `colorScheme` comes from `useColorScheme()` (already imported in most screens via the theme context).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/lib/subject-tints.test.ts --no-coverage`
Expected: PASS — all 3 tests green.

- [ ] **Step 6: Commit**

Files: `apps/mobile/src/lib/design-tokens.ts`, `apps/mobile/src/lib/subject-tints.ts`, `apps/mobile/src/lib/subject-tints.test.ts`
Message: `feat(mobile): add subject tint palette and deterministic mapping`

---

## Task 2: SubjectCard component

**Files:**
- Create: `apps/mobile/src/components/home/SubjectCard.tsx`
- Create: `apps/mobile/src/components/home/SubjectCard.test.tsx`
- Modify: `apps/mobile/src/components/home/index.ts`

- [ ] **Step 1: Write failing tests for SubjectCard**

```tsx
// apps/mobile/src/components/home/SubjectCard.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { SubjectCard, type SubjectCardProps } from './SubjectCard';

const baseProps: SubjectCardProps = {
  subjectId: 'abc-123',
  name: 'Algebra',
  hint: 'Continue Linear equations',
  progress: 0.55,
  tintSolid: '#2dd4bf',
  tintSoft: 'rgba(45,212,191,0.18)',
  icon: 'calculator-outline',
  onPress: jest.fn(),
  testID: 'home-subject-card-abc-123',
};

describe('SubjectCard', () => {
  it('renders subject name and hint', () => {
    const { getByText } = render(<SubjectCard {...baseProps} />);
    expect(getByText('Algebra')).toBeTruthy();
    expect(getByText('Continue Linear equations')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SubjectCard {...baseProps} onPress={onPress} />,
    );
    fireEvent.press(getByTestId('home-subject-card-abc-123'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders progress bar with correct fill', () => {
    const { getByTestId } = render(<SubjectCard {...baseProps} />);
    const bar = getByTestId('home-subject-card-abc-123-progress');
    expect(bar).toBeTruthy();
  });

  it('renders the icon tile', () => {
    const { getByTestId } = render(<SubjectCard {...baseProps} />);
    expect(getByTestId('home-subject-card-abc-123-icon')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/home/SubjectCard.test.tsx --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SubjectCard**

```tsx
// apps/mobile/src/components/home/SubjectCard.tsx
import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SubjectCardProps {
  subjectId: string;
  name: string;
  hint: string;
  progress: number; // 0–1
  tintSolid: string;
  tintSoft: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  testID: string;
}

export function SubjectCard({
  name,
  hint,
  progress,
  tintSolid,
  tintSoft,
  icon,
  onPress,
  testID,
}: SubjectCardProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityLabel={`${name}. ${hint}`}
      accessibilityRole="button"
      className="w-[142px] rounded-2xl bg-surface border border-border p-3.5 pb-4"
      style={{ gap: 10 }}
    >
      <View
        testID={`${testID}-icon`}
        className="w-[38px] h-[38px] rounded-xl items-center justify-center"
        style={{ backgroundColor: tintSoft }}
      >
        <Ionicons name={icon} size={20} color={tintSolid} />
      </View>
      <View>
        <Text className="text-[15px] font-bold text-text-primary">{name}</Text>
        <Text className="text-[11px] text-text-tertiary mt-1" numberOfLines={2}>
          {hint}
        </Text>
      </View>
      <View className="mt-auto">
        <View className="h-1 rounded-full bg-surface-elevated overflow-hidden flex-row">
          {/* Use flex instead of percentage width — percentage widths in RN
              require an explicit parent width, which we don't have here. */}
          <View
            testID={`${testID}-progress`}
            className="h-full rounded-full"
            style={{ flex: progress, backgroundColor: tintSolid }}
          />
          <View style={{ flex: 1 - progress }} />
        </View>
      </View>
    </Pressable>
  );
}
```

Mock `@expo/vector-icons` in the test file if not already handled by the test setup:

```tsx
// Add at top of SubjectCard.test.tsx if needed:
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/home/SubjectCard.test.tsx --no-coverage`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Export from index.ts**

Add to `apps/mobile/src/components/home/index.ts`:

```ts
export { SubjectCard } from './SubjectCard';
```

- [ ] **Step 6: Commit**

Files: `SubjectCard.tsx`, `SubjectCard.test.tsx`, `index.ts`
Message: `feat(mobile): add SubjectCard component for home carousel`

---

## Task 3: CoachBand component

**Files:**
- Create: `apps/mobile/src/components/home/CoachBand.tsx`
- Create: `apps/mobile/src/components/home/CoachBand.test.tsx`
- Modify: `apps/mobile/src/components/home/index.ts`

- [ ] **Step 1: Write failing tests for CoachBand**

```tsx
// apps/mobile/src/components/home/CoachBand.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { CoachBand, type CoachBandProps } from './CoachBand';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

describe('CoachBand', () => {
  const baseProps: CoachBandProps = {
    headline: 'Pick up where you stopped in Linear equations.',
    topicHighlight: 'Linear equations',
    eyebrow: 'TONIGHT',
    estimatedMinutes: 4,
    onContinue: jest.fn(),
    onDismiss: jest.fn(),
  };

  it('renders nothing when headline is null', () => {
    const { queryByTestId } = render(
      <CoachBand {...baseProps} headline={null} />,
    );
    expect(queryByTestId('home-coach-band')).toBeNull();
  });

  it('renders the headline with topic highlighted', () => {
    const { getByTestId, getByText } = render(<CoachBand {...baseProps} />);
    expect(getByTestId('home-coach-band')).toBeTruthy();
    expect(getByText(/Linear equations/)).toBeTruthy();
  });

  it('fires onContinue when Continue is tapped', () => {
    const onContinue = jest.fn();
    const { getByTestId } = render(
      <CoachBand {...baseProps} onContinue={onContinue} />,
    );
    fireEvent.press(getByTestId('home-coach-band-continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when dismiss is tapped', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <CoachBand {...baseProps} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByTestId('home-coach-band-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders eyebrow text', () => {
    const { getByText } = render(<CoachBand {...baseProps} />);
    expect(getByText(/TONIGHT/)).toBeTruthy();
  });

  it('renders estimated minutes', () => {
    const { getByText } = render(<CoachBand {...baseProps} />);
    expect(getByText('4 min')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/home/CoachBand.test.tsx --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CoachBand**

```tsx
// apps/mobile/src/components/home/CoachBand.tsx
import { Pressable, View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeColors } from '../../hooks/use-theme';

export interface CoachBandProps {
  headline: string | null;
  topicHighlight?: string;
  eyebrow?: string;
  estimatedMinutes?: number;
  onContinue: () => void;
  onDismiss: () => void;
}

export function CoachBand({
  headline,
  topicHighlight,
  eyebrow = 'TONIGHT',
  estimatedMinutes,
  onContinue,
  onDismiss,
}: CoachBandProps) {
  const colors = useThemeColors();
  if (!headline) return null;

  const renderHeadline = () => {
    if (!topicHighlight || !headline.includes(topicHighlight)) {
      return (
        <Text className="text-[17px] font-bold leading-snug text-text-primary">
          {headline}
        </Text>
      );
    }
    // Use indexOf to safely split at the first occurrence only
    const idx = headline.indexOf(topicHighlight);
    const before = headline.slice(0, idx);
    const after = headline.slice(idx + topicHighlight.length);
    return (
      <Text className="text-[17px] font-bold leading-snug text-text-primary">
        {before}
        <Text className="text-primary">{topicHighlight}</Text>
        {after}
      </Text>
    );
  };

  return (
    {/* Gradient colors use the existing primarySoft / secondary tokens.
        The component should use useThemeColors() to read the active theme's
        primary and secondary, then derive the gradient stops:
        - start: primary at 20% alpha
        - end: secondary at 10% alpha
        - border: primary at 25% alpha
        This ensures the band looks correct in both light and dark mode. */}
    <LinearGradient
      testID="home-coach-band"
      colors={[`${colors.primarySoft}`, `rgba(${secondaryRgb},0.10)`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="rounded-2xl p-4 relative mx-5 mt-1.5 mb-3"
      style={{
        borderWidth: 1,
        borderColor: `rgba(${primaryRgb},0.25)`,
      }}
    >
      <Text className="text-[10px] font-bold uppercase tracking-wider text-primary">
        💡 {eyebrow}
      </Text>
      <View className="mt-1.5">{renderHeadline()}</View>
      <View className="flex-row items-center gap-2.5 mt-3">
        <Pressable
          testID="home-coach-band-continue"
          onPress={onContinue}
          className="bg-primary rounded-xl px-[18px] py-2.5"
        >
          <Text className="text-sm font-bold text-text-inverse">Continue</Text>
        </Pressable>
        {estimatedMinutes != null && (
          <Text className="text-[11px] text-text-tertiary">
            {estimatedMinutes} min
          </Text>
        )}
      </View>
      <Pressable
        testID="home-coach-band-dismiss"
        onPress={onDismiss}
        className="absolute top-2 right-2.5 p-1"
        hitSlop={8}
        accessibilityLabel="Dismiss recommendation"
        accessibilityRole="button"
      >
        <Text className="text-text-tertiary text-base">×</Text>
      </Pressable>
    </LinearGradient>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/home/CoachBand.test.tsx --no-coverage`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Export from index.ts**

Add to `apps/mobile/src/components/home/index.ts`:

```ts
export { CoachBand } from './CoachBand';
```

- [ ] **Step 6: Commit**

Files: `CoachBand.tsx`, `CoachBand.test.tsx`, `index.ts`
Message: `feat(mobile): add CoachBand component for conditional coaching recommendation`

---

## Task 4a: Restructure LearnerScreen — carousel + actions (predictable spine)

This task replaces the IntentCard stack with the carousel, ask-anything composer, and action grid. The coach band is added separately in Task 4b so the two changes are independently revertable, per the design handoff's rollout guidance.

**Files:**
- Modify: `apps/mobile/src/hooks/use-progress.ts` (type the hook)
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`
- Modify: `apps/mobile/src/components/common/ProfileSwitcher.tsx` (add `size` prop)

**Prerequisites:** Tasks 1–2 must be complete. Task 3 (CoachBand) is NOT needed yet.

### Context for the implementer

Read the current `LearnerScreen.tsx` fully before starting. Key points:
- The component already reads `useSubjects()`, `useLearningResumeTarget()`, `useReviewSummary()`, `useQuizDiscoveryCard()`, and `readSessionRecoveryMarker()`.
- The `intentCards` array built in `useMemo` is being **replaced** with `subjectCards`. In this task, the old continue/quiz-discovery logic stays as temporary inline cards below the carousel — they move into the CoachBand in Task 4b.
- The `isParentProxy` guard must still work: hide ask-anything, make carousel read-only.
- The `EarlyAdopterCard` is removed from this screen's render (keep the file).
- Keep the loading state (BookPageFlipAnimation + 15s timeout) and error state as-is.

### Implementation steps

- [ ] **Step 1: Type `useOverallProgress` and add import**

**First**, fix the untyped hook in `apps/mobile/src/hooks/use-progress.ts`. The `queryFn` currently returns `unknown` via `res.json()`. Add an interface and pass it as the generic:

```ts
// Add to use-progress.ts (near the top, alongside other interfaces):
export interface OverallProgressResponse {
  subjects: {
    subjectId: string;
    name: string;
    topicsTotal: number;
    topicsCompleted: number;
    topicsVerified: number;
    urgencyScore: number;
    retentionStatus: string;
    lastSessionAt: string | null;
  }[];
  totalTopicsCompleted: number;
  totalTopicsVerified: number;
}
```

Then update the hook to use it:

```ts
export function useOverallProgress() {
  // ... existing code ...
  return useQuery<OverallProgressResponse>({
    // ... rest unchanged, just add the generic parameter
  });
}
```

**Then** in `LearnerScreen.tsx`, add alongside the existing hook calls:

```ts
import { useOverallProgress } from '../../hooks/use-progress';
```

And inside the component:

```ts
const { data: overallProgress } = useOverallProgress();
```

This gives us typed `OverallProgressResponse` for all subjects in one call (already cached by React Query if Library screen was visited).

- [ ] **Step 2: Add subject-tints import**

```ts
import { getSubjectTint } from '../../lib/subject-tints';
```

- [ ] **Step 3: Subject icon strategy**

Subjects don't have an `icon` field in the database. A hash-based mapping to themed icons (calculator, flask, etc.) would assign semantically misleading icons — a French subject could get a flask. Instead, use a single neutral icon (`book-outline`) for all subjects for now. The tint color already provides visual differentiation per card.

```ts
const DEFAULT_SUBJECT_ICON: React.ComponentProps<typeof Ionicons>['name'] = 'book-outline';
```

**Future:** Add an optional `icon` column to the subjects table (or a client-side subject-name → icon heuristic using keyword matching) so users see semantically correct icons. This is a separate task.

- [ ] **Step 4: Build the per-subject card data**

Replace the `intentCards` `useMemo` with a new `subjectCards` memo:

```ts
const subjectCards = useMemo(() => {
  if (!subjects?.length) return [];
  const progressBySubject = new Map(
    (overallProgress?.subjects ?? []).map((p) => [p.subjectId, p]),
  );
  return subjects
    .filter((s) => s.status === 'active')
    .map((s) => {
      const progress = progressBySubject.get(s.id);
      const tint = getSubjectTint(s.id, colorScheme);
      const total = progress?.topicsTotal ?? 0;
      const completed = progress?.topicsCompleted ?? 0;

      let hint = 'Open';
      if (resumeTarget?.subjectId === s.id && ['active_session', 'paused_session'].includes(resumeTarget.resumeKind)) {
        hint = `Continue ${resumeTarget.topicTitle ?? s.name}`;
      } else if (reviewSummary?.nextReviewTopic?.subjectId === s.id) {
        hint = `Quiz: ${reviewSummary.nextReviewTopic.topicTitle}`;
      } else if (completed > 0) {
        hint = `Practice: ${s.name}`;
      }

      return {
        subjectId: s.id,
        name: s.name,
        hint,
        progress: total > 0 ? completed / total : 0,
        tintSolid: tint.solid,
        tintSoft: tint.soft,
        icon: DEFAULT_SUBJECT_ICON,
      };
    });
}, [subjects, overallProgress, resumeTarget, reviewSummary, colorScheme]);
```

- [ ] **Step 5: Build the CoachBand headline**

Replace the old continue-card logic with a coach band data memo:

```ts
const coachBand = useMemo(() => {
  if (isParentProxy) return null;

  // Recovery marker takes precedence (already loaded into state by existing useEffect)
  if (recoveryMarker) {
    return {
      headline: `Pick up where you stopped in ${recoveryMarker.topicName ?? recoveryMarker.subjectName ?? 'your session'}.`,
      topicHighlight: recoveryMarker.topicName ?? recoveryMarker.subjectName,
      isQuizDriven: false,
      quizActivityType: undefined,
      onContinueRoute: {
        pathname: '/(app)/session' as const,
        params: {
          sessionId: recoveryMarker.sessionId,
          subjectId: recoveryMarker.subjectId,
          subjectName: recoveryMarker.subjectName,
          mode: recoveryMarker.mode,
          ...HOME_RETURN_PARAMS,
        },
      },
    };
  }

  // Resume target
  if (resumeTarget) {
    return {
      headline: `Pick up where you left off in ${resumeTarget.topicTitle ?? resumeTarget.subjectName}.`,
      topicHighlight: resumeTarget.topicTitle ?? resumeTarget.subjectName,
      isQuizDriven: false,
      quizActivityType: undefined,
      onContinueRoute: {
        pathname: '/(app)/session' as const,
        params: {
          sessionId: resumeTarget.sessionId ?? undefined,
          resumeFromSessionId: resumeTarget.resumeFromSessionId ?? undefined,
          subjectId: resumeTarget.subjectId,
          subjectName: resumeTarget.subjectName,
          topicId: resumeTarget.topicId ?? undefined,
          mode: 'learning',
          ...HOME_RETURN_PARAMS,
        },
      },
    };
  }

  // Overdue reviews
  if (reviewSummary?.totalOverdue && reviewSummary.totalOverdue > 0 && reviewSummary.nextReviewTopic) {
    const topic = reviewSummary.nextReviewTopic;
    return {
      headline: `Revisit ${topic.topicTitle} — it's starting to fade.`,
      topicHighlight: topic.topicTitle,
      isQuizDriven: false,
      quizActivityType: undefined,
      onContinueRoute: {
        pathname: '/(app)/session' as const,
        params: {
          subjectId: topic.subjectId,
          subjectName: topic.subjectName,
          topicId: topic.topicId,
          mode: 'review',
          ...HOME_RETURN_PARAMS,
        },
      },
    };
  }

  // Quiz discovery — lowest precedence, only when not dismissed
  if (quizDiscovery && dismissedQuizDiscoveryId !== quizDiscovery.id) {
    return {
      headline: `Try a quick quiz on ${quizDiscovery.topicTitle ?? quizDiscovery.subjectName}.`,
      topicHighlight: quizDiscovery.topicTitle ?? quizDiscovery.subjectName,
      isQuizDriven: true,
      quizActivityType: quizDiscovery.activityType,
      onContinueRoute: {
        pathname: '/(app)/session' as const,
        params: {
          subjectId: quizDiscovery.subjectId,
          subjectName: quizDiscovery.subjectName,
          topicId: quizDiscovery.topicId,
          mode: 'review',
          ...HOME_RETURN_PARAMS,
        },
      },
    };
  }

  return null;
}, [isParentProxy, recoveryMarker, resumeTarget, reviewSummary, quizDiscovery, dismissedQuizDiscoveryId]);
```

- [ ] **Step 6: Replace the render body**

Replace the `ScrollView` content (currently the `EarlyAdopterCard` + `IntentCard` list) with:

```tsx
<ScrollView
  className="flex-1"
  contentContainerStyle={{ paddingBottom: 16 }}
  showsVerticalScrollIndicator={false}
>
  {/* Coach Band — conditional (behind feature flag) */}
  {coachBand && !coachBandDismissedRef.current && (
    <CoachBand
      headline={coachBand.headline}
      topicHighlight={coachBand.topicHighlight}
      onContinue={() => {
        // clearSessionRecoveryMarker is already imported at line 30 of LearnerScreen.tsx
        if (recoveryMarker) clearSessionRecoveryMarker(activeProfile?.id);
        if (coachBand.isQuizDriven) markQuizDiscoverySurfaced.mutate(coachBand.quizActivityType!);
        router.push(coachBand.onContinueRoute as never);
      }}
      onDismiss={dismissCoachBand}
    />
  )}

  {/* Subject Carousel */}
  <View className="mt-1">
    <Text className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary px-5 mb-2.5">
      YOUR SUBJECTS
    </Text>
    <ScrollView
      testID="home-subject-carousel"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
    >
      {subjectCards.map((card) => (
        <SubjectCard
          key={card.subjectId}
          {...card}
          testID={`home-subject-card-${card.subjectId}`}
          onPress={() =>
            isParentProxy
              ? router.push({ pathname: '/(app)/shelf/[subjectId]', params: { subjectId: card.subjectId } } as never)
              : router.push({
                  pathname: '/(app)/session',
                  params: { subjectId: card.subjectId, subjectName: card.name, mode: 'learning', ...HOME_RETURN_PARAMS },
                } as never)
          }
        />
      ))}
      {/* + New subject tile */}
      {!isParentProxy && (
        <Pressable
          testID="home-add-subject-tile"
          onPress={() => router.push({ pathname: '/create-subject', params: HOME_RETURN_PARAMS } as never)}
          className="rounded-2xl border border-dashed border-border items-center justify-center"
          style={{
            width: subjectCards.length === 0 ? 280 : 96,
            height: 150,
            gap: 8,
          }}
        >
          <Text className="text-[20px] text-text-tertiary opacity-70">＋</Text>
          <Text className="text-xs font-bold text-text-tertiary">
            {subjectCards.length === 0 ? 'Add your first subject' : 'New subject'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  </View>

  {/* Ask Anything Composer — hidden for parent proxy */}
  {!isParentProxy && (
    <Pressable
      testID="home-ask-anything"
      onPress={() => router.push({ pathname: '/(app)/session', params: { mode: 'freeform', ...HOME_RETURN_PARAMS } } as never)}
      className="mx-5 mt-3 mb-1.5 rounded-2xl bg-surface border border-border pl-4 pr-1.5 py-2.5 flex-row items-center"
      style={{ gap: 8 }}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textTertiary} />
      <Text className="flex-1 text-[13px] text-text-tertiary">Ask anything…</Text>
      <View className="w-8 h-8 rounded-full bg-surface-elevated items-center justify-center">
        <Ionicons name="mic-outline" size={14} color={colors.textTertiary} />
      </View>
    </Pressable>
  )}

  {/* Three Action Buttons */}
  {!isParentProxy && (
    <View className="flex-row px-5 pt-1.5 pb-3" style={{ gap: 8 }}>
      {[
        { testID: 'home-action-study-new', icon: 'book-outline' as const, label: 'Study new', route: '/create-subject' },
        { testID: 'home-action-homework', icon: 'camera-outline' as const, label: 'Homework', route: '/(app)/homework/camera' },
        { testID: 'home-action-practice', icon: 'game-controller-outline' as const, label: 'Practice', route: '/(app)/practice' },
      ].map((action) => (
        <Pressable
          key={action.testID}
          testID={action.testID}
          onPress={() => router.push({ pathname: action.route, params: HOME_RETURN_PARAMS } as never)}
          className="flex-1 bg-surface border border-border rounded-[14px] py-3 items-center"
          style={{ gap: 4 }}
        >
          <Ionicons name={action.icon} size={20} color={colors.textSecondary} />
          <Text className="text-[11px] font-bold text-text-secondary">{action.label}</Text>
        </Pressable>
      ))}
    </View>
  )}

  {/* Parent proxy placeholder — keep existing */}
  {isParentProxy && (
    <View testID="intent-proxy-placeholder" className="px-5 mt-4">
      {/* Keep the existing "Sessions are private to {name}" content */}
    </View>
  )}
</ScrollView>
```

- [ ] **Step 7: Update the greeting row**

Replace the current greeting block with the compact version:

```tsx
<View className="flex-row items-center justify-between px-5 pt-1 pb-2">
  <View>
    <Text className="text-[22px] font-bold text-text-primary leading-tight">
      Hey {activeProfile?.displayName?.split(' ')[0] ?? 'there'}!
    </Text>
    <Text className="text-[13px] text-text-secondary mt-0.5">
      {greeting.subtitle}
    </Text>
  </View>
  <ProfileSwitcher
    profiles={profiles}
    activeProfileId={activeProfile?.id}
    onSwitch={switchProfile}
  />
</View>
```

**ProfileSwitcher does NOT accept `size` or `style` props** (verified: it only takes `profiles`, `activeProfileId`, `onSwitch`). Do NOT wrap it in a clipping `overflow-hidden` View — that will break its dropdown/modal trigger. Instead, add an optional `size?: number` prop to `ProfileSwitcher` in `apps/mobile/src/components/common/ProfileSwitcher.tsx` that controls the avatar dimensions, and an optional `ringColor?: string` prop for the border. Default to the current dimensions so existing callers are unaffected. Then pass `size={36} ringColor={colors.primary}` from the greeting row.

This is a small, isolated change to ProfileSwitcher — add it as a sub-step of this task.

- [ ] **Step 8: Add `coachBandDismissed` state (persisted via useRef)**

Plain `useState` resets on component remount — which happens every tab switch in Expo Router. This would make the dismiss button feel broken (user dismisses, switches tabs, comes back, band reappears). Use a `useRef` keyed to a session-scoped flag so the dismiss survives remounts but resets on app restart:

```ts
const coachBandDismissedRef = useRef(false);
const [, forceUpdate] = useState(0);

const dismissCoachBand = useCallback(() => {
  coachBandDismissedRef.current = true;
  forceUpdate((n) => n + 1);
}, []);
```

And update the CoachBand render condition:

```tsx
{coachBand && !coachBandDismissedRef.current && (
  <CoachBand
    ...
    onDismiss={dismissCoachBand}
  />
)}
```

The dismiss is session-scoped (resets on app restart) but survives tab switches — matching user expectations for an informational dismissal.

- [ ] **Step 9: Clean up unused imports**

Remove:
- `IntentCard` import (no longer used in LearnerScreen — keep the file, just don't import it here)
- `EarlyAdopterCard` import
- Any unused variables from the old `intentCards` memo

Keep:
- `useQuizDiscoveryCard` — quiz discovery is now the fourth coach band source (see Step 5). The `quizDiscovery` data and `dismissedQuizDiscoveryId` state both feed into the `coachBand` memo.
- `useMarkQuizDiscoverySurfaced` — called from the CoachBand's `onContinue` handler when `isQuizDriven` is true (see Step 6 render).

- [ ] **Step 10: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 11: Update LearnerScreen tests**

The existing tests assert `intent-*` testIDs. Update them to assert the new testIDs:

| Old testID | New testID | New location |
|---|---|---|
| `learner-intent-stack` | `home-subject-carousel` | Subject carousel |
| `intent-continue` | `home-coach-band-continue` | CoachBand continue button |
| `intent-learn` | `home-action-study-new` | Action grid |
| `intent-ask` | `home-ask-anything` | Ask-anything composer |
| `intent-practice` | `home-action-practice` | Action grid |
| `intent-homework` | `home-action-homework` | Action grid |
| `intent-quiz-discovery` | `home-coach-band` | CoachBand (when quiz-driven) |

Key test changes:
- `'shows the four always-visible intent cards in order when continue is hidden'` → rewrite to assert action grid + carousel presence
- `'filters session-starting intent cards in parent proxy mode'` → assert CoachBand hidden, ask-anything hidden, carousel read-only
- Navigation tests → update route assertions and trigger testIDs
- Continue card tests → rewrite as CoachBand tests (recovery marker → band headline, resume target → band headline)
- Quiz discovery tests → rewrite as CoachBand + markQuizDiscoverySurfaced

The mock routes (`/subjects`, `/progress/resume-target`, `/progress/review-summary`) stay the same. Add a mock for `/progress/overview`:

```ts
mockFetch.setRoute('/progress/overview', () => ({
  subjects: [
    { subjectId: 'sub-1', name: 'Algebra', topicsTotal: 10, topicsCompleted: 5, topicsVerified: 3, urgencyScore: 0, retentionStatus: 'strong', lastSessionAt: null },
  ],
  totalTopicsCompleted: 5,
  totalTopicsVerified: 3,
}));
```

- [ ] **Step 12: Run tests**

Run: `cd apps/mobile && pnpm exec jest src/components/home/LearnerScreen.test.tsx --no-coverage`
Expected: PASS — all tests green with updated assertions.

- [ ] **Step 13: Run lint**

Run: `pnpm exec nx lint mobile`
Expected: No errors.

- [ ] **Step 14: Commit Task 4a**

Message: `feat(mobile): restructure LearnerScreen with carousel, ask-anything, and action grid`

---

## Task 4b: Add CoachBand to LearnerScreen (behind feature flag)

This task adds the conditional coach band to the Home screen. It builds on Task 4a's carousel layout. Shipped behind a feature flag so the band's precedence logic can be tuned with real telemetry without reverting the entire carousel.

**Files:**
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.test.tsx`
- Create: `apps/mobile/src/lib/feature-flags.ts` (if not already present)

**Prerequisites:** Tasks 3 (CoachBand component) and 4a must be complete.

### Implementation steps

- [ ] **Step 1: Add feature flag**

Create or extend `apps/mobile/src/lib/feature-flags.ts`:

```ts
export const FEATURE_FLAGS = {
  COACH_BAND_ENABLED: true, // flip to false to disable without deploy
} as const;
```

- [ ] **Step 2: Add CoachBand data memo**

Move the `coachBand` memo from Task 4a Step 5 into `LearnerScreen.tsx`. This includes the four-source precedence chain: `recoveryMarker > resumeTarget > reviewSummary.totalOverdue > quizDiscovery`.

Wire the `isQuizDriven` flag and `quizActivityType` on each return branch so the `onContinue` handler knows when to call `markQuizDiscoverySurfaced`.

- [ ] **Step 3: Add dismiss state**

Use the `useRef`-based dismiss pattern (see Task 4a Step 8 above — `coachBandDismissedRef` + `forceUpdate`).

- [ ] **Step 4: Render CoachBand conditionally**

Insert the CoachBand above the subject carousel in the ScrollView, gated by `FEATURE_FLAGS.COACH_BAND_ENABLED`:

```tsx
{FEATURE_FLAGS.COACH_BAND_ENABLED && coachBand && !coachBandDismissedRef.current && (
  <CoachBand ... />
)}
```

- [ ] **Step 5: Update tests**

Add CoachBand-specific tests:
- Recovery marker → band renders with correct headline
- Resume target → band renders with correct headline
- Overdue review → band renders
- Quiz discovery → band renders, `markQuizDiscoverySurfaced` called on Continue
- `isParentProxy` → band hidden
- Cold start (no data) → band hidden
- Dismiss → band disappears and stays dismissed after re-render

- [ ] **Step 6: Run tests + typecheck + lint**

```bash
cd apps/mobile && pnpm exec jest src/components/home/LearnerScreen.test.tsx --no-coverage
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
```

- [ ] **Step 7: Commit Task 4b**

Message: `feat(mobile): add CoachBand to LearnerScreen behind feature flag`

---

## Task 5: Update E2E Maestro flows for new Home testIDs

**Files:**
- Modify: `apps/mobile/e2e/flows/learning/start-session.yaml`
- Modify: `apps/mobile/e2e/flows/learning/freeform-session.yaml`
- Modify: `apps/mobile/e2e/flows/learning/core-learning.yaml`
- Modify: `apps/mobile/e2e/flows/learning/first-session.yaml`
- Modify: `apps/mobile/e2e/flows/learning/voice-mode-controls.yaml`
- Modify: `apps/mobile/e2e/flows/homework/homework-from-entry-card.yaml`
- Modify: `apps/mobile/e2e/flows/edge/empty-first-user.yaml`

- [ ] **Step 1: Map old → new testIDs**

| Old Maestro target | New Maestro target | Notes |
|---|---|---|
| `id: "intent-continue"` | `id: "home-coach-band-continue"` | Coach band's continue button |
| `id: "intent-homework"` | `id: "home-action-homework"` | Action grid homework tile |
| `id: "intent-learn"` | `id: "home-action-study-new"` or `id: "home-add-subject-tile"` | Depends on context: empty state uses add-subject tile |
| `id: "learner-intent-stack"` | `id: "home-subject-carousel"` | Carousel replaces the intent stack |
| `id: "learner-screen"` | `id: "learner-screen"` | **Keep — do not change** (used as the home-loaded sentinel) |

- [ ] **Step 2: Update each flow file**

For each file, replace the old `tapOn` / `extendedWaitUntil` targets with the new testIDs. The `learner-screen` sentinel stays the same.

**Critical — `intent-continue` → what?** The coach band only renders when there's a recovery marker, resume target, or overdue reviews. Flows that used to tap `intent-continue` need case-by-case resolution:

| Flow file | Seed state | Old target | New target | Rationale |
|---|---|---|---|---|
| `start-session.yaml` | Existing subject with prior session → resume target exists | `intent-continue` | `home-coach-band-continue` | Band renders because seed creates a resume target |
| `core-learning.yaml` | Existing subject with prior session | `intent-continue` | `home-coach-band-continue` | Same as above |
| `first-session.yaml` | Fresh user, one subject, no prior sessions | `intent-learn` | `home-subject-card-{id}` | No resume target → no band. Tap the subject card directly |
| `freeform-session.yaml` | Any state | `intent-ask` | `home-ask-anything` | Direct mapping |
| `empty-first-user.yaml` | No subjects at all | `intent-learn` | `home-add-subject-tile` | Empty state: only the + tile is visible |

**Before updating each flow:** Read the seed fixture to confirm the state described above. If the seed doesn't create the expected state, the flow will break — fix the seed or adjust the target.

- [ ] **Step 3: Run E2E smoke test (if emulator available)**

Run: per the `/e2e` skill or `pnpm run e2e:android` if configured.
If no emulator available, flag for manual verification.

- [ ] **Step 4: Commit**

Message: `fix(e2e): update Maestro flows for new Home screen testIDs`

---

## Task 6: Session — escalation rung strip + memory chip

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx`
- Modify: `apps/mobile/src/components/session/ChatShell.test.tsx`

- [ ] **Step 1: Add new props to `ChatShellProps`**

```ts
// Add to the ChatShellProps interface:
pedagogicalState?: {
  rung: 1 | 2 | 3 | 4 | 5;
  phase: string;
  exchangesUsed: number;
  exchangesMax: number;
};
memoryHint?: string;
```

- [ ] **Step 2: Write failing tests for the rung strip**

```tsx
// Add to ChatShell.test.tsx

describe('escalation rung strip', () => {
  it('renders the rung strip when pedagogicalState is provided', () => {
    const { getByTestId, getByText } = render(
      <ChatShell
        {...defaultProps}
        pedagogicalState={{ rung: 2, phase: 'BUILDING', exchangesUsed: 2, exchangesMax: 4 }}
      />,
    );
    expect(getByTestId('escalation-rung-strip')).toBeTruthy();
    expect(getByText(/RUNG 2/)).toBeTruthy();
    expect(getByText(/BUILDING/)).toBeTruthy();
    expect(getByText(/2 of 4/)).toBeTruthy();
  });

  it('falls back to subtitle when pedagogicalState is absent', () => {
    const { queryByTestId, getByText } = render(
      <ChatShell {...defaultProps} subtitle="I'm here to help" />,
    );
    expect(queryByTestId('escalation-rung-strip')).toBeNull();
    expect(getByText("I'm here to help")).toBeTruthy();
  });
});
```

- [ ] **Step 3: Write failing tests for memory chip**

```tsx
describe('memory chip', () => {
  it('renders the memory chip when memoryHint is provided', () => {
    const { getByTestId, getByText } = render(
      <ChatShell
        {...defaultProps}
        memoryHint="Last week you mixed up the sign — I'll watch for that."
      />,
    );
    expect(getByTestId('chat-memory-hint')).toBeTruthy();
    expect(getByText(/mixed up the sign/)).toBeTruthy();
  });

  it('does not render memory chip when memoryHint is absent', () => {
    const { queryByTestId } = render(<ChatShell {...defaultProps} />);
    expect(queryByTestId('chat-memory-hint')).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/session/ChatShell.test.tsx --no-coverage -t "escalation rung|memory chip"`
Expected: FAIL — testIDs not found.

- [ ] **Step 5: Implement the rung strip in the header**

In `ChatShell.tsx`, find the header subtitle area (currently renders `subtitle` prop). Replace with:

```tsx
{pedagogicalState ? (
  <View testID="escalation-rung-strip" className="flex-row items-center gap-1.5 mt-1">
    <Text
      className="text-[10px] text-text-tertiary tracking-wide"
      style={{ fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) }}
    >
      RUNG {pedagogicalState.rung} · {pedagogicalState.phase}
    </Text>
    <View className="w-[3px] h-[3px] rounded-full bg-text-tertiary" />
    <Text className="text-[10px] text-text-tertiary tracking-wide">
      {pedagogicalState.exchangesUsed} of {pedagogicalState.exchangesMax} exchanges
    </Text>
  </View>
) : subtitle ? (
  <Text className="text-xs text-text-secondary">{subtitle}</Text>
) : null}
```

- [ ] **Step 6: Implement the memory chip below header**

Below the header View and above the FlatList, add:

```tsx
{memoryHint ? (
  <View
    testID="chat-memory-hint"
    className="bg-surface rounded-xl px-3 py-2 mx-4 mb-2 flex-row items-center"
    style={{ gap: 8 }}
  >
    <View className="w-1.5 h-1.5 rounded-full bg-accent" />
    <Text className="text-xs text-text-secondary flex-1">{memoryHint}</Text>
  </View>
) : null}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/session/ChatShell.test.tsx --no-coverage -t "escalation rung|memory chip"`
Expected: PASS.

- [ ] **Step 8: Run full ChatShell test suite**

Run: `cd apps/mobile && pnpm exec jest src/components/session/ChatShell.test.tsx --no-coverage`
Expected: PASS — no regressions.

- [ ] **Step 9: Commit**

Message: `feat(mobile): add escalation rung strip and memory chip to ChatShell`

---

## Task 7: MessageBubble — restyle verification badge

**Files:**
- Modify: `apps/mobile/src/components/session/MessageBubble.tsx`
- Modify: `apps/mobile/src/components/session/MessageBubble.test.tsx`

- [ ] **Step 1: Write failing test for new badge style**

```tsx
// Add to MessageBubble.test.tsx

describe('verification badge styling', () => {
  it('renders evaluate badge as inline text below the bubble', () => {
    const { getByText } = render(
      <MessageBubble role="assistant" content="Good work!" verificationBadge="evaluate" />,
    );
    expect(getByText('✓ THINK-DEEPER CLEARED')).toBeTruthy();
  });

  it('renders teach_back badge as inline text below the bubble', () => {
    const { getByText } = render(
      <MessageBubble role="assistant" content="Good work!" verificationBadge="teach_back" />,
    );
    expect(getByText('✓ TEACH-BACK CLEARED')).toBeTruthy();
  });

  it('does not render badge for user messages', () => {
    const { queryByText } = render(
      <MessageBubble role="user" content="My answer" verificationBadge="evaluate" />,
    );
    expect(queryByText(/CLEARED/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && pnpm exec jest src/components/session/MessageBubble.test.tsx --no-coverage -t "verification badge"`
Expected: FAIL — old badge labels don't match new labels.

- [ ] **Step 3: Update badge config and rendering**

Update the `VERIFICATION_BADGE_CONFIG` in `MessageBubble.tsx`:

```ts
const VERIFICATION_BADGE_CONFIG: Record<
  VerificationBadge,
  { label: string }
> = {
  evaluate:   { label: 'THINK-DEEPER CLEARED' },
  teach_back: { label: 'TEACH-BACK CLEARED' },
};
```

Move the badge rendering from **above** the bubble content to **below** the bubble. Change from a pill to inline text:

```tsx
{/* After the bubble View, still inside the outer wrapper */}
{isAI && verificationBadge && VERIFICATION_BADGE_CONFIG[verificationBadge] && (
  <Text className="text-[10px] font-bold uppercase tracking-wide text-success mt-1 ml-1">
    ✓ {VERIFICATION_BADGE_CONFIG[verificationBadge].label}
  </Text>
)}
```

Remove the old pill-style `View` wrapper with `bgClass` / `textClass`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && pnpm exec jest src/components/session/MessageBubble.test.tsx --no-coverage`
Expected: PASS — all tests including existing envelope-leak regression tests.

- [ ] **Step 5: Commit**

Message: `feat(mobile): restyle verification badge as inline text below AI bubbles`

---

## Task 8: Composer — mic-in-pill + remove toggle row (behind feature flag)

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx`
- Modify: `apps/mobile/src/components/session/ChatShell.test.tsx`
- Modify: `apps/mobile/src/lib/feature-flags.ts`

**This is the highest-risk task.** Read the BUG-886 `isFocused` guards, voice state machinery, and `VoiceTranscriptPreview` discard/re-record flow before starting. Preserve all of them.

**Feature flag:** Add `MIC_IN_PILL_ENABLED: true` to `feature-flags.ts`. When false, preserve the current composer layout (toggle row + separate voice button). This allows reverting the composer without a code deploy if the new interaction model causes confusion.

- [ ] **Step 1: Change `hideInputModeToggle` default to `true`**

In `ChatShellProps` destructuring, change:

```ts
// Before:
hideInputModeToggle = false,

// After:
hideInputModeToggle = true,
```

This immediately hides the Text/Voice toggle row for all consumers. The onboarding interview screen passes `hideInputModeToggle={!sessionPhase}` — it will keep working (it now opts in to show the toggle when session phase is active, which is the opposite of before, so check this: the onboarding screen currently passes `hideInputModeToggle={!sessionPhase}`, meaning hide when no session phase. With default=true, the behavior is the same — the prop is still explicitly set).

Wait — verify: the onboarding screen passes `hideInputModeToggle={!sessionPhase}`. When `sessionPhase` is falsy, `!sessionPhase` is `true`, so `hideInputModeToggle=true` → toggle hidden. When `sessionPhase` is truthy, `hideInputModeToggle=false` → toggle shown. This is the CURRENT behavior. Changing the default doesn't affect explicit callers. Confirmed safe.

- [ ] **Step 2: Write failing test for mic-in-pill**

```tsx
describe('composer mic-in-pill', () => {
  it('renders mic button inside the input row', () => {
    const { getByTestId } = render(<ChatShell {...defaultProps} />);
    const inputRow = getByTestId('chat-input-row');
    // mic button should be a child of the input row
    expect(inputRow).toBeTruthy();
    // The voice record button should be findable inside the input row
    // (it was previously only visible when voice mode was on;
    //  now it's always visible as a mic-in-pill)
  });

  it('does not render the input-mode-toggle by default', () => {
    const { queryByTestId } = render(<ChatShell {...defaultProps} />);
    expect(queryByTestId('input-mode-toggle')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify the toggle default change works**

Run: `cd apps/mobile && pnpm exec jest src/components/session/ChatShell.test.tsx --no-coverage -t "composer mic-in-pill"`
Expected: The `input-mode-toggle` test should pass (toggle now hidden by default). The mic-in-pill test may still fail if we haven't moved the button yet.

- [ ] **Step 4: Restructure the composer layout**

The current composer has:
1. Input mode toggle (pill bar) — being removed by default
2. TextInput row with send button
3. Voice record button (only when voice enabled)

New layout:
1. Single row: `[ TextInput (flex-1) | mic button (36×36) | send button (36×36) ]`

In `ChatShell.tsx`, find the composer section. Restructure:

```tsx
<View
  testID="chat-input-row"
  className="bg-surface rounded-3xl px-4 py-1.5 border border-border flex-row items-center"
  style={{ gap: 8, minHeight: 48 }}
>
  <TextInput
    testID="chat-input"
    className="flex-1 text-sm text-text-primary"
    placeholder={placeholder}
    placeholderTextColor={colors.textTertiary}
    value={draft}
    onChangeText={handleDraftChange}
    onSubmitEditing={handleSubmit}
    multiline
    editable={!inputDisabled}
    {...existingAccessibilityProps}
  />
  {/* Mic button — always visible, triggers voice recording */}
  <Pressable
    testID="voice-record-button"
    onPress={handleMicPress}
    onLongPress={handleMicLongPress}
    className="w-9 h-9 rounded-full bg-surface-elevated items-center justify-center"
    accessibilityLabel="Record voice message"
    accessibilityRole="button"
  >
    <Ionicons
      name={isListening ? 'mic' : 'mic-outline'}
      size={18}
      color={isListening ? colors.primary : colors.textTertiary}
    />
  </Pressable>
  {/* Send button */}
  <Pressable
    testID="send-button"
    onPress={handleSubmit}
    disabled={!draft.trim() && !isListening}
    className={`w-9 h-9 rounded-full items-center justify-center ${
      draft.trim() ? 'bg-primary' : 'bg-surface-elevated'
    }`}
    accessibilityLabel="Send message"
    accessibilityRole="button"
  >
    <Ionicons
      name="send"
      size={16}
      color={draft.trim() ? colors.textInverse : colors.textTertiary}
    />
  </Pressable>
</View>
```

**Critical preservations:**
- Keep all `isFocused` checks from BUG-886
- Keep `pointerEvents` / `aria-hidden` / `tabIndex` treatments
- Keep `keyboardShouldPersistTaps` on parent ScrollView
- Keep `KeyboardAvoidingView` wrapper
- Keep `paddingBottom: Math.max(insets.bottom, 8)`
- Keep `VoicePlaybackBar` rendering (above the composer, when voice active)
- Keep `VoiceTranscriptPreview` rendering (replaces the input when transcript is pending)

**Voice interaction model — explicit handler mapping:**

The codebase currently has these voice handlers (verified):
- `handleVoicePress` (line 425) — toggles recording on/off (push-to-talk)
- `handleVoiceSend` (line 475) — sends the pending transcript
- `handleVoiceDiscard` (line 492) — discards pending transcript
- `handleVoiceReRecord` (line 498) — re-records after discard

New gesture → existing handler mapping:

| Gesture | New handler | Implementation |
|---|---|---|
| Short tap on mic | `handleMicPress` | Delegates to existing `handleVoicePress` — starts/stops push-to-talk recording |
| Long press on mic | `handleMicLongPress` | Sets `setIsVoiceEnabled(true)` then calls `handleVoicePress()` — enters dedicated voice mode |

```ts
const handleMicPress = useCallback(() => {
  handleVoicePress();
}, [handleVoicePress]);

const handleMicLongPress = useCallback(() => {
  setIsVoiceEnabled(true);
  handleVoicePress();
}, [handleVoicePress]);
```

**State machine impact:** When `isVoiceEnabled` is false (default), a short tap starts a one-shot recording. The transcript flows through `VoiceTranscriptPreview` (send/discard/re-record) exactly as before. When `isVoiceEnabled` is true (after long press), the full voice mode UI activates — `VoicePlaybackBar` appears, TTS reads responses, and the mic auto-listens for the next turn. **No state machine changes needed** — only the trigger path changes.

**Handlers to preserve unchanged:** `handleVoiceSend`, `handleVoiceDiscard`, `handleVoiceReRecord` — these are called by `VoiceTranscriptPreview` which remains above the composer. Do not modify them.

The header-level `VoiceToggle` stays as the explicit "switch to dedicated voice mode for this whole session" affordance.

- [ ] **Step 5: Update existing ChatShell tests**

Several existing tests assert `input-mode-toggle` visibility. Update:
- Tests that check `input-mode-toggle` is visible → update to check it's hidden by default
- Tests that check voice UI visibility → update for mic-in-pill (mic button always visible in input row)
- Keep all BUG-886 stale-instance tests exactly as-is

Key test updates:
- `'hides input mode toggle when hideInputModeToggle is true'` → flip: now test that toggle is hidden by default, shown when `hideInputModeToggle={false}`
- Voice recording tests → the record button is now always in the input row, not conditional on voice mode

- [ ] **Step 6: Run full ChatShell test suite**

Run: `cd apps/mobile && pnpm exec jest src/components/session/ChatShell.test.tsx --no-coverage`
Expected: PASS — all tests green.

- [ ] **Step 7: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Run lint**

Run: `pnpm exec nx lint mobile`
Expected: No errors.

- [ ] **Step 9: Commit**

Message: `feat(mobile): move mic into composer pill, default hideInputModeToggle to true`

---

## Verification Checklist

After all tasks are complete, run the full validation suite:

- [ ] `cd apps/mobile && pnpm exec tsc --noEmit` — typecheck
- [ ] `pnpm exec nx lint mobile` — lint
- [ ] `cd apps/mobile && pnpm exec jest --no-coverage` — all mobile tests
- [ ] `pnpm exec nx run api:typecheck` — API typecheck (unchanged, but verify no schema drift)
- [ ] Manual: open the app on web (`pnpm start:web`) and verify:
  - Home screen renders with carousel + actions (learner profile)
  - Home screen hides coach band on cold start (no subjects)
  - Home screen shows coach band when resume target exists
  - Parent proxy hides coach band + ask-anything
  - Session screen shows rung strip when pedagogicalState is passed
  - Session screen shows memory chip
  - Composer mic button is inside the input pill
  - Voice recording still works (short tap, long press)
  - Voice transcript preview (discard/re-record) still works
  - `VoicePlaybackBar` still appears during TTS playback
  - Send button activates when text is entered
- [ ] E2E: run Maestro flows if emulator available

---

## What's NOT in this plan

- **Parent Dashboard redesign** (Screen 3) — deferred per user request.
- **Direction B** (opinionated coach hero) — explicitly NOT to be built (design reference only).
- **EarlyAdopterCard relocation** — removed from Home render but file kept. Final location TBD with product.
- **Subject icon per-name heuristic** — all subjects use `book-outline` for now. A keyword-based icon mapping (or user-chosen icon stored in DB) is a follow-up task.
- **New API endpoints** — none needed. All data comes from existing hooks.

## Rollback strategy

- **Task 4a (carousel + actions):** Revert the single commit. IntentCard stack is preserved in the file.
- **Task 4b (coach band):** Flip `FEATURE_FLAGS.COACH_BAND_ENABLED` to `false`. No deploy needed if the flag is already in production.
- **Task 8 (composer mic-in-pill):** Flip `FEATURE_FLAGS.MIC_IN_PILL_ENABLED` to `false`. Falls back to current toggle-row layout.
- **Tasks 6–7 (session header, badge restyle):** These are additive opt-in props — revert is simply not passing the prop from the session controller.
