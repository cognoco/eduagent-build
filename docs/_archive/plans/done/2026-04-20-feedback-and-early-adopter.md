# In-App Feedback & Early Adopter Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give users a low-friction way to report problems (shake-to-report + "Report a Problem" in More) and show new users an encouraging "early adopter" card on the home screen that teaches them about shake-to-report before being dismissed.

**Architecture:** Client-side FeedbackProvider at the root layout listens for device shake (via `expo-sensors` Accelerometer) and exposes `openFeedback()` via React context. A modal feedback form posts to `POST /feedback`, which sends an email to `support@mentomate.app` via the existing Resend integration. An `EarlyAdopterCard` on the home screen auto-shows for users with < 5 sessions and disappears on dismiss (with shake-hint copy).

**Tech Stack:** Expo SDK 54, expo-sensors (Accelerometer), Hono API routes, Resend email, React Query mutations, SecureStore, NativeWind/Tailwind

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `packages/schemas/src/feedback.ts` | Zod schemas for feedback submission input + response |
| `apps/api/src/routes/feedback.ts` | `POST /feedback` route — validates, sends email via Resend |
| `apps/api/src/routes/feedback.test.ts` | Route tests |
| `apps/mobile/src/hooks/use-shake-detector.ts` | Accelerometer-based shake detection hook |
| `apps/mobile/src/hooks/use-feedback.ts` | `useFeedbackSubmit()` mutation + `useFeedbackContext()` accessor |
| `apps/mobile/src/components/feedback/FeedbackSheet.tsx` | Modal overlay with category picker + text input + submit |
| `apps/mobile/src/components/feedback/FeedbackProvider.tsx` | Root-level context: shake listener + modal state + `openFeedback()` |
| `apps/mobile/src/components/home/EarlyAdopterCard.tsx` | Dismissible card for new users on home screen |

### Modified files
| File | Change |
|------|--------|
| `packages/schemas/src/index.ts` | Re-export feedback schemas |
| `apps/api/src/index.ts` | Register `feedbackRoutes` |
| `apps/mobile/src/app/_layout.tsx` | Wrap `ThemedContent` children with `FeedbackProvider` |
| `apps/mobile/src/app/(app)/more.tsx` | Add "Report a Problem" `SettingsRow` |
| `apps/mobile/src/components/home/LearnerScreen.tsx` | Render `EarlyAdopterCard` above intent cards |

### Package install
| Package | Purpose |
|---------|---------|
| `expo-sensors` | Accelerometer API for shake detection (native + web stub) |

---

## Task 1: Schema — Feedback Submission Types

**Files:**
- Create: `packages/schemas/src/feedback.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Create the feedback schema file**

```ts
// packages/schemas/src/feedback.ts
import { z } from 'zod';

export const feedbackCategorySchema = z.enum(['bug', 'suggestion', 'other']);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const feedbackSubmissionSchema = z.object({
  category: feedbackCategorySchema,
  message: z.string().min(1).max(2000),
  appVersion: z.string().max(20).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  osVersion: z.string().max(30).optional(),
});
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;

export const feedbackResponseSchema = z.object({
  success: z.boolean(),
});
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
```

- [ ] **Step 2: Export from the schemas barrel**

Add to `packages/schemas/src/index.ts`:

```ts
export {
  feedbackCategorySchema,
  feedbackSubmissionSchema,
  feedbackResponseSchema,
  type FeedbackCategory,
  type FeedbackSubmission,
  type FeedbackResponse,
} from './feedback';
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm exec nx run schemas:typecheck` (or `cd packages/schemas && pnpm exec tsc --noEmit`)
Expected: PASS with no errors

- [ ] **Step 4: Commit**

```
feat(schemas): add feedback submission types [FEEDBACK-1]
```

---

## Task 2: API — Feedback Route

**Files:**
- Create: `apps/api/src/routes/feedback.ts`
- Create: `apps/api/src/routes/feedback.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/feedback.test.ts`:

```ts
import { Hono } from 'hono';
import { feedbackRoutes } from './feedback';
import * as notifications from '../services/notifications';

