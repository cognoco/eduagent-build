# BILLING-09: Top-Up Purchase Confidence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the top-up credit purchase UX with progress messaging, confident timeout copy, graceful missing-package handling, and verified auto-refresh on return.

**Architecture:** All changes are in the mobile subscription screen (`subscription.tsx`) and its test file. One staleTime verification in `use-subscription.ts` (already correct — no change needed). The polling loop gains a `pollStartTime` ref to drive two-stage messaging. The missing-package path branches on offerings loading/error state.

**Tech Stack:** React Native, TanStack Query, RevenueCat, Jest + React Native Testing Library

**Spec:** `docs/specs/2026-04-10-topup-purchase-confidence-design.md`

---

## Pre-Implementation Notes

### Already Done (no work needed)
- **Spec Item 5 (polling race):** Code already uses `fetchQuery` with `staleTime: 0` instead of invalidate→sleep→read. (subscription.tsx:824-835)
- **Spec Item 3 (auto-refresh on return):** `useUsage()` has no explicit `staleTime`, defaulting to 0 in TanStack Query v5. Navigating away and returning will trigger a refetch automatically.

### Files
- **Modify:** `apps/mobile/src/app/(app)/subscription.tsx` — handleTopUp + JSX
- **Modify:** `apps/mobile/src/app/(app)/subscription.test.tsx` — update existing tests, add new ones

---

## Task 1: Add two-stage polling progress message

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx:582-584` (state declarations)
- Modify: `apps/mobile/src/app/(app)/subscription.tsx:810-845` (polling loop)
- Modify: `apps/mobile/src/app/(app)/subscription.tsx:1305-1317` (JSX)

### Implementation

- [ ] **Step 1: Add `pollStartTime` ref and `pollMessage` state**

In the state declarations section (after line 584), add:

```tsx
const [pollMessage, setPollMessage] = useState('Confirming your purchase...');
const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 2: Start a timer when polling begins, update message at 10s**

In `handleTopUp`, after `setTopUpPolling(true)` (line 813), add a timer that upgrades the message at 10 seconds:

```tsx
setPollMessage('Confirming your purchase...');
pollTimerRef.current = setInterval(() => {
  setPollMessage(
    'Still confirming \u2014 this can take up to 30 seconds. Your purchase is safe.'
  );
}, 10_000);
// Run the interval only once — clearInterval after first fire
const firstTimer = pollTimerRef.current;
const wrappedTimer = setInterval(() => {
  // no-op, replaced below
}, 86_400_000);
clearInterval(wrappedTimer);
```

Actually, simpler approach — use `setTimeout` instead of `setInterval`:

```tsx
setPollMessage('Confirming your purchase...');
const messageTimer = setTimeout(() => {
  if (mountedRef.current) {
    setPollMessage(
      'Still confirming \u2014 this can take up to 30 seconds. Your purchase is safe.'
    );
  }
}, 10_000);
```

After the polling loop ends (before `setTopUpPolling(false)` at line 848), clear the timer:

```tsx
clearTimeout(messageTimer);
```

- [ ] **Step 3: Update JSX to use `pollMessage` instead of hardcoded string**

Replace the hardcoded `'Purchase processing...'` text in JSX (line 1314) with `{pollMessage}`.

- [ ] **Step 4: Run tests to verify nothing is broken**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage`

- [ ] **Step 5: Commit**

```
feat(mobile): two-stage polling progress messages for top-up [BILLING-09]
```

---

## Task 2: Improve timeout fallback alert copy

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx:850-866` (confirmed/timeout alerts)

- [ ] **Step 1: Update the test for the timeout case**

The existing tests don't cover the polling timeout case (purchase succeeds but credits don't appear). Add a test in `subscription.test.tsx` inside the `top-up flow` describe block:

```tsx
it('shows confident "Purchase confirmed" alert on polling timeout', async () => {
  setupPaidTierWithTopUp();
  mockMutateAsyncPurchase.mockResolvedValue({});
  // Usage never increases — simulates webhook delay
  mockUsage = {
    questionsUsedToday: 3,
    questionsRemainingToday: 7,
    monthlyQuestionsUsed: 30,
    monthlyQuestionsRemaining: 70,
    topUpCreditsRemaining: 0,
  };

  render(<SubscriptionScreen />, { wrapper: createWrapper() });
  fireEvent.press(screen.getByTestId('top-up-button'));

  // Fast-forward past all polling attempts
  await act(async () => {
    jest.advanceTimersByTime(40_000);
  });

  await waitFor(() => {
    expect(Alert.alert).toHaveBeenCalledWith(
      'Purchase confirmed',
      'Your 500 credits are being added. They usually appear within a minute \u2014 pull down to refresh your usage.',
      [{ text: 'OK' }]
    );
  });
});
```

Note: This test requires `jest.useFakeTimers()` — check if the test file already uses them. If not, they need to be added carefully (only for this test, with real timers restored after).

- [ ] **Step 2: Update the timeout alert in handleTopUp**

