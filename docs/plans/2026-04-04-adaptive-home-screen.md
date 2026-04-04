# Adaptive Home Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 883-line monolithic `home.tsx` with a state-driven intent router that adapts to whether the user has linked children, offering 2-tap depth to any activity.

**Architecture:** Three-screen decomposition — `home.tsx` becomes a thin intent router (~80 lines) that renders either `<ParentGateway />` (for profiles with linked children) or `<LearnerScreen />` (for solo learners) inline. A shared `<LearnerScreen />` component is reused in both `home.tsx` and the `/learn` stack route. A new `learn-new.tsx` route handles the "what kind of learning?" fork. Linked-children detection uses existing profile data (`useProfile()`) — no new API endpoint needed.

**Tech Stack:** Expo Router (file-based), React Native + NativeWind, TanStack Query, `@testing-library/react-native`, Jest

**Design spec:** `docs/superpowers/specs/2026-04-04-adaptive-home-screen-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/mobile/src/lib/greeting.ts` | `getGreeting(name, now?)` — time-of-day + day-of-week greeting utility |
| `apps/mobile/src/lib/greeting.test.ts` | Tests for all time/day combinations |
| `apps/mobile/src/components/home/IntentCard.tsx` | Simple full-card-pressable card (title + optional subtitle) |
| `apps/mobile/src/components/home/IntentCard.test.tsx` | Render + press tests |
| `apps/mobile/src/components/home/ParentGateway.tsx` | Parent intent screen (greeting + 2 cards + child activity highlight) |
| `apps/mobile/src/components/home/ParentGateway.test.tsx` | Navigation + rendering tests |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Universal learner screen (greeting + 2-3 cards based on library state) |
| `apps/mobile/src/components/home/LearnerScreen.test.tsx` | Card visibility + navigation tests |
| `apps/mobile/src/components/home/index.ts` | Barrel export |
| `apps/mobile/src/app/(learner)/learn.tsx` | Route wrapper — renders `<LearnerScreen onBack />` for parent stack nav |
| `apps/mobile/src/app/(learner)/learn-new.tsx` | "What kind of learning?" fork with session recovery |
| `apps/mobile/src/app/(learner)/learn-new.test.tsx` | Navigation + recovery marker tests |

### Modified files

| File | Change |
|------|--------|
| `apps/mobile/src/app/(learner)/home.tsx` | **Full rewrite** — 883 lines → ~80 lines. Intent router only. |
| `apps/mobile/src/app/(learner)/home.test.tsx` | **Full rewrite** — tests for gateway vs learner routing. |
| `apps/mobile/src/app/(learner)/_layout.tsx` | Add two hidden `Tabs.Screen` entries (`learn`, `learn-new`). |

### Key design decisions

1. **Linked-children detection** uses `useProfile()` data already in memory — `activeProfile.isOwner && profiles.some(p => !p.isOwner && p.id !== activeProfile.id)`. No new API endpoint needed.
2. **`LearnerScreen` takes `onBack?: () => void`** — when provided, renders a back arrow. This lets `home.tsx` render it without a back button (root tab) while `learn.tsx` renders it with one (stack push).
3. **`IntentCard` is a new component** (not `HomeActionCard`). `HomeActionCard` has dismiss/badge/primary-button semantics for server-ranked coaching cards. `IntentCard` is a simple full-card-pressable element — different interaction pattern.
4. **Celebrations stay in `home.tsx`** — the overlay wraps whichever screen is rendered, same as today.
5. **Old `home.tsx` code is replaced, not commented out** — this is a deliberate architectural redesign with the old code in git history. All features are redistributed to new components.

---

## Task 1: `getGreeting()` utility

**Files:**
- Create: `apps/mobile/src/lib/greeting.ts`
- Create: `apps/mobile/src/lib/greeting.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/lib/greeting.test.ts`:

```typescript
import { getGreeting } from './greeting';

describe('getGreeting', () => {
  describe('time-of-day titles', () => {
    it('returns morning greeting at 8am', () => {
      const now = new Date('2026-04-07T08:00:00'); // Tuesday
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Good morning, Alex!',
        subtitle: 'Fresh mind, fresh start',
      });
    });

    it('returns afternoon greeting at 14:00', () => {
      const now = new Date('2026-04-08T14:00:00'); // Wednesday
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Good afternoon, Alex!',
        subtitle: "Let's keep going",
      });
    });

    it('returns evening greeting at 19:00', () => {
      const now = new Date('2026-04-08T19:00:00'); // Wednesday
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Good evening, Alex!',
        subtitle: 'Winding down or powering through?',
      });
    });

    it('returns night greeting at 23:00', () => {
      const now = new Date('2026-04-08T23:00:00'); // Wednesday
      expect(getGreeting('Alex', now)).toEqual({
        title: 'Hey, Alex!',
        subtitle: 'Burning the midnight oil?',
      });
    });
  });

  describe('boundary cases', () => {
    it('treats 4:59 as night', () => {
      const now = new Date('2026-04-08T04:59:00'); // Wednesday
      expect(getGreeting('Alex', now).title).toBe('Hey, Alex!');
    });

    it('treats 5:00 as morning', () => {
      const now = new Date('2026-04-08T05:00:00'); // Wednesday
      expect(getGreeting('Alex', now).title).toBe('Good morning, Alex!');
    });

    it('treats 11:59 as morning', () => {
      const now = new Date('2026-04-08T11:59:00');
      expect(getGreeting('Alex', now).title).toBe('Good morning, Alex!');
    });

    it('treats 12:00 as afternoon', () => {
      const now = new Date('2026-04-08T12:00:00');
      expect(getGreeting('Alex', now).title).toBe('Good afternoon, Alex!');
    });

    it('treats 16:59 as afternoon', () => {
      const now = new Date('2026-04-08T16:59:00');
      expect(getGreeting('Alex', now).title).toBe('Good afternoon, Alex!');
    });

    it('treats 17:00 as evening', () => {
      const now = new Date('2026-04-08T17:00:00');
      expect(getGreeting('Alex', now).title).toBe('Good evening, Alex!');
    });

    it('treats 20:59 as evening', () => {
      const now = new Date('2026-04-08T20:59:00');
      expect(getGreeting('Alex', now).title).toBe('Good evening, Alex!');
    });

    it('treats 21:00 as night', () => {
      const now = new Date('2026-04-08T21:00:00');
      expect(getGreeting('Alex', now).title).toBe('Hey, Alex!');
    });
  });

  describe('day-of-week subtitle overrides', () => {
    it('returns Monday override', () => {
      const now = new Date('2026-04-06T09:00:00'); // Monday
      expect(getGreeting('Alex', now).subtitle).toBe('Fresh week ahead!');
    });

    it('returns Friday override', () => {
      const now = new Date('2026-04-10T15:00:00'); // Friday
      expect(getGreeting('Alex', now).subtitle).toBe('Happy Friday!');
    });

    it('returns weekend override for Saturday', () => {
      const now = new Date('2026-04-11T10:00:00'); // Saturday
      expect(getGreeting('Alex', now).subtitle).toBe('Weekend learning? Nice!');
    });

    it('returns weekend override for Sunday', () => {
      const now = new Date('2026-04-12T22:00:00'); // Sunday
      expect(getGreeting('Alex', now).subtitle).toBe('Weekend learning? Nice!');
    });
  });

  it('uses current time when no date provided', () => {
    const result = getGreeting('Alex');
    expect(result.title).toContain('Alex');
    expect(result.subtitle).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/lib/greeting.test.ts --no-coverage`
Expected: FAIL — `Cannot find module './greeting'`

- [ ] **Step 3: Implement `getGreeting`**

Create `apps/mobile/src/lib/greeting.ts`:

```typescript
interface Greeting {
  title: string;
  subtitle: string;
}

export function getGreeting(name: string, now: Date = new Date()): Greeting {
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  let title: string;
  if (hour >= 5 && hour < 12) {
    title = `Good morning, ${name}!`;
  } else if (hour >= 12 && hour < 17) {
    title = `Good afternoon, ${name}!`;
  } else if (hour >= 17 && hour < 21) {
    title = `Good evening, ${name}!`;
  } else {
    title = `Hey, ${name}!`;
  }

  // Day-of-week overrides replace default subtitle
  if (day === 1) return { title, subtitle: 'Fresh week ahead!' };
  if (day === 5) return { title, subtitle: 'Happy Friday!' };
  if (day === 0 || day === 6) {
    return { title, subtitle: 'Weekend learning? Nice!' };
  }

  let subtitle: string;
  if (hour >= 5 && hour < 12) {
    subtitle = 'Fresh mind, fresh start';
  } else if (hour >= 12 && hour < 17) {
    subtitle = "Let's keep going";
  } else if (hour >= 17 && hour < 21) {
    subtitle = 'Winding down or powering through?';
  } else {
    subtitle = 'Burning the midnight oil?';
  }

  return { title, subtitle };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/lib/greeting.test.ts --no-coverage`
Expected: All 14 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/lib/greeting.ts apps/mobile/src/lib/greeting.test.ts
git commit -m "feat(home): add time-aware getGreeting utility

TDD — pure function with time-of-day greetings and day-of-week
subtitle overrides. Used by both ParentGateway and LearnerScreen."
```

---

## Task 2: `IntentCard` component

**Files:**
- Create: `apps/mobile/src/components/home/IntentCard.tsx`
- Create: `apps/mobile/src/components/home/IntentCard.test.tsx`
- Create: `apps/mobile/src/components/home/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/home/IntentCard.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { IntentCard } from './IntentCard';