// Mock only the external email service — not internal code
jest.mock('../services/notifications', () => ({
  ...jest.requireActual('../services/notifications'),
  sendEmail: jest.fn().mockResolvedValue({ sent: true, messageId: 'test-id' }),
}));

const mockSendEmail = notifications.sendEmail as jest.MockedFunction<
  typeof notifications.sendEmail
>;

type FeedbackEnv = {
  Variables: {
    user: { userId: string; email?: string };
    db: unknown;
    profileId: string | undefined;
  };
  Bindings: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    SUPPORT_EMAIL?: string;
  };
};

function createTestApp() {
  const app = new Hono<FeedbackEnv>();
  // Inject mock auth context
  app.use('*', async (c, next) => {
    c.set('user', { userId: 'user-1', email: 'test@example.com' });
    c.set('profileId', 'profile-1');
    await next();
  });
  app.route('/', feedbackRoutes);
  return app;
}

describe('POST /feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid feedback and sends email', async () => {
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'bug',
        message: 'The quiz crashes when I tap submit',
        appVersion: '1.0.0',
        platform: 'ios',
        osVersion: '18.2',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'support@mentomate.app',
        subject: expect.stringContaining('bug'),
      }),
      expect.any(Object)
    );
  });

  it('rejects empty message', async () => {
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'bug', message: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid category', async () => {
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'rant', message: 'Hello' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns success even if email fails (graceful degradation)', async () => {
    mockSendEmail.mockResolvedValueOnce({ sent: false, reason: 'no_api_key' });
    const app = createTestApp();
    const res = await app.request('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'suggestion', message: 'Add dark mode' }),
    });
    // Still return success — user shouldn't be punished for infra issues
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/feedback.test.ts --no-coverage`
Expected: FAIL — `feedbackRoutes` does not exist yet

- [ ] **Step 3: Implement the feedback route**

Create `apps/api/src/routes/feedback.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { feedbackSubmissionSchema } from '@eduagent/schemas';
import type { AuthUser } from '../middleware/auth';
import type { Database } from '@eduagent/database';
import { sendEmail } from '../services/notifications';

type FeedbackRouteEnv = {
  Bindings: {
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    SUPPORT_EMAIL?: string;
  };
  Variables: {
    user: AuthUser;
    db: Database;
    profileId: string | undefined;
  };
};

const SUPPORT_EMAIL = 'support@mentomate.app';

export const feedbackRoutes = new Hono<FeedbackRouteEnv>().post(
  '/feedback',
  zValidator('json', feedbackSubmissionSchema),
  async (c) => {
    const body = c.req.valid('json');
    const profileId = c.get('profileId') ?? 'unknown';
    const userId = c.get('user').userId;
    const supportTo = c.env.SUPPORT_EMAIL ?? SUPPORT_EMAIL;

    const categoryLabel =
      body.category === 'bug'
        ? 'Bug Report'
        : body.category === 'suggestion'
          ? 'Suggestion'
          : 'Feedback';

    const metaLines = [
      `Profile ID: ${profileId}`,
      `User ID: ${userId}`,
      body.appVersion ? `App Version: ${body.appVersion}` : null,
      body.platform ? `Platform: ${body.platform}` : null,
      body.osVersion ? `OS Version: ${body.osVersion}` : null,
      `Submitted: ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');

    await sendEmail(
      {
        to: supportTo,
        subject: `[MentoMate ${categoryLabel}] from ${profileId.slice(0, 8)}`,
        body: `${body.message}\n\n---\n${metaLines}`,
        type: 'consent_request', // reuses existing EmailPayload type field
      },
      {
        resendApiKey: c.env.RESEND_API_KEY,
        emailFrom: c.env.EMAIL_FROM,
      }
    );

    return c.json({ success: true });
  }
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/api && pnpm exec jest --findRelatedTests src/routes/feedback.test.ts --no-coverage`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Register the route in the API index**

In `apps/api/src/index.ts`, add the import alongside the other route imports (near line 69):

```ts
import { feedbackRoutes } from './routes/feedback';
```

And add to the route chain (after the last `.route('/', quizRoutes)` on line 220):

```ts
  .route('/', feedbackRoutes);
```

- [ ] **Step 6: Typecheck the API**

Run: `pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```
feat(api): POST /feedback route sends email via Resend [FEEDBACK-2]
```

---

## Task 3: Mobile — Install expo-sensors + Shake Detection Hook

**Files:**
- Install: `expo-sensors` package
- Create: `apps/mobile/src/hooks/use-shake-detector.ts`

- [ ] **Step 1: Install expo-sensors**

Run from project root:
```bash
cd apps/mobile && npx expo install expo-sensors
```

This installs the SDK-compatible version. `expo-sensors` provides the `Accelerometer` API we need.

- [ ] **Step 2: Create the shake detection hook**

Create `apps/mobile/src/hooks/use-shake-detector.ts`:

```ts
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';

/** Minimum m/s² magnitude change to count as a shake sample. */
const SHAKE_THRESHOLD = 1.8;

/** How many threshold-exceeding samples within the window trigger a shake. */
const SHAKE_COUNT = 3;

/** Time window (ms) in which SHAKE_COUNT samples must occur. */
const SHAKE_WINDOW_MS = 600;

/** Cooldown (ms) after a shake fires before the next one can trigger. */
const SHAKE_COOLDOWN_MS = 2000;

/**
 * Calls `onShake` when the user shakes their device.
 *
 * Uses the Accelerometer from expo-sensors. On web, shake detection is
 * skipped (no physical accelerometer). The hook cleans up the subscription
 * on unmount.
 */
export function useShakeDetector(onShake: () => void): void {
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    // No accelerometer on web
    if (Platform.OS === 'web') return;

    const timestamps: number[] = [];
    let lastShakeTime = 0;

    Accelerometer.setUpdateInterval(100);

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      // Magnitude of acceleration minus gravity (1g ≈ 9.8 but expo normalises to ~1)
      const magnitude = Math.sqrt(x * x + y * y + z * z) - 1;

      if (magnitude < SHAKE_THRESHOLD) return;

      const now = Date.now();
      timestamps.push(now);

      // Remove samples outside the window
      while (timestamps.length > 0 && now - timestamps[0] > SHAKE_WINDOW_MS) {
        timestamps.shift();
      }

      if (timestamps.length >= SHAKE_COUNT && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
        lastShakeTime = now;
        timestamps.length = 0;
        onShakeRef.current();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
```

- [ ] **Step 3: Verify the hook compiles**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(mobile): add shake detection hook via expo-sensors [FEEDBACK-3]
```

---

## Task 4: Mobile — Feedback Submission Hook

**Files:**
- Create: `apps/mobile/src/hooks/use-feedback.ts`

- [ ] **Step 1: Create the feedback mutation hook**

Create `apps/mobile/src/hooks/use-feedback.ts`:

```ts
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { FeedbackSubmission, FeedbackResponse } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

export function useFeedbackSubmit(): UseMutationResult<
  FeedbackResponse,
  Error,
  FeedbackSubmission
> {
  const client = useApiClient();

  return useMutation({
    mutationFn: async (input: FeedbackSubmission) => {
      const res = await client.feedback.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as FeedbackResponse;
    },
  });
}
```

- [ ] **Step 2: Verify the hook compiles**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS (the RPC type will resolve once the API route is registered in index.ts)

- [ ] **Step 3: Commit**

```
feat(mobile): add useFeedbackSubmit mutation hook [FEEDBACK-4]
```

---

## Task 5: Mobile — Feedback Form + Provider

**Files:**
- Create: `apps/mobile/src/components/feedback/FeedbackSheet.tsx`
- Create: `apps/mobile/src/components/feedback/FeedbackProvider.tsx`

- [ ] **Step 1: Create the FeedbackSheet modal component**

Create `apps/mobile/src/components/feedback/FeedbackSheet.tsx`:

```tsx
import { useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedbackCategory } from '@eduagent/schemas';
import { useThemeColors } from '../../lib/theme';
import { useFeedbackSubmit } from '../../hooks/use-feedback';
import { formatApiError } from '../../lib/format-api-error';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

interface FeedbackSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function FeedbackSheet({
  visible,
  onClose,
}: FeedbackSheetProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const submit = useFeedbackSubmit();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');

  const canSubmit = message.trim().length > 0 && !submit.isPending;

  function handleSubmit() {
    if (!canSubmit) return;
    submit.mutate(
      {
        category,
        message: message.trim(),
        appVersion: Constants.expoConfig?.version ?? undefined,
        platform: Platform.OS as 'ios' | 'android' | 'web',
        osVersion: Platform.Version?.toString(),
      },
      {
        onSuccess: () => {
          Alert.alert(
            'Thank you!',
            "We've received your feedback and will look into it.",
            [{ text: 'OK', onPress: handleClose }]
          );
        },
        onError: (err) => {
          Alert.alert('Could not send feedback', formatApiError(err));
        },
      }
    );
  }

  function handleClose() {
    setMessage('');
    setCategory('bug');
    submit.reset();
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      testID="feedback-modal"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
          <Pressable
            onPress={handleClose}
            className="min-w-[44px] min-h-[44px] justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="feedback-close"
          >
            <Text className="text-primary text-body font-semibold">Cancel</Text>
          </Pressable>
          <Text className="text-h2 font-bold text-text-primary">
            Report a Problem
          </Text>
          <View style={{ minWidth: 44 }} />
        </View>

        <View className="flex-1 px-5 pt-4">
          {/* Category picker */}
          <Text className="text-body-sm font-semibold text-text-secondary mb-2">
            What kind of feedback?
          </Text>
          <View className="flex-row gap-2 mb-5">
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.value}
                onPress={() => setCategory(cat.value)}
                className={`flex-1 py-2.5 rounded-button items-center ${
                  category === cat.value
                    ? 'bg-primary'
                    : 'bg-surface border border-border'
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === cat.value }}
                testID={`feedback-category-${cat.value}`}
              >
                <Text
                  className={`text-body-sm font-semibold ${
                    category === cat.value
                      ? 'text-text-inverse'
                      : 'text-text-primary'
                  }`}
                >
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Message input */}
          <Text className="text-body-sm font-semibold text-text-secondary mb-2">
            Tell us what happened
          </Text>
          <TextInput
            className="bg-surface text-text-primary text-body rounded-card px-4 py-3 min-h-[140px]"
            style={{ textAlignVertical: 'top' }}
            placeholder="Describe the issue or your idea..."
            placeholderTextColor={colors.muted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={2000}
            autoFocus
            editable={!submit.isPending}
            testID="feedback-message-input"
          />
          <Text className="text-caption text-text-muted mt-1 text-right">
            {message.length}/2000
          </Text>

          <Text className="text-caption text-text-muted mt-4">
            We'll also include your app version and device info to help us
            investigate.
          </Text>
        </View>

        {/* Submit button */}
        <View className="px-5 pb-4">
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-button py-3.5 items-center ${
              canSubmit ? 'bg-primary' : 'bg-primary/40'
            }`}
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            testID="feedback-submit"
          >
            {submit.isPending ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text className="text-body font-semibold text-text-inverse">
                Send Feedback
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
```

- [ ] **Step 2: Create the FeedbackProvider**

Create `apps/mobile/src/components/feedback/FeedbackProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useState } from 'react';
import { useShakeDetector } from '../../hooks/use-shake-detector';
import { FeedbackSheet } from './FeedbackSheet';

interface FeedbackContextValue {
  openFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  openFeedback: () => {},
});

export function useFeedbackContext(): FeedbackContextValue {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [visible, setVisible] = useState(false);

  const openFeedback = useCallback(() => {
    setVisible(true);
  }, []);

  useShakeDetector(openFeedback);

  return (
    <FeedbackContext.Provider value={{ openFeedback }}>
      {children}
      <FeedbackSheet visible={visible} onClose={() => setVisible(false)} />
    </FeedbackContext.Provider>
  );
}
```

- [ ] **Step 3: Verify the components compile**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(mobile): feedback form + provider with shake-to-report [FEEDBACK-5]
```

---

## Task 6: Mobile — Wire FeedbackProvider into Root Layout

**Files:**
- Modify: `apps/mobile/src/app/_layout.tsx`

- [ ] **Step 1: Add FeedbackProvider import**

In `apps/mobile/src/app/_layout.tsx`, add the import near the other component imports (around line 40):

```ts
import { FeedbackProvider } from '../components/feedback/FeedbackProvider';
```

- [ ] **Step 2: Wrap ThemedContent's children with FeedbackProvider**

In the `ThemedContent` function (around line 192), wrap the content inside the root `<View>`. The `FeedbackProvider` needs to be inside `ThemeContext` (for colors) and `QueryClientProvider` (for mutations) — both are already ancestors at this point.

Change the return in `ThemedContent` (around line 200) from:

```tsx
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {isOffline && <OfflineBanner />}
      <Stack
```

to:

```tsx
    <View style={[{ flex: 1 }, tokenVars]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {isOffline && <OfflineBanner />}
      <FeedbackProvider>
      <Stack
```

And close `</FeedbackProvider>` after `</Stack>` and before the closing `</View>`:

```tsx
      </Stack>
      </FeedbackProvider>
    </View>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(mobile): wire FeedbackProvider into root layout [FEEDBACK-6]
```

---

## Task 7: Mobile — "Report a Problem" in More Screen

**Files:**
- Modify: `apps/mobile/src/app/(app)/more.tsx`

- [ ] **Step 1: Add the import**

In `apps/mobile/src/app/(app)/more.tsx`, add the import at the top (near the other hook imports):

```ts
import { useFeedbackContext } from '../../components/feedback/FeedbackProvider';
```

- [ ] **Step 2: Use the context in the component**

Inside the `MoreScreen` component function body (around line 203, after the other hook calls):

```ts
  const { openFeedback } = useFeedbackContext();
```

- [ ] **Step 3: Add the SettingsRow**

In the JSX, add a new row after the existing "Help & Support" row (after line 560):

```tsx
        <SettingsRow
          label="Report a Problem"
          onPress={openFeedback}
        />
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(mobile): add "Report a Problem" row to More screen [FEEDBACK-7]
```

---

## Task 8: Mobile — Early Adopter Card on Home Screen

**Files:**
- Create: `apps/mobile/src/components/home/EarlyAdopterCard.tsx`
- Modify: `apps/mobile/src/components/home/LearnerScreen.tsx`

- [ ] **Step 1: Create the EarlyAdopterCard component**

Create `apps/mobile/src/components/home/EarlyAdopterCard.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import type { KnowledgeInventory } from '@eduagent/schemas';
import * as SecureStore from '../../lib/secure-storage';
import { useProfile } from '../../lib/profile';
import { useThemeColors } from '../../lib/theme';
import { useFeedbackContext } from '../feedback/FeedbackProvider';

/** Card auto-hides after this many completed sessions. */
const MAX_SESSIONS = 5;

const DISMISSED_KEY = (profileId: string) =>
  `earlyAdopterDismissed_${profileId}`;

export function EarlyAdopterCard(): React.ReactElement | null {
  const { activeProfile } = useProfile();
  const { openFeedback } = useFeedbackContext();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  const profileId = activeProfile?.id;

  // Read dismiss state from SecureStore
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(DISMISSED_KEY(profileId));
        if (!cancelled) setDismissed(value === 'true');
      } catch {
        if (!cancelled) setDismissed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (profileId) {
      void SecureStore.setItemAsync(DISMISSED_KEY(profileId), 'true').catch(
        () => {
          /* non-fatal */
        }
      );
    }
  }, [profileId]);

  // Auto-hide after MAX_SESSIONS — read from React Query cache (zero API calls)
  const cachedInventory = queryClient.getQueryData<KnowledgeInventory>([
    'progress',
    'inventory',
    profileId,
  ]);
  const totalSessions = cachedInventory?.global.totalSessions ?? 0;

  // Don't render while loading dismiss state, after dismiss, or after 5 sessions
  if (dismissed === null || dismissed || totalSessions >= MAX_SESSIONS) {
    return null;
  }

  return (
    <View
      className="bg-primary-soft rounded-card px-5 py-4 mb-4"
      testID="early-adopter-card"
      accessibilityRole="alert"
    >
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="text-body font-semibold text-text-primary mb-1">
            You're one of our first users!
          </Text>
          <Text className="text-body-sm text-text-secondary mb-3">
            Your feedback shapes MentoMate. If something feels off, let us know.
          </Text>
          <Pressable
            onPress={openFeedback}
            className="flex-row items-center self-start"
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            testID="early-adopter-feedback-cta"
          >
            <Ionicons
              name="chatbubble-outline"
              size={16}
              color={colors.primary}
            />
            <Text className="text-body-sm font-semibold text-primary ml-1.5">
              Send feedback
            </Text>
          </Pressable>
        </View>
        <Pressable
          onPress={handleDismiss}
          className="min-h-[32px] min-w-[32px] items-center justify-center -mt-1 -mr-1"
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={8}
          testID="early-adopter-dismiss"
        >
          <Ionicons name="close" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
      <Text className="text-caption text-text-muted mt-2">
        Dismiss — you can always shake your phone to report anytime
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Wire the card into LearnerScreen**

In `apps/mobile/src/components/home/LearnerScreen.tsx`:

Add the import near other component imports (around line 31):

```ts
import { EarlyAdopterCard } from './EarlyAdopterCard';
```

In the return JSX of the happy-path (non-loading, non-error) branch (around line 400–414), add `<EarlyAdopterCard />` just above the intent cards inside the `<ScrollView>`:

Change:

```tsx
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4" testID="learner-intent-stack">
```

to:

```tsx
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 16,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <EarlyAdopterCard />
        <View className="gap-4" testID="learner-intent-stack">
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(mobile): early adopter card on home with dismiss + shake hint [FEEDBACK-8]
```

---

## Task 9: Full Validation Pass

- [ ] **Step 1: Run API tests**

Run: `pnpm exec nx run api:test -- --passWithNoTests`
Expected: All tests PASS, including the new feedback route tests

- [ ] **Step 2: Run API lint + typecheck**

Run: `pnpm exec nx run api:lint && pnpm exec nx run api:typecheck`
Expected: PASS

- [ ] **Step 3: Run mobile typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run mobile lint**

Run: `pnpm exec nx lint mobile`
Expected: PASS

- [ ] **Step 5: Run related mobile tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/components/feedback/FeedbackProvider.tsx src/components/feedback/FeedbackSheet.tsx src/components/home/EarlyAdopterCard.tsx src/hooks/use-shake-detector.ts src/hooks/use-feedback.ts --no-coverage`
Expected: PASS (or no tests found — these are UI components without unit tests, verified via typecheck + manual)

- [ ] **Step 6: Fix any failures, commit**

```
chore: fix lint/type issues from feedback feature [FEEDBACK-9]
```

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Email send fails | Resend API down / key missing | "Thank you!" (graceful — we don't punish users) | Dev team gets `[email]` console.error in logs |
| Shake doesn't trigger | Accelerometer unavailable | Nothing — shake just doesn't work | "Report a Problem" in More screen always available |
| Feedback form loses text | App backgrounded / crash | Empty form next time | Keep it short — forms are ephemeral |
| Network error on submit | Offline | "Could not send feedback" + error message | User retries when back online |
| Early adopter card stuck | SecureStore write fails | Card shows again next session | Non-critical — eventually auto-hides at 5 sessions |

---

## Not Included (Future Iterations)

- **Database table for feedback** — add when volume justifies querying/analytics
- **Notion integration** — auto-create bugs in the Bug Tracker database
- **Screenshot attachment** — capture current screen state with feedback
- **Inngest email queue** — move to durable async if volume grows
- **Rate limiting** — add if spam becomes an issue (unlikely at launch scale)