Replace lines 850-866:

```tsx
if (confirmed) {
  Alert.alert('Top-up', '500 additional credits have been added!');
} else {
  Alert.alert(
    'Purchase confirmed',
    'Your 500 credits are being added. They usually appear within a minute \u2014 pull down to refresh your usage.',
    [{ text: 'OK' }]
  );
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage`

- [ ] **Step 4: Commit**

```
feat(mobile): confident timeout copy for top-up polling [BILLING-09]
```

---

## Task 3: Handle missing top-up package gracefully

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx:772-785` (package lookup + error handling)
- Modify: `apps/mobile/src/app/(app)/subscription.test.tsx:58-63` (mock needs `isError` + `refetch`)
- Modify: `apps/mobile/src/app/(app)/subscription.test.tsx:958-973` (existing test update + new tests)

- [ ] **Step 1: Add `isError` and `refetch` to the useOfferings mock**

In subscription.test.tsx, add mock variables:

```tsx
let mockOfferingsError = false;
const mockRefetchOfferings = jest.fn();
```

Update the useOfferings mock to include them:

```tsx
useOfferings: () => ({
  data: mockOfferings,
  isLoading: mockOfferingsLoading,
  isError: mockOfferingsError,
  refetch: mockRefetchOfferings,
}),
```

Reset them in `beforeEach`:

```tsx
mockOfferingsError = false;
mockRefetchOfferings.mockClear();
```

- [ ] **Step 2: Update the existing "missing package" test**

The existing test at line 958 expects `Alert.alert('Error', 'Top-up package not available.')`. Update it to match the new graceful handling:

```tsx
it('shows graceful error when no topup package is in offerings', async () => {
  mockSubscription = { tier: 'plus', status: 'active' };
  mockOfferings = makeMockOfferings([makeMockPackage()]);

  render(<SubscriptionScreen />, { wrapper: createWrapper() });
  fireEvent.press(screen.getByTestId('top-up-button'));

  await waitFor(() => {
    expect(Alert.alert).toHaveBeenCalledWith(
      'Not available',
      "Top-up credits aren't available right now. Try again later or contact support.",
      expect.arrayContaining([
        expect.objectContaining({ text: 'Retry' }),
        expect.objectContaining({ text: 'OK' }),
      ])
    );
  });
});
```

- [ ] **Step 3: Add test for offerings error state**

```tsx
it('shows connection error with retry when offerings failed to load', async () => {
  mockSubscription = { tier: 'plus', status: 'active' };
  mockOfferings = null;
  mockOfferingsError = true;

  render(<SubscriptionScreen />, { wrapper: createWrapper() });
  fireEvent.press(screen.getByTestId('top-up-button'));

  await waitFor(() => {
    expect(Alert.alert).toHaveBeenCalledWith(
      'Connection error',
      "Couldn't load purchase options. Check your connection and try again.",
      expect.arrayContaining([
        expect.objectContaining({ text: 'Retry' }),
      ])
    );
  });
});
```

- [ ] **Step 4: Implement the graceful missing-package handling in handleTopUp**

Replace lines 772-785:

```tsx
const handleTopUp = useCallback(async () => {
  // If offerings are still loading, show spinner (button is disabled anyway)
  if (offeringsLoading) return;

  // If offerings failed to load, give a retry path
  if (offeringsError || !offerings) {
    Alert.alert(
      'Connection error',
      "Couldn't load purchase options. Check your connection and try again.",
      [
        {
          text: 'Retry',
          onPress: () => {
            void refetchOfferings();
          },
        },
        { text: 'OK', style: 'cancel' },
      ]
    );
    return;
  }

  // Find the top-up package from offerings
  const topUpOffering = offerings.all?.['top_up'] ?? offerings.current;
  const topUpPkg = topUpOffering?.availablePackages.find(
    (p) =>
      p.packageType === PACKAGE_TYPE.CUSTOM &&
      p.product.identifier.includes('topup')
  );

  if (!topUpPkg) {
    Alert.alert(
      'Not available',
      "Top-up credits aren't available right now. Try again later or contact support.",
      [
        {
          text: 'Retry',
          onPress: () => {
            void refetchOfferings();
          },
        },
        { text: 'OK', style: 'cancel' },
      ]
    );
    return;
  }

  // ... rest of handleTopUp continues unchanged
```

Update the dependency array to include `offeringsLoading`, `offeringsError`, `refetchOfferings`.

- [ ] **Step 5: Run tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage`

- [ ] **Step 6: Commit**

```
feat(mobile): graceful missing-package handling for top-up [BILLING-09]
```

---

## Task 4: Final verification

- [ ] **Step 1: Run typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

- [ ] **Step 2: Run lint**

Run: `pnpm exec nx lint mobile`

- [ ] **Step 3: Run full test suite for subscription**

Run: `cd apps/mobile && pnpm exec jest src/app/\(app\)/subscription.test.tsx --no-coverage --verbose`

- [ ] **Step 4: Final commit if any fixes needed**