describe('IntentCard', () => {
  it('renders title and fires onPress', () => {
    const onPress = jest.fn();
    render(
      <IntentCard title="Learn something" onPress={onPress} testID="card" />
    );

    expect(screen.getByText('Learn something')).toBeTruthy();
    fireEvent.press(screen.getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders subtitle when provided', () => {
    render(
      <IntentCard
        title="Help with assignment?"
        subtitle="Take a picture and we'll look at it together"
        onPress={jest.fn()}
      />
    );
    expect(
      screen.getByText("Take a picture and we'll look at it together")
    ).toBeTruthy();
  });

  it('does not render subtitle element when omitted', () => {
    const { toJSON } = render(
      <IntentCard title="Learn" onPress={jest.fn()} testID="card" />
    );
    // Only the title Text element should exist inside the Pressable
    const tree = toJSON();
    expect(tree).not.toBeNull();
    expect(screen.queryByText("Take a picture")).toBeNull();
  });

  it('sets accessibility role and label', () => {
    render(
      <IntentCard title="Pick a subject" onPress={jest.fn()} testID="card" />
    );
    const card = screen.getByTestId('card');
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityLabel).toBe('Pick a subject');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/home/IntentCard.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './IntentCard'`

- [ ] **Step 3: Implement `IntentCard`**

Create `apps/mobile/src/components/home/IntentCard.tsx`:

```typescript
import { Pressable, Text } from 'react-native';

interface IntentCardProps {
  title: string;
  subtitle?: string;
  onPress: () => void;
  testID?: string;
}

export function IntentCard({
  title,
  subtitle,
  onPress,
  testID,
}: IntentCardProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      className="bg-surface-elevated rounded-card px-5 py-5 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={title}
      testID={testID}
    >
      <Text className="text-h2 font-bold text-text-primary">{title}</Text>
      {subtitle ? (
        <Text className="text-body text-text-secondary mt-2">{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}
```

- [ ] **Step 4: Create barrel export**

Create `apps/mobile/src/components/home/index.ts`:

```typescript
export { IntentCard } from './IntentCard';
```

> This barrel will be extended in later tasks as `ParentGateway` and `LearnerScreen` are added.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/home/IntentCard.test.tsx --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/home/IntentCard.tsx \
       apps/mobile/src/components/home/IntentCard.test.tsx \
       apps/mobile/src/components/home/index.ts
git commit -m "feat(home): add IntentCard component

Simple full-card-pressable element for the new intent-based home
screens. Title + optional subtitle, whole card is the tap target."
```

---

## Task 3: `ParentGateway` component

**Files:**
- Create: `apps/mobile/src/components/home/ParentGateway.tsx`
- Create: `apps/mobile/src/components/home/ParentGateway.test.tsx`
- Modify: `apps/mobile/src/components/home/index.ts`

**Dependencies:** Task 1 (`getGreeting`), Task 2 (`IntentCard`)

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/home/ParentGateway.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../common', () => ({
  ProfileSwitcher: () => null,
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ],
    activeProfile: { id: 'p1', displayName: 'Maria', isOwner: true },
    switchProfile: jest.fn(),
  }),
}));

let mockDashboardData: {
  children: Array<{
    displayName: string;
    totalTimeThisWeek: number;
    profileId: string;
  }>;
} | undefined;

jest.mock('../../hooks/use-dashboard', () => ({
  useDashboard: () => ({ data: mockDashboardData }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

const { ParentGateway } = require('./ParentGateway');

describe('ParentGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 720, profileId: 'c1' },
      ],
    };
  });

  it('renders greeting with active profile name', () => {
    render(<ParentGateway />);
    expect(screen.getByText('Good morning, Maria!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  it('renders both intent cards', () => {
    render(<ParentGateway />);
    expect(screen.getByText("Check child's progress")).toBeTruthy();
    expect(screen.getByText('Learn something')).toBeTruthy();
  });

  it('shows child activity highlight with time', () => {
    render(<ParentGateway />);
    // 720 seconds = 12 minutes
    expect(screen.getByText('Emma practiced 12 min this week')).toBeTruthy();
  });

  it('shows fallback highlight when no activity', () => {
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 0, profileId: 'c1' },
      ],
    };
    render(<ParentGateway />);
    expect(screen.getByText('No activity today')).toBeTruthy();
  });

  it('shows fallback highlight when dashboard not loaded', () => {
    mockDashboardData = undefined;
    render(<ParentGateway />);
    expect(screen.getByText("See how they're doing")).toBeTruthy();
  });

  it('picks most active child for highlight', () => {
    mockDashboardData = {
      children: [
        { displayName: 'Emma', totalTimeThisWeek: 300, profileId: 'c1' },
        { displayName: 'Tomáš', totalTimeThisWeek: 900, profileId: 'c2' },
      ],
    };
    render(<ParentGateway />);
    // 900 seconds = 15 minutes — Tomáš is more active
    expect(screen.getByText('Tomáš practiced 15 min this week')).toBeTruthy();
  });

  it('navigates to parent dashboard on "Check child\'s progress"', () => {
    render(<ParentGateway />);
    fireEvent.press(screen.getByTestId('gateway-check-progress'));
    expect(mockPush).toHaveBeenCalledWith('/(parent)/dashboard');
  });

  it('navigates to learn route on "Learn something"', () => {
    render(<ParentGateway />);
    fireEvent.press(screen.getByTestId('gateway-learn'));
    expect(mockPush).toHaveBeenCalledWith('/(learner)/learn');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/home/ParentGateway.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './ParentGateway'`

- [ ] **Step 3: Implement `ParentGateway`**

Create `apps/mobile/src/components/home/ParentGateway.tsx`:

```typescript
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DashboardData } from '@eduagent/schemas';
import { ProfileSwitcher } from '../common';
import { IntentCard } from './IntentCard';
import { getGreeting } from '../../lib/greeting';
import { useProfile } from '../../lib/profile';
import { useDashboard } from '../../hooks/use-dashboard';

function getChildHighlight(dashboard: DashboardData | undefined): string {
  if (!dashboard || dashboard.children.length === 0) {
    return "See how they're doing";
  }

  const sorted = [...dashboard.children].sort(
    (a, b) => b.totalTimeThisWeek - a.totalTimeThisWeek
  );
  const child = sorted[0];

  if (child.totalTimeThisWeek > 0) {
    const minutes = Math.round(child.totalTimeThisWeek / 60);
    return `${child.displayName} practiced ${minutes} min this week`;
  }

  return 'No activity today';
}

export function ParentGateway(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { data: dashboard } = useDashboard();

  const { title, subtitle } = getGreeting(activeProfile?.displayName ?? '');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
      }}
      testID="parent-gateway"
    >
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-1">
          <Text className="text-h2 font-bold text-text-primary">{title}</Text>
          <Text className="text-body text-text-secondary mt-1">{subtitle}</Text>
        </View>
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfile?.id ?? ''}
          onSwitch={switchProfile}
        />
      </View>

      <View className="gap-4">
        <IntentCard
          title="Check child's progress"
          subtitle={getChildHighlight(dashboard)}
          onPress={() => router.push('/(parent)/dashboard' as never)}
          testID="gateway-check-progress"
        />
        <IntentCard
          title="Learn something"
          onPress={() => router.push('/(learner)/learn' as never)}
          testID="gateway-learn"
        />
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Update barrel export**

In `apps/mobile/src/components/home/index.ts`, add:

```typescript
export { IntentCard } from './IntentCard';
export { ParentGateway } from './ParentGateway';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/home/ParentGateway.test.tsx --no-coverage`
Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/home/ParentGateway.tsx \
       apps/mobile/src/components/home/ParentGateway.test.tsx \
       apps/mobile/src/components/home/index.ts
git commit -m "feat(home): add ParentGateway component

Shows time-aware greeting + two intent cards: 'Check child progress'
(with activity highlight from dashboard) and 'Learn something'.
Intentionally minimal — only two choices."
```

---

## Task 4: `LearnerScreen` component

**Files:**
- Create: `apps/mobile/src/components/home/LearnerScreen.tsx`
- Create: `apps/mobile/src/components/home/LearnerScreen.test.tsx`
- Modify: `apps/mobile/src/components/home/index.ts`

**Dependencies:** Task 1 (`getGreeting`), Task 2 (`IntentCard`)

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/home/LearnerScreen.test.tsx`:

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../common', () => ({
  ProfileSwitcher: () => null,
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: [{ id: 'p1', displayName: 'Alex', isOwner: true }],
    activeProfile: { id: 'p1', displayName: 'Alex', isOwner: true },
    switchProfile: jest.fn(),
  }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#ffffff' }),
}));

jest.mock('../../lib/greeting', () => ({
  getGreeting: (name: string) => ({
    title: `Good morning, ${name}!`,
    subtitle: 'Fresh mind, fresh start',
  }),
}));

let mockSubjects: Array<{ id: string; name: string; status: string }> = [];

jest.mock('../../hooks/use-subjects', () => ({
  useSubjects: () => ({ data: mockSubjects, isLoading: false }),
}));

const { LearnerScreen } = require('./LearnerScreen');

describe('LearnerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubjects = [];
  });

  it('renders greeting with profile name', () => {
    render(<LearnerScreen />);
    expect(screen.getByText('Good morning, Alex!')).toBeTruthy();
    expect(screen.getByText('Fresh mind, fresh start')).toBeTruthy();
  });

  describe('empty library', () => {
    it('shows "Learn something new!" and "Help with assignment?"', () => {
      render(<LearnerScreen />);
      expect(screen.getByText('Learn something new!')).toBeTruthy();
      expect(screen.getByText('Help with assignment?')).toBeTruthy();
    });

    it('hides "Repeat & review"', () => {
      render(<LearnerScreen />);
      expect(screen.queryByText('Repeat & review')).toBeNull();
    });
  });

  describe('library with active subjects', () => {
    beforeEach(() => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];
    });

    it('shows all three intent cards', () => {
      render(<LearnerScreen />);
      expect(screen.getByText('Learn something new!')).toBeTruthy();
      expect(screen.getByText('Help with assignment?')).toBeTruthy();
      expect(screen.getByText('Repeat & review')).toBeTruthy();
    });
  });

  describe('library with only inactive subjects', () => {
    it('hides "Repeat & review" when all subjects are archived', () => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'archived' }];
      render(<LearnerScreen />);
      expect(screen.queryByText('Repeat & review')).toBeNull();
    });
  });

  describe('navigation', () => {
    it('navigates to learn-new on "Learn something new!"', () => {
      render(<LearnerScreen />);
      fireEvent.press(screen.getByTestId('intent-learn-new'));
      expect(mockPush).toHaveBeenCalledWith('/(learner)/learn-new');
    });

    it('navigates to homework camera on "Help with assignment?"', () => {
      render(<LearnerScreen />);
      fireEvent.press(screen.getByTestId('intent-homework'));
      expect(mockPush).toHaveBeenCalledWith('/(learner)/homework/camera');
    });

    it('navigates to library on "Repeat & review"', () => {
      mockSubjects = [{ id: 's1', name: 'Math', status: 'active' }];
      render(<LearnerScreen />);
      fireEvent.press(screen.getByTestId('intent-review'));
      expect(mockPush).toHaveBeenCalledWith('/(learner)/library');
    });
  });

  describe('back button', () => {
    it('shows back button when onBack provided', () => {
      const onBack = jest.fn();
      render(<LearnerScreen onBack={onBack} />);

      fireEvent.press(screen.getByTestId('learner-back'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('hides back button when onBack not provided', () => {
      render(<LearnerScreen />);
      expect(screen.queryByTestId('learner-back')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/components/home/LearnerScreen.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './LearnerScreen'`

- [ ] **Step 3: Implement `LearnerScreen`**

Create `apps/mobile/src/components/home/LearnerScreen.tsx`:

```typescript
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ProfileSwitcher } from '../common';
import { IntentCard } from './IntentCard';
import { getGreeting } from '../../lib/greeting';
import { useProfile } from '../../lib/profile';
import { useSubjects } from '../../hooks/use-subjects';
import { useThemeColors } from '../../lib/theme';

interface LearnerScreenProps {
  onBack?: () => void;
}

export function LearnerScreen({
  onBack,
}: LearnerScreenProps): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profiles, activeProfile, switchProfile } = useProfile();
  const { data: subjects } = useSubjects();
  const colors = useThemeColors();

  const activeSubjects =
    subjects?.filter((s) => s.status === 'active') ?? [];
  const hasLibraryContent = activeSubjects.length > 0;

  const { title, subtitle } = getGreeting(activeProfile?.displayName ?? '');

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
      }}
      testID="learner-screen"
    >
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center flex-1">
          {onBack ? (
            <Pressable
              onPress={onBack}
              className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel="Go back"
              testID="learner-back"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color={colors.textPrimary}
              />
            </Pressable>
          ) : null}
          <View className="flex-1">
            <Text className="text-h2 font-bold text-text-primary">
              {title}
            </Text>
            <Text className="text-body text-text-secondary mt-1">
              {subtitle}
            </Text>
          </View>
        </View>
        <ProfileSwitcher
          profiles={profiles}
          activeProfileId={activeProfile?.id ?? ''}
          onSwitch={switchProfile}
        />
      </View>

      <View className="gap-4">
        <IntentCard
          title="Learn something new!"
          onPress={() => router.push('/(learner)/learn-new' as never)}
          testID="intent-learn-new"
        />
        <IntentCard
          title="Help with assignment?"
          subtitle="Take a picture and we'll look at it together"
          onPress={() => router.push('/(learner)/homework/camera' as never)}
          testID="intent-homework"
        />
        {hasLibraryContent ? (
          <IntentCard
            title="Repeat & review"
            onPress={() => router.push('/(learner)/library' as never)}
            testID="intent-review"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Update barrel export**

Replace `apps/mobile/src/components/home/index.ts`:

```typescript
export { IntentCard } from './IntentCard';
export { ParentGateway } from './ParentGateway';
export { LearnerScreen } from './LearnerScreen';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/components/home/LearnerScreen.test.tsx --no-coverage`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/home/LearnerScreen.tsx \
       apps/mobile/src/components/home/LearnerScreen.test.tsx \
       apps/mobile/src/components/home/index.ts
git commit -m "feat(home): add LearnerScreen component

Universal learner screen — 'Learn something new!', 'Help with
assignment?', and conditional 'Repeat & review' (only when library
has active subjects). Shared between home.tsx and /learn route."
```

---

## Task 5: `learn-new.tsx` route

**Files:**
- Create: `apps/mobile/src/app/(learner)/learn-new.tsx`
- Create: `apps/mobile/src/app/(learner)/learn-new.test.tsx`

**Dependencies:** Task 2 (`IntentCard`)

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/app/(learner)/learn-new.test.tsx`:

```typescript
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReadSessionRecoveryMarker = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'p1', displayName: 'Alex' },
  }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({ textPrimary: '#ffffff' }),
}));

jest.mock('../../lib/session-recovery', () => ({
  readSessionRecoveryMarker: (...args: unknown[]) =>
    mockReadSessionRecoveryMarker(...args),
  isRecoveryMarkerFresh: jest.fn().mockReturnValue(true),
}));

const LearnNewScreen = require('./learn-new').default;

describe('LearnNewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadSessionRecoveryMarker.mockResolvedValue(null);
  });

  it('renders title and two always-visible cards', () => {
    render(<LearnNewScreen />);

    expect(screen.getByText('What would you like to learn?')).toBeTruthy();
    expect(screen.getByText('Pick a subject')).toBeTruthy();
    expect(screen.getByText('Just ask anything')).toBeTruthy();
  });

  it('hides resume card when no recovery marker', () => {
    render(<LearnNewScreen />);
    expect(screen.queryByText('Continue where you left off')).toBeNull();
  });

  it('shows resume card when recovery marker is fresh', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'sess-1',
      subjectName: 'Math',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnNewScreen />);

    await waitFor(() => {
      expect(screen.getByText('Continue where you left off')).toBeTruthy();
      expect(screen.getByText('Math')).toBeTruthy();
    });
  });

  it('navigates to create-subject on "Pick a subject"', () => {
    render(<LearnNewScreen />);
    fireEvent.press(screen.getByTestId('intent-pick-subject'));
    expect(mockPush).toHaveBeenCalledWith('/create-subject');
  });

  it('navigates to freeform session on "Just ask anything"', () => {
    render(<LearnNewScreen />);
    fireEvent.press(screen.getByTestId('intent-freeform'));
    expect(mockPush).toHaveBeenCalledWith('/(learner)/session?mode=freeform');
  });

  it('navigates to session with sessionId on resume', async () => {
    mockReadSessionRecoveryMarker.mockResolvedValue({
      sessionId: 'sess-1',
      subjectName: 'Math',
      updatedAt: new Date().toISOString(),
    });

    render(<LearnNewScreen />);

    await waitFor(() => {
      fireEvent.press(screen.getByTestId('intent-resume'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(learner)/session',
      params: { sessionId: 'sess-1' },
    });
  });

  it('back button calls router.back()', () => {
    render(<LearnNewScreen />);
    fireEvent.press(screen.getByTestId('learn-new-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && pnpm exec jest src/app/\\(learner\\)/learn-new.test.tsx --no-coverage`
Expected: FAIL — `Cannot find module './learn-new'`

- [ ] **Step 3: Implement `learn-new.tsx`**

Create `apps/mobile/src/app/(learner)/learn-new.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { IntentCard } from '../../components/home';
import { useProfile } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import {
  readSessionRecoveryMarker,
  isRecoveryMarkerFresh,
} from '../../lib/session-recovery';

export default function LearnNewScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeProfile } = useProfile();
  const colors = useThemeColors();

  const [recoverySessionId, setRecoverySessionId] = useState<string | null>(
    null
  );
  const [recoverySubjectName, setRecoverySubjectName] = useState<
    string | undefined
  >();

  useEffect(() => {
    let cancelled = false;
    async function checkRecovery() {
      const marker = await readSessionRecoveryMarker(activeProfile?.id);
      if (!cancelled && marker && isRecoveryMarkerFresh(marker)) {
        setRecoverySessionId(marker.sessionId);
        setRecoverySubjectName(marker.subjectName ?? undefined);
      }
    }
    checkRecovery();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingHorizontal: 20,
      }}
      testID="learn-new-screen"
    >
      <View className="flex-row items-center mb-6">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 min-h-[32px] min-w-[32px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          testID="learn-new-back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text className="text-h2 font-bold text-text-primary flex-1">
          What would you like to learn?
        </Text>
      </View>

      <View className="gap-4">
        <IntentCard
          title="Pick a subject"
          onPress={() => router.push('/create-subject' as never)}
          testID="intent-pick-subject"
        />
        <IntentCard
          title="Just ask anything"
          onPress={() =>
            router.push('/(learner)/session?mode=freeform' as never)
          }
          testID="intent-freeform"
        />
        {recoverySessionId ? (
          <IntentCard
            title="Continue where you left off"
            subtitle={recoverySubjectName}
            onPress={() =>
              router.push({
                pathname: '/(learner)/session',
                params: { sessionId: recoverySessionId },
              } as never)
            }
            testID="intent-resume"
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/app/\\(learner\\)/learn-new.test.tsx --no-coverage`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/learn-new.tsx \
       apps/mobile/src/app/\(learner\)/learn-new.test.tsx
git commit -m "feat(home): add learn-new route — learning fork screen

'Pick a subject', 'Just ask anything', and conditional 'Continue
where you left off' (crash recovery marker from SecureStore).
Back arrow returns to LearnerScreen."
```

---

## Task 6: `learn.tsx` route + layout registration

**Files:**
- Create: `apps/mobile/src/app/(learner)/learn.tsx`
- Modify: `apps/mobile/src/app/(learner)/_layout.tsx:792-798`

**Dependencies:** Task 4 (`LearnerScreen`)

- [ ] **Step 1: Create `learn.tsx` route wrapper**

Create `apps/mobile/src/app/(learner)/learn.tsx`:

```typescript
import { useRouter } from 'expo-router';
import { LearnerScreen } from '../../components/home';

export default function LearnRoute(): React.ReactElement {
  const router = useRouter();
  return <LearnerScreen onBack={() => router.back()} />;
}
```

> No test file needed — this is a 4-line wrapper. Navigation behaviour is tested via `LearnerScreen.test.tsx` (onBack prop) and integration tests in `home.test.tsx`.

- [ ] **Step 2: Register hidden tab screens in `_layout.tsx`**

In `apps/mobile/src/app/(learner)/_layout.tsx`, find the last `<Tabs.Screen>` block (the `subject` screen at approximately line 792-798) and add two new entries **before the closing `</Tabs>`** tag:

```tsx
        <Tabs.Screen
          name="subject"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        {/* ── Adaptive home screen routes ── */}
        <Tabs.Screen
          name="learn"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="learn-new"
          options={{
            href: null,
            tabBarItemStyle: { display: 'none' },
          }}
        />
      </Tabs>
```

- [ ] **Step 3: Verify type check passes**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/learn.tsx \
       apps/mobile/src/app/\(learner\)/_layout.tsx
git commit -m "feat(home): add learn route + register hidden tab screens

learn.tsx wraps LearnerScreen with back navigation for parents.
Both learn and learn-new registered as hidden Tabs.Screen entries."
```

---

## Task 7: Rewrite `home.tsx` + `home.test.tsx`

**Files:**
- Modify: `apps/mobile/src/app/(learner)/home.tsx` (full rewrite: 883 → ~80 lines)
- Modify: `apps/mobile/src/app/(learner)/home.test.tsx` (full rewrite)

**Dependencies:** Task 3 (`ParentGateway`), Task 4 (`LearnerScreen`)

- [ ] **Step 1: Write the new tests**

Replace the entire content of `apps/mobile/src/app/(learner)/home.test.tsx`:

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react-native';

let mockProfiles: Array<{
  id: string;
  displayName: string;
  isOwner: boolean;
}> = [];
let mockActiveProfile: {
  id: string;
  displayName: string;
  isOwner: boolean;
} | null = null;

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    profiles: mockProfiles,
    activeProfile: mockActiveProfile,
    switchProfile: jest.fn(),
  }),
}));

jest.mock('../../hooks/use-celebrations', () => ({
  usePendingCelebrations: () => ({ data: [] }),
  useMarkCelebrationsSeen: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../hooks/use-celebration', () => ({
  useCelebration: () => ({ CelebrationOverlay: null }),
}));

jest.mock('../../hooks/use-settings', () => ({
  useCelebrationLevel: () => ({ data: 'all' }),
}));

jest.mock('../../components/home', () => {
  const { View, Text } = require('react-native');
  return {
    ParentGateway: () => (
      <View testID="parent-gateway">
        <Text>ParentGateway</Text>
      </View>
    ),
    LearnerScreen: () => (
      <View testID="learner-screen">
        <Text>LearnerScreen</Text>
      </View>
    ),
  };
});

const HomeScreen = require('./home').default;

describe('HomeScreen intent router', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders LearnerScreen for solo learner (owner, no children)', () => {
    mockProfiles = [{ id: 'p1', displayName: 'Alex', isOwner: true }];
    mockActiveProfile = mockProfiles[0];

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
  });

  it('renders ParentGateway when owner profile has linked children', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[0]; // parent profile active

    render(<HomeScreen />);

    expect(screen.getByTestId('parent-gateway')).toBeTruthy();
    expect(screen.queryByTestId('learner-screen')).toBeNull();
  });

  it('renders LearnerScreen when active profile is a child (non-owner)', () => {
    mockProfiles = [
      { id: 'p1', displayName: 'Maria', isOwner: true },
      { id: 'c1', displayName: 'Emma', isOwner: false },
    ];
    mockActiveProfile = mockProfiles[1]; // child profile active

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
    expect(screen.queryByTestId('parent-gateway')).toBeNull();
  });

  it('renders LearnerScreen when profiles are still loading', () => {
    mockProfiles = [];
    mockActiveProfile = null;

    render(<HomeScreen />);

    expect(screen.getByTestId('learner-screen')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run new tests to verify they fail against old `home.tsx`**

Run: `cd apps/mobile && pnpm exec jest src/app/\\(learner\\)/home.test.tsx --no-coverage`
Expected: FAIL — old `home.tsx` doesn't import from `../../components/home`; mock shape mismatch

- [ ] **Step 3: Replace `home.tsx` with the intent router**

Replace the entire content of `apps/mobile/src/app/(learner)/home.tsx`:

```typescript
import { View } from 'react-native';
import { useProfile } from '../../lib/profile';
import {
  usePendingCelebrations,
  useMarkCelebrationsSeen,
} from '../../hooks/use-celebrations';
import { useCelebration } from '../../hooks/use-celebration';
import { useCelebrationLevel } from '../../hooks/use-settings';
import { ParentGateway, LearnerScreen } from '../../components/home';

export default function HomeScreen(): React.ReactElement {
  const { profiles, activeProfile } = useProfile();
  const { data: celebrationLevel = 'all' } = useCelebrationLevel();
  const { data: pendingCelebrations } = usePendingCelebrations();
  const markSeen = useMarkCelebrationsSeen();

  // Owner profile with at least one non-owner (child) profile linked
  const hasLinkedChildren =
    activeProfile?.isOwner === true &&
    profiles.some((p) => p.id !== activeProfile.id && !p.isOwner);

  const { CelebrationOverlay } = useCelebration({
    queue: pendingCelebrations ?? [],
    celebrationLevel,
    audience: 'child',
    onAllComplete: () => markSeen.mutateAsync({ viewer: 'child' }),
  });

  return (
    <View className="flex-1">
      {hasLinkedChildren ? <ParentGateway /> : <LearnerScreen />}
      {CelebrationOverlay}
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && pnpm exec jest src/app/\\(learner\\)/home.test.tsx --no-coverage`
Expected: All 4 tests PASS

- [ ] **Step 5: Run all home-related tests together**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(learner\\)/home.tsx --no-coverage`
Expected: All tests PASS (catches any broken imports from other files that imported old home.tsx exports)

- [ ] **Step 6: Run type check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/home.tsx \
       apps/mobile/src/app/\(learner\)/home.test.tsx
git commit -m "feat(home): rewrite home.tsx as state-driven intent router

Replaces 883-line monolithic screen with ~30-line intent router.
Renders ParentGateway (for profiles with linked children) or
LearnerScreen (for solo learners) based on profile data.
Celebrations overlay preserved. Old code in git history."
```

---

## Task 8: Full verification pass

**Files:** None (verification only)

- [ ] **Step 1: Run all new + modified test files**

```bash
cd apps/mobile && pnpm exec jest \
  src/lib/greeting.test.ts \
  src/components/home/IntentCard.test.tsx \
  src/components/home/ParentGateway.test.tsx \
  src/components/home/LearnerScreen.test.tsx \
  src/app/\(learner\)/learn-new.test.tsx \
  src/app/\(learner\)/home.test.tsx \
  --no-coverage
```

Expected: All tests PASS (42 tests across 6 suites)

- [ ] **Step 2: Run findRelatedTests for all changed source files**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/lib/greeting.ts \
  src/components/home/IntentCard.tsx \
  src/components/home/ParentGateway.tsx \
  src/components/home/LearnerScreen.tsx \
  src/app/\(learner\)/home.tsx \
  src/app/\(learner\)/learn.tsx \
  src/app/\(learner\)/learn-new.tsx \
  src/app/\(learner\)/_layout.tsx \
  --no-coverage
```

Expected: All related tests PASS

- [ ] **Step 3: Type check**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Lint**

Run: `pnpm exec nx lint mobile`
Expected: No errors (or only pre-existing warnings)

---

## Spec Coverage Checklist

| Spec requirement | Implemented in |
|---|---|
| `home.tsx` renders ParentGateway when `hasLinkedChildren` | Task 7 — `home.tsx` |
| `home.tsx` renders LearnerScreen directly when no children | Task 7 — `home.tsx` |
| Parent Gateway: time-aware greeting | Task 1 (`getGreeting`) + Task 3 (`ParentGateway`) |
| Parent Gateway: "Check child's progress" → `/(parent)/dashboard` | Task 3 — `ParentGateway.tsx` |
| Parent Gateway: child activity highlight (most active child) | Task 3 — `getChildHighlight()` in `ParentGateway.tsx` |
| Parent Gateway: "Learn something" → `/learn` route | Task 3 — `ParentGateway.tsx` |
| LearnerScreen: time-aware greeting + profile switcher | Task 1 + Task 4 |
| LearnerScreen: "Learn something new!" → `learn-new.tsx` | Task 4 — `LearnerScreen.tsx` |
| LearnerScreen: "Help with assignment?" → homework camera | Task 4 — `LearnerScreen.tsx` |
| LearnerScreen: "Repeat & review" (conditional on library) | Task 4 — `LearnerScreen.tsx` |
| LearnerScreen reused in `home.tsx` and `/learn` route | Task 4 + Task 6 |
| `learn-new.tsx`: "Pick a subject" → `/create-subject` | Task 5 — `learn-new.tsx` |
| `learn-new.tsx`: "Just ask anything" → freeform session | Task 5 — `learn-new.tsx` |
| `learn-new.tsx`: "Continue where you left off" (recovery marker) | Task 5 — `learn-new.tsx` |
| Back navigation: parent gateway → learn → back returns to gateway | Task 6 — `learn.tsx` `onBack` |
| Back navigation: learner screen is root (no back) | Task 4 — `LearnerScreen` without `onBack` |
| Back navigation: learn-new → back returns to learner | Task 5 — `router.back()` |
| Greeting: time-of-day titles (morning/afternoon/evening/night) | Task 1 |
| Greeting: day-of-week subtitle overrides (Mon/Fri/weekend) | Task 1 |
| Greeting: default time-based subtitles (Tue-Thu) | Task 1 |
| Hidden tab screens registered in layout | Task 6 — `_layout.tsx` |
| Coaching cards NOT on home entry point | Task 7 — not imported |
| Subject list NOT on home entry point | Task 7 — not imported |
| ~50-100 line target for home.tsx | Task 7 — ~30 lines |

## Out of Scope (per spec)

- Usage-pattern-aware greetings (last session timestamp)
- Coaching card integration into new screens
- Any persona-type or age-based branching
