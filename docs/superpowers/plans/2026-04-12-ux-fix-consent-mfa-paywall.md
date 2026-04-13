# UX Fix: Async Consent, MFA Fallback, Child Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three approved UX fixes: ACCOUNT-20 (child enters parent email directly), AUTH-05 (backup_code MFA + SSO-aware unsupported messaging), BILLING-06 (child paywall gets progress + home buttons + warmer copy).

**Architecture:** All changes are confined to existing component files and their co-located tests. No new files, no schema changes, no API changes. The three specs are fully independent — implement them in any order, commit after each.

**Tech Stack:** React Native / Expo Router, @testing-library/react-native, @clerk/clerk-expo, react-native-purchases

---

## PART 1 — ACCOUNT-20: Async Child-to-Parent Consent Handoff

### Task 1: Update consent-copy.ts with new child-facing copy keys

**Files:**
- Modify: `apps/mobile/src/lib/consent-copy.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/app/consent.test.tsx` (inside `describe('ConsentScreen')`, before other tests):

```typescript
it('child view renders email input and submit button without handoff step', () => {
  render(<ConsentScreen />, { wrapper: Wrapper });

  expect(screen.getByTestId('consent-child-view')).toBeTruthy();
  expect(screen.getByText('Almost there!')).toBeTruthy();
  expect(screen.getByTestId('consent-email')).toBeTruthy();
  expect(screen.getByTestId('consent-submit')).toBeTruthy();
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/consent.tsx --no-coverage 2>&1 | tail -30
```

Expected: FAIL — "Almost there!" not found (current title is "One more step!")

- [ ] **Step 3: Add two new fields to `ConsentHandOffCopy` interface**

In `apps/mobile/src/lib/consent-copy.ts`, after line 16 (`handBackButton: string;`):

```typescript
export interface ConsentHandOffCopy {
  childTitle: string;
  childMessage: string;
  handOffButton: string;
  childSubmitButton: string;    // "Send link to my parent"
  parentIsHereButton: string;   // "My parent is here with me"
  parentTitle: string;
  parentEmailLabel: string;
  parentEmailPlaceholder: string;
  spamWarning: string;
  parentSubmitButton: string;
  successMessage: string;
  successSpamHint: string;
  handBackButton: string;
}
```

- [ ] **Step 4: Update the `learnerConsentHandOff` object**

Replace the existing `learnerConsentHandOff` constant:

```typescript
const learnerConsentHandOff: ConsentHandOffCopy = {
  childTitle: 'Almost there!',
  childMessage:
    "We need your parent or guardian to say it's OK. Enter their email and we'll send them a quick link.",
  handOffButton: "I'm the parent / guardian",
  childSubmitButton: 'Send link to my parent',
  parentIsHereButton: 'My parent is here with me',
  parentTitle: 'Parental Consent Required',
  parentEmailLabel: 'Your email address',
  parentEmailPlaceholder: 'you@example.com',
  spamWarning:
    "We'll send a one-time consent link. Check your spam folder if you don't see it within a few minutes.",
  parentSubmitButton: 'Send consent link',
  successMessage: 'Link sent!',
  successSpamHint:
    'Check your inbox (and spam folder). The link expires in 7 days.',
  handBackButton: 'Got it',
};
```

- [ ] **Step 5: Update the `defaultConsentHandOff` object**

Add the two new keys to the `defaultConsentHandOff` constant (values for non-learner variant):

```typescript
const defaultConsentHandOff: ConsentHandOffCopy = {
  childTitle: 'Parental consent required',
  childMessage:
    'A parent or guardian needs to approve this account. Please hand this device to them.',
  handOffButton: "I'm the parent / guardian",
  childSubmitButton: 'Send consent link',
  parentIsHereButton: 'My parent is here with me',
  parentTitle: 'Parental Consent Required',
  parentEmailLabel: 'Your email address',
  parentEmailPlaceholder: 'you@example.com',
  spamWarning:
    "We'll send a one-time consent link. Check your spam folder if you don't see it within a few minutes.",
  parentSubmitButton: 'Send consent link',
  successMessage: 'Consent link sent!',
  successSpamHint:
    'Check your inbox (and spam folder). The link expires in 7 days.',
  handBackButton: 'Done',
};
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep consent
```

Expected: no errors (consent-copy.ts is clean)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/lib/consent-copy.ts
git commit -m "feat(consent): add childSubmitButton + parentIsHereButton copy keys [ACCOUNT-20]"
```

---

### Task 2: Restructure consent.tsx — child enters email directly

**Files:**
- Modify: `apps/mobile/src/app/consent.tsx`

- [ ] **Step 1: Update `canSubmit` to allow submission from child phase**

In `apps/mobile/src/app/consent.tsx`, replace the `canSubmit` constant (around line 108):

```typescript
// Before:
const canSubmit =
  isValidEmail &&
  !isSameAsChild &&
  !isPending &&
  !isTransitioning &&
  phase === 'parent' &&
  !isOffline;

// After:
const canSubmit =
  isValidEmail &&
  !isSameAsChild &&
  !isPending &&
  !isTransitioning &&
  (phase === 'child' || phase === 'parent') &&
  !isOffline;
```

- [ ] **Step 2: Replace the child phase JSX**

Replace the entire `{phase === 'child' && (...)}` block (currently ~lines 182–197) with:

```tsx
{phase === 'child' && (
  <View testID="consent-child-view">
    <Text className="text-h1 font-bold text-text-primary mb-4">
      {copy.childTitle}
    </Text>
    <Text className="text-body text-text-secondary mb-6">
      {copy.childMessage}
    </Text>

    {error !== '' && (
      <View
        className="bg-danger/10 rounded-card px-4 py-3 mb-4"
        accessibilityRole="alert"
      >
        <Text
          className="text-danger text-body-sm"
          testID="consent-error"
        >
          {error}
        </Text>
      </View>
    )}

    <View onLayout={onFieldLayout('email')}>
      <Text className="text-body-sm font-semibold text-text-secondary mb-1">
        {copy.parentEmailLabel}
      </Text>
      <TextInput
        className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-2"
        placeholder={copy.parentEmailPlaceholder}
        placeholderTextColor={colors.muted}
        value={parentEmail}
        onChangeText={setParentEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        editable={!isPending}
        testID="consent-email"
        onFocus={onFieldFocus('email')}
      />
      {isSameAsChild && (
        <Text
          className="text-danger text-body-sm mb-1"
          testID="consent-same-email-warning"
          accessibilityRole="alert"
        >
          This is your own email. Please enter a parent or
          guardian&apos;s email address.
        </Text>
      )}
      <Text className="text-body-sm text-text-secondary mb-6">
        {copy.spamWarning}
      </Text>
    </View>

    <Button
      variant="primary"
      label={copy.childSubmitButton}
      onPress={onSubmit}
      disabled={!canSubmit}
      loading={isPending}
      testID="consent-submit"
    />
    <View className="flex-row justify-center mt-4">
      <Button
        variant="tertiary"
        size="small"
        label={copy.parentIsHereButton}
        onPress={() => transitionToPhase('parent')}
        testID="consent-handoff-button"
      />
    </View>
  </View>
)}
```

- [ ] **Step 3: Update success phase — new copy and CTA**

Replace the success phase JSX (currently ~lines 266–320) with:

```tsx
{phase === 'success' && (
  <View testID="consent-success">
    <Text className="text-h1 font-bold text-text-primary mb-4">
      {deliveryState === 'sent'
        ? copy.successMessage
        : "We couldn't confirm delivery yet"}
    </Text>
    <Text className="text-body text-text-primary mb-2">
      {deliveryState === 'sent' ? (
        <>
          Your parent will get an email at{' '}
          <Text className="font-semibold">{parentEmail}</Text>
          {'. '}
          We&apos;ll let you know as soon as they approve.
        </>
      ) : (
        <>
          We could not confirm that the consent email reached{' '}
          <Text className="font-semibold">{parentEmail}</Text>. Please
          double-check the address and try again.
        </>
      )}
    </Text>
    <Text className="text-body text-text-secondary mb-8">
      {deliveryState !== 'sent'
        ? 'You can resend the request now or go back and enter a different email address.'
        : ''}
    </Text>
    <Button
      variant="primary"
      label={
        deliveryState === 'sent' ? copy.handBackButton : 'Go back'
      }
      onPress={() =>
        deliveryState === 'sent'
          ? router.back()
          : transitionToPhase('parent')
      }
      testID="consent-done"
    />
    {resendError ? (
      <Text className="text-sm text-red-400 text-center mt-4 mb-1">
        {resendError}
      </Text>
    ) : null}
    <View className="flex-row justify-center mt-4">
      <Button
        variant="tertiary"
        size="small"
        label="Resend email"
        onPress={onResendEmail}
        loading={resending}
        testID="consent-resend-email"
      />
    </View>
  </View>
)}
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep consent
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/consent.tsx
git commit -m "feat(consent): child enters parent email directly, no phone handoff [ACCOUNT-20]"
```

---

### Task 3: Update consent.test.tsx

**Files:**
- Modify: `apps/mobile/src/app/consent.test.tsx`

- [ ] **Step 1: Add `@clerk/clerk-expo` mock for same-email validation**

After the existing `jest.mock('react-native-reanimated', ...)` block, add:

```typescript
let mockChildEmail: string | undefined = undefined;

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: mockChildEmail
      ? {
          primaryEmailAddress: { emailAddress: mockChildEmail },
        }
      : null,
  }),
}));
```

Also add `mockChildEmail = undefined;` to the `beforeEach` block.

- [ ] **Step 2: Update the existing test that checks child view copy**

Replace test at `'renders child view by default with hand-off message and button'`:

```typescript
it('renders child view by default with "Almost there!" heading and email input', () => {
  render(<ConsentScreen />, { wrapper: Wrapper });

  expect(screen.getByTestId('consent-child-view')).toBeTruthy();
  expect(screen.getByText('Almost there!')).toBeTruthy();
  expect(
    screen.getByText(
      "We need your parent or guardian to say it's OK. Enter their email and we'll send them a quick link."
    )
  ).toBeTruthy();
  expect(screen.getByTestId('consent-email')).toBeTruthy();
  expect(screen.getByTestId('consent-submit')).toBeTruthy();
});
```

- [ ] **Step 3: Replace the test that checked email input was ABSENT in child view**

Replace `'does not show email input or submit button in child view'` with:

```typescript
it('disables submit button in child view when email is empty', () => {
  render(<ConsentScreen />, { wrapper: Wrapper });

  const button = screen.getByTestId('consent-submit');
  expect(
    button.props.accessibilityState?.disabled ?? button.props.disabled
  ).toBeTruthy();
});
```

- [ ] **Step 4: Add test — child submits email directly (new primary flow)**

```typescript
it('child can enter parent email and submit directly without phone handoff', async () => {
  mockMutateAsync.mockResolvedValue({
    message: 'Consent request sent',
    consentType: 'GDPR',
    emailStatus: 'sent',
  });

  render(<ConsentScreen />, { wrapper: Wrapper });

  // Child fills email directly in child view — no handoff step
  fireEvent.changeText(
    screen.getByTestId('consent-email'),
    'parent@example.com'
  );

  const button = screen.getByTestId('consent-submit');
  expect(
    button.props.accessibilityState?.disabled ?? button.props.disabled
  ).toBeFalsy();

  fireEvent.press(button);

  await waitFor(() => {
    expect(mockMutateAsync).toHaveBeenCalledWith({
      childProfileId: '550e8400-e29b-41d4-a716-446655440000',
      parentEmail: 'parent@example.com',
      consentType: 'GDPR',
    });
  });

  flushFadeAnimation();
  expect(screen.getByTestId('consent-success')).toBeTruthy();
});
```

- [ ] **Step 5: Add test — same-email warning shown in child phase**

```typescript
it('shows same-email warning when child enters their own email', () => {
  mockChildEmail = 'child@example.com';

  render(<ConsentScreen />, { wrapper: Wrapper });

  fireEvent.changeText(
    screen.getByTestId('consent-email'),
    'child@example.com'
  );

  expect(screen.getByTestId('consent-same-email-warning')).toBeTruthy();
  const button = screen.getByTestId('consent-submit');
  expect(
    button.props.accessibilityState?.disabled ?? button.props.disabled
  ).toBeTruthy();
});
```

- [ ] **Step 6: Add test — "My parent is here" link transitions to parent phase**

```typescript
it('"My parent is here with me" link transitions to parent phase', () => {
  render(<ConsentScreen />, { wrapper: Wrapper });

  fireEvent.press(screen.getByTestId('consent-handoff-button'));
  flushFadeAnimation();

  expect(screen.getByTestId('consent-parent-view')).toBeTruthy();
  expect(screen.queryByTestId('consent-child-view')).toBeNull();
});
```

- [ ] **Step 7: Add test — success shows "Link sent" and parent email**

```typescript
it('success phase shows "Link sent!" message with parent email', async () => {
  mockMutateAsync.mockResolvedValue({
    message: 'Consent request sent',
    consentType: 'GDPR',
    emailStatus: 'sent',
  });

  render(<ConsentScreen />, { wrapper: Wrapper });

  fireEvent.changeText(
    screen.getByTestId('consent-email'),
    'mum@example.com'
  );
  fireEvent.press(screen.getByTestId('consent-submit'));

  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  flushFadeAnimation();

  expect(screen.getByText('Link sent!')).toBeTruthy();
  expect(screen.getByText(/mum@example\.com/)).toBeTruthy();
});
```

- [ ] **Step 8: Add test — "Got it" button calls router.back()**

```typescript
it('"Got it" button calls router.back() to reach consent pending gate', async () => {
  mockMutateAsync.mockResolvedValue({
    message: 'Consent request sent',
    consentType: 'GDPR',
    emailStatus: 'sent',
  });

  render(<ConsentScreen />, { wrapper: Wrapper });

  fireEvent.changeText(
    screen.getByTestId('consent-email'),
    'parent@example.com'
  );
  fireEvent.press(screen.getByTestId('consent-submit'));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
  flushFadeAnimation();

  fireEvent.press(screen.getByTestId('consent-done'));
  expect(mockBack).toHaveBeenCalled();
});
```

- [ ] **Step 9: Run tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/consent.tsx --no-coverage 2>&1 | tail -40
```

Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/app/consent.test.tsx
git commit -m "test(consent): update tests for child-direct email entry flow [ACCOUNT-20]"
```

---

## PART 2 — AUTH-05: Unsupported MFA Method Recovery

### Task 4: Add backup_code types, guards, and SSO helper to sign-in.tsx

**Files:**
- Modify: `apps/mobile/src/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/app/(auth)/sign-in.test.tsx`, inside `describe('SignInScreen')`:

```typescript
it('shows backup_code entry form when backup_code is only supported second factor', async () => {
  mockCreate.mockResolvedValue({
    status: 'needs_second_factor',
    createdSessionId: null,
    supportedSecondFactors: [{ strategy: 'backup_code' }],
  });

  render(<SignInScreen />);
  fireEvent.changeText(screen.getByTestId('sign-in-email'), 'test@example.com');
  fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
  fireEvent.press(screen.getByTestId('sign-in-button'));

  await waitFor(() => {
    expect(screen.getByText('Enter a backup code')).toBeTruthy();
  });
  expect(screen.getByTestId('sign-in-verify-code')).toBeTruthy();
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(auth\)/sign-in.tsx --no-coverage 2>&1 | tail -30
```

Expected: FAIL — "Enter a backup code" not found (falls through to unsupported message)

- [ ] **Step 3: Add `BackupCodeFactor` type and guard**

In `apps/mobile/src/app/(auth)/sign-in.tsx`, after the `TotpFactor` type (~line 82):

```typescript
type BackupCodeFactor = {
  strategy: 'backup_code';
};
```

After `isTotpFactor` (~line 117):

```typescript
function isBackupCodeFactor(factor: unknown): factor is BackupCodeFactor {
  return (
    typeof factor === 'object' &&
    factor !== null &&
    'strategy' in factor &&
    factor.strategy === 'backup_code'
  );
}
```

- [ ] **Step 4: Add `backup_code` to the `VerificationState` union type**

In the `VerificationState` type (~line 49), add:

```typescript
type VerificationState =
  | {
      stage: VerificationStage;
      strategy: 'email_code';
      identifier: string;
      emailAddressId: string;
    }
  | {
      stage: VerificationStage;
      strategy: 'phone_code';
      identifier: string;
      phoneNumberId?: string;
    }
  | {
      stage: VerificationStage;
      strategy: 'totp';
    }
  | {
      stage: VerificationStage;
      strategy: 'backup_code';
    };
```

- [ ] **Step 5: Add `hasSSOProviders` helper**

After `getFactorStrategies` (~line 132):

```typescript
function hasSSOProviders(factors: unknown[] | null | undefined): boolean {
  return (factors ?? []).some(
    (f) =>
      typeof f === 'object' &&
      f !== null &&
      'strategy' in f &&
      typeof (f as Record<string, unknown>).strategy === 'string' &&
      ((f as Record<string, unknown>).strategy as string).startsWith('oauth_')
  );
}
```

- [ ] **Step 6: Update `formatUnsupportedVerificationMessage` for SSO-aware messaging**

Replace the existing `formatUnsupportedVerificationMessage` function (~line 149):

```typescript
function formatUnsupportedVerificationMessage(strategies: string[]): string {
  if (strategies.length === 0) {
    return 'This account needs an additional verification method that is not available on mobile yet.';
  }

  if (strategies.length === 1) {
    return `This account requires ${describeVerificationStrategy(
      strategies[0]!
    )} which isn't available on mobile yet.`;
  }

  const described = strategies.map(describeVerificationStrategy);
  const last = described.pop();
  return `This account requires ${described.join(
    ', '
  )} or ${last} which isn't available on mobile yet.`;
}
```

- [ ] **Step 7: Add `unsupportedHasSSOProviders` state**

In the component's state declarations (~line 186), add after `unsupportedVerificationStrategies`:

```typescript
const [unsupportedHasSSOProviders, setUnsupportedHasSSOProviders] =
  useState(false);
```

- [ ] **Step 8: Update `clearVerificationFlow` to reset the SSO state**

In `clearVerificationFlow` (~line 249), add `setUnsupportedHasSSOProviders(false);`:

```typescript
const clearVerificationFlow = useCallback(
  (clearError = false) => {
    setVerificationOffer(null);
    setPendingVerification(null);
    setUnsupportedVerificationStrategies([]);
    setUnsupportedHasSSOProviders(false);
    setCode('');
    setPendingSessionActivationId(null);
    setActivationFailureContext(null);
    if (clearError) {
      setError('');
    }
  },
  [setError]
);
```

- [ ] **Step 9: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep sign-in
```

Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/app/\(auth\)/sign-in.tsx
git commit -m "feat(auth): add BackupCodeFactor type, hasSSOProviders helper, SSO-aware unsupported message [AUTH-05]"
```

---

### Task 5: Add backup_code to getVerificationStep + startVerificationFlow + handleIncompleteSignIn

**Files:**
- Modify: `apps/mobile/src/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Update `getVerificationStep` to check backup_code as 4th fallback**

In `getVerificationStep` (~line 271), after the `phoneFactor` block and before the closing `return null;`:

```typescript
// Current end of needs_second_factor block:
const phoneFactor =
  attempt.supportedSecondFactors?.find(isPhoneCodeFactor) ?? null;
if (phoneFactor) {
  return {
    stage: 'second_factor',
    strategy: 'phone_code',
    identifier: phoneFactor.safeIdentifier ?? 'your phone',
    phoneNumberId: phoneFactor.phoneNumberId,
  } as const;
}

// ADD THIS after phoneFactor block:
const backupCodeFactor =
  attempt.supportedSecondFactors?.find(isBackupCodeFactor) ?? null;
if (backupCodeFactor) {
  return {
    stage: 'second_factor',
    strategy: 'backup_code',
  } as const;
}
```

- [ ] **Step 2: Update `startVerificationFlow` to skip prepare for backup_code (same as totp)**

In `startVerificationFlow` (~line 328), update the condition:

```typescript
// Before:
if (step.strategy !== 'totp') {

// After:
if (step.strategy !== 'totp' && step.strategy !== 'backup_code') {
```

- [ ] **Step 3: Update `handleIncompleteSignIn` to set SSO state and use new message format**

In `handleIncompleteSignIn` (~line 402), replace the unsupported-method error setting:

```typescript
// Before:
const unsupportedStrategies = getFactorStrategies(
  attempt.status === 'needs_first_factor'
    ? attempt.supportedFirstFactors
    : attempt.supportedSecondFactors
);
setUnsupportedVerificationStrategies(unsupportedStrategies);
setError(
  `${formatUnsupportedVerificationMessage(
    unsupportedStrategies
  )} Try Google or Apple if you use them on this account, or contact support for help.`
);

// After:
const unsupportedStrategies = getFactorStrategies(
  attempt.status === 'needs_first_factor'
    ? attempt.supportedFirstFactors
    : attempt.supportedSecondFactors
);
const ssoAvailable = hasSSOProviders(attempt.supportedFirstFactors);
setUnsupportedVerificationStrategies(unsupportedStrategies);
setUnsupportedHasSSOProviders(ssoAvailable);
setError(formatUnsupportedVerificationMessage(unsupportedStrategies));
```

- [ ] **Step 4: Run tests to check nothing new breaks**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(auth\)/sign-in.tsx --no-coverage 2>&1 | tail -30
```

Expected: the new backup_code test should now PASS; existing tests may show updated error text (expected — will fix in task 7)

- [ ] **Step 5: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep sign-in
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/\(auth\)/sign-in.tsx
git commit -m "feat(auth): backup_code in getVerificationStep + skip prepare + SSO detection in handleIncompleteSignIn [AUTH-05]"
```

---

### Task 6: Update sign-in.tsx JSX for backup_code and SSO-aware help block

**Files:**
- Modify: `apps/mobile/src/app/(auth)/sign-in.tsx`

- [ ] **Step 1: Update `onResendCode` to no-op for backup_code**

In `onResendCode` (~line 760), the `backup_code` branch will naturally fall through (no API call) since no `if` matches it. However, to prevent the spinner showing unnecessarily, add an early return after the `if (!isLoaded || !signIn || !pendingVerification || resending) return;` guard:

After the existing guard line, before `setError(''); setResending(true);`:

```typescript
// backup_code has no resend — codes are static (same as totp)
if (pendingVerification.strategy === 'backup_code') return;
```

- [ ] **Step 2: Update verification screen heading for backup_code**

In the `pendingVerification` JSX block (~line 835), replace the heading Text:

```tsx
<Text className="text-h2 font-bold text-text-primary mb-1">
  {pendingVerification.strategy === 'totp'
    ? 'Enter authenticator code'
    : pendingVerification.strategy === 'backup_code'
    ? 'Enter a backup code'
    : 'Enter verification code'}
</Text>
```

- [ ] **Step 3: Update verification screen body text for backup_code**

Replace the body Text (~line 840):

```tsx
<Text className="text-body-sm text-text-secondary mb-6">
  {pendingVerification.strategy === 'totp' ? (
    'Open your authenticator app and enter the 6-digit code.'
  ) : pendingVerification.strategy === 'backup_code' ? (
    'Enter one of the backup codes you saved when you set up two-factor authentication.'
  ) : (
    <>
      We sent a verification code to{' '}
      <Text
        className="text-body-sm text-text-secondary font-semibold"
        numberOfLines={1}
        ellipsizeMode="middle"
      >
        {pendingVerification.identifier}
      </Text>
    </>
  )}
</Text>
```

- [ ] **Step 4: Change code input keyboard type to default for backup_code**

Replace the `TextInput` for code (~line 870):

```tsx
<TextInput
  className="bg-surface text-text-primary text-body rounded-input px-4 py-3 mb-6"
  placeholder={
    pendingVerification.strategy === 'backup_code'
      ? 'Enter backup code'
      : 'Enter 6-digit code'
  }
  placeholderTextColor={colors.muted}
  keyboardType={
    pendingVerification.strategy === 'backup_code'
      ? 'default'
      : 'number-pad'
  }
  autoCapitalize="none"
  value={code}
  onChangeText={setCode}
  editable={!loading}
  testID="sign-in-verify-code"
  onFocus={onVerifyFieldFocus('code')}
/>
```

- [ ] **Step 5: Hide "Resend code" button for backup_code**

Update the resend button condition (~line 906):

```tsx
{pendingVerification.strategy !== 'totp' &&
  pendingVerification.strategy !== 'backup_code' && (
    <View className="flex-row justify-center mt-4">
      <Button
        variant="tertiary"
        size="small"
        label="Resend code"
        onPress={onResendCode}
        loading={resending}
        testID="sign-in-resend-code"
      />
    </View>
  )}
```

- [ ] **Step 6: Update the unsupported factor help block JSX (~line 978)**

Replace the `{unsupportedVerificationStrategies.length > 0 && (...)}` block:

```tsx
{unsupportedVerificationStrategies.length > 0 && (
  <View
    className="bg-surface rounded-card px-4 py-4 mb-4"
    testID="sign-in-unsupported-factor-help"
  >
    <Text className="text-body-sm text-text-secondary">
      {unsupportedHasSSOProviders
        ? "If this account also uses Google or Apple sign-in, try that above. If that doesn't work, contact support."
        : `Contact support and we'll help you sign in. Mention: ${unsupportedVerificationStrategies
            .map(describeVerificationStrategy)
            .join(', ')}.`}
    </Text>
    <View className="mt-4">
      <Button
        variant="secondary"
        size="small"
        label="Contact support"
        onPress={() => void onContactSupport()}
        testID="sign-in-contact-support"
      />
    </View>
  </View>
)}
```

- [ ] **Step 7: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep sign-in
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/app/\(auth\)/sign-in.tsx
git commit -m "feat(auth): backup_code UI + SSO-aware unsupported help block [AUTH-05]"
```

---

### Task 7: Update sign-in.test.tsx for backup_code + SSO-aware messaging

**Files:**
- Modify: `apps/mobile/src/app/(auth)/sign-in.test.tsx`

- [ ] **Step 1: Update existing test that checks old unsupported-method error text**

The existing test `'shows unsupported message for unknown MFA methods'` (~line 487) checks for the old full concatenated message. Update the expected text:

```typescript
it('shows unsupported message for unknown MFA methods (no SSO available)', async () => {
  mockCreate.mockResolvedValue({
    status: 'needs_second_factor',
    createdSessionId: null,
    supportedSecondFactors: [{ strategy: 'webauthn' }],
    supportedFirstFactors: [], // no SSO providers
  });

  render(<SignInScreen />);

  fireEvent.changeText(screen.getByTestId('sign-in-email'), 'test@example.com');
  fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
  fireEvent.press(screen.getByTestId('sign-in-button'));

  await waitFor(() => {
    expect(
      screen.getByText(
        "This account requires a security key or passkey which isn't available on mobile yet."
      )
    ).toBeTruthy();
  });

  expect(screen.getByTestId('sign-in-unsupported-factor-help')).toBeTruthy();
  // No SSO providers: help text should NOT mention "Google or Apple"
  expect(screen.queryByText(/Google or Apple/)).toBeNull();
});
```

- [ ] **Step 2: Add test — backup_code entry and successful verification**

```typescript
it('successfully verifies with backup_code strategy', async () => {
  mockCreate.mockResolvedValue({
    status: 'needs_second_factor',
    createdSessionId: null,
    supportedSecondFactors: [{ strategy: 'backup_code' }],
  });
  mockAttemptSecondFactor.mockResolvedValue({
    status: 'complete',
    createdSessionId: 'sess_backup_ok',
  });
  mockSetActive.mockResolvedValue(undefined);

  render(<SignInScreen />);

  fireEvent.changeText(screen.getByTestId('sign-in-email'), 'test@example.com');
  fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
  fireEvent.press(screen.getByTestId('sign-in-button'));

  await waitFor(() => {
    expect(screen.getByText('Enter a backup code')).toBeTruthy();
  });

  // Body text
  expect(
    screen.getByText(
      'Enter one of the backup codes you saved when you set up two-factor authentication.'
    )
  ).toBeTruthy();
  // No resend button
  expect(screen.queryByTestId('sign-in-resend-code')).toBeNull();

  fireEvent.changeText(screen.getByTestId('sign-in-verify-code'), 'ABCD1234');
  fireEvent.press(screen.getByTestId('sign-in-verify-button'));

  await waitFor(() => {
    expect(mockAttemptSecondFactor).toHaveBeenCalledWith({
      strategy: 'backup_code',
      code: 'ABCD1234',
    });
  });

  await waitFor(() => {
    expect(mockSetActive).toHaveBeenCalledWith({ session: 'sess_backup_ok' });
  });
});
```

- [ ] **Step 3: Add test — SSO-aware help text when SSO providers are linked**

```typescript
it('shows SSO suggestion in help block when account has SSO providers linked', async () => {
  mockCreate.mockResolvedValue({
    status: 'needs_second_factor',
    createdSessionId: null,
    supportedSecondFactors: [{ strategy: 'webauthn' }],
    supportedFirstFactors: [
      { strategy: 'oauth_google' },
      { strategy: 'password' },
    ],
  });

  render(<SignInScreen />);

  fireEvent.changeText(screen.getByTestId('sign-in-email'), 'test@example.com');
  fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
  fireEvent.press(screen.getByTestId('sign-in-button'));

  await waitFor(() => {
    expect(screen.getByTestId('sign-in-unsupported-factor-help')).toBeTruthy();
  });

  expect(screen.getByText(/Google or Apple/)).toBeTruthy();
});
```

- [ ] **Step 4: Add test — backup_code prioritised over no-supported-factor path**

```typescript
it('uses backup_code when available before falling back to unsupported message', async () => {
  mockCreate.mockResolvedValue({
    status: 'needs_second_factor',
    createdSessionId: null,
    supportedSecondFactors: [
      { strategy: 'webauthn' },
      { strategy: 'backup_code' },
    ],
  });

  render(<SignInScreen />);

  fireEvent.changeText(screen.getByTestId('sign-in-email'), 'test@example.com');
  fireEvent.changeText(screen.getByTestId('sign-in-password'), 'password123');
  fireEvent.press(screen.getByTestId('sign-in-button'));

  // Should show backup code entry, not the unsupported message
  await waitFor(() => {
    expect(screen.getByText('Enter a backup code')).toBeTruthy();
  });
  expect(screen.queryByTestId('sign-in-unsupported-factor-help')).toBeNull();
});
```

- [ ] **Step 5: Run all sign-in tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(auth\)/sign-in.tsx --no-coverage 2>&1 | tail -40
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/\(auth\)/sign-in.test.tsx
git commit -m "test(auth): backup_code flow + SSO-aware unsupported message tests [AUTH-05]"
```

---

## PART 3 — BILLING-06: Child Paywall Recovery Actions

### Task 8: Update ChildPaywall component in subscription.tsx

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.tsx`

- [ ] **Step 1: Write the failing test**

Add to `apps/mobile/src/app/(app)/subscription.test.tsx`, in a new `describe('ChildPaywall')` block:

```typescript
describe('ChildPaywall', () => {
  beforeEach(() => {
    mockActiveProfile = {
      id: 'child-1',
      displayName: 'Alex',
      isOwner: false,
    };
    mockSubscription = undefined;
    mockSubLoading = false;
    mockSubError = false;
  });

  it('renders "See your progress" and "Go Home" buttons', () => {
    render(<SubscriptionScreen />, { wrapper: createWrapper() });

    expect(screen.getByTestId('child-paywall')).toBeTruthy();
    expect(screen.getByTestId('see-progress-button')).toBeTruthy();
    expect(screen.getByTestId('go-home-button')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `see-progress-button` not found

- [ ] **Step 3: Update the stats text and remove `hasStats` conditional**

In `apps/mobile/src/app/(app)/subscription.tsx`, in the `ChildPaywall` component, replace:

```tsx
// Before (~line 419):
<Text className="text-body text-text-secondary mb-2 text-center">
  {hasStats
    ? `You learned ${topicsLearned} topic${
        topicsLearned !== 1 ? 's' : ''
      } and earned ${totalXp} XP \u2014 keep going!`
    : "You've been making great progress \u2014 keep going!"}
</Text>

// After:
<Text className="text-body text-text-secondary mb-2 text-center">
  {topicsLearned > 0 || totalXp > 0
    ? `You learned ${topicsLearned} topic${
        topicsLearned !== 1 ? 's' : ''
      } and earned ${totalXp} XP \u2014 great work!`
    : "You've been exploring and learning \u2014 great start!"}
</Text>
```

Also remove the `const hasStats = topicsLearned > 0 || totalXp > 0;` line (~line 396) since it's no longer used.

- [ ] **Step 4: Update "while you wait" copy to be conditional on notification sent**

Replace the static "While you wait" Text (~line 466):

```tsx
// Before:
<Text className="text-body-sm text-text-secondary text-center mb-6">
  While you wait, you can still browse your Library and see your
  progress.
</Text>

// After:
{isNotified ? (
  <Text
    className="text-body-sm text-text-secondary text-center mb-4"
    testID="notified-explore-text"
  >
    Your parent has been notified! While you wait, you can still explore:
  </Text>
) : (
  <Text className="text-body-sm text-text-secondary text-center mb-4">
    While you wait, you can still browse your Library and see your
    progress.
  </Text>
)}
```

- [ ] **Step 5: Add "See your progress" and "Go Home" buttons after Browse Library**

Replace the Browse Library Pressable (~line 471) and add the two new buttons after it:

```tsx
<Pressable
  onPress={() => router.push('/(app)/library')}
  className="bg-surface rounded-button py-3.5 px-8 items-center w-full mb-2"
  testID="browse-library-button"
  accessibilityRole="button"
  accessibilityLabel="Browse Library"
>
  <Text className="text-body font-semibold text-primary">
    Browse Library
  </Text>
</Pressable>

<Pressable
  onPress={() => router.push('/(app)/progress')}
  className="bg-surface rounded-button py-3.5 px-8 items-center w-full mb-2"
  testID="see-progress-button"
  accessibilityRole="button"
  accessibilityLabel="See your progress"
>
  <Text className="text-body font-semibold text-primary">
    See your progress
  </Text>
</Pressable>

<Pressable
  onPress={() => router.push('/(app)/home')}
  className="bg-surface rounded-button py-3.5 px-8 items-center w-full"
  testID="go-home-button"
  accessibilityRole="button"
  accessibilityLabel="Go Home"
>
  <Text className="text-body font-semibold text-primary">
    Go Home
  </Text>
</Pressable>
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep subscription
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/\(app\)/subscription.tsx
git commit -m "feat(billing): child paywall adds progress + home buttons + warmer copy [BILLING-06]"
```

---

### Task 9: Add child paywall tests to subscription.test.tsx

**Files:**
- Modify: `apps/mobile/src/app/(app)/subscription.test.tsx`

- [ ] **Step 1: Make `useXpSummary` mock controllable**

In `apps/mobile/src/app/(app)/subscription.test.tsx`, replace the static mock:

```typescript
// Before:
jest.mock('../../hooks/use-streaks', () => ({
  useXpSummary: () => ({ data: undefined }),
}));

// After:
let mockXpSummary: { topicsCompleted?: number; totalXp?: number } | undefined =
  undefined;

jest.mock('../../hooks/use-streaks', () => ({
  useXpSummary: () => ({ data: mockXpSummary }),
}));
```

Add `mockXpSummary = undefined;` to the main `beforeEach` block.

- [ ] **Step 2: Add "Go Home" test in the ChildPaywall describe block**

Inside `describe('ChildPaywall')`:

```typescript
it('"Go Home" button navigates to /(app)/home', () => {
  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  fireEvent.press(screen.getByTestId('go-home-button'));
  expect(mockPush).toHaveBeenCalledWith('/(app)/home');
});

it('"See your progress" button navigates to /(app)/progress', () => {
  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  fireEvent.press(screen.getByTestId('see-progress-button'));
  expect(mockPush).toHaveBeenCalledWith('/(app)/progress');
});

it('"Browse Library" button navigates to /(app)/library', () => {
  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  fireEvent.press(screen.getByTestId('browse-library-button'));
  expect(mockPush).toHaveBeenCalledWith('/(app)/library');
});
```

- [ ] **Step 3: Add XP stats text tests**

Inside `describe('ChildPaywall')`:

```typescript
it('shows "great start" text when child has no XP data', () => {
  mockXpSummary = undefined;

  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  expect(
    screen.getByText("You've been exploring and learning \u2014 great start!")
  ).toBeTruthy();
});

it('shows XP stats with "great work" when child has completed topics and XP', () => {
  mockXpSummary = { topicsCompleted: 5, totalXp: 250 };

  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  expect(
    screen.getByText('You learned 5 topics and earned 250 XP \u2014 great work!')
  ).toBeTruthy();
});

it('shows singular "topic" when topicsCompleted is 1', () => {
  mockXpSummary = { topicsCompleted: 1, totalXp: 50 };

  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  expect(
    screen.getByText('You learned 1 topic and earned 50 XP \u2014 great work!')
  ).toBeTruthy();
});
```

- [ ] **Step 4: Add warmer copy test after notification**

Inside `describe('ChildPaywall')`:

```typescript
it('shows warmer "parent has been notified" message after notification is sent', async () => {
  const mockNotify = jest.fn().mockResolvedValue({ sent: true, rateLimited: false });
  // Override the notify mock for this test
  jest.spyOn(
    require('../../hooks/use-settings'),
    'useNotifyParentSubscribe'
  ).mockReturnValue({ mutateAsync: mockNotify, isPending: false });

  render(<SubscriptionScreen />, { wrapper: createWrapper() });

  fireEvent.press(screen.getByTestId('notify-parent-button'));

  await waitFor(() => {
    expect(screen.getByTestId('notified-explore-text')).toBeTruthy();
  });

  expect(
    screen.getByText(
      'Your parent has been notified! While you wait, you can still explore:'
    )
  ).toBeTruthy();
});
```

- [ ] **Step 5: Run all subscription tests**

```bash
cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\(app\)/subscription.tsx --no-coverage 2>&1 | tail -40
```

Expected: ALL PASS

- [ ] **Step 6: Final typecheck across all touched files**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/app/\(app\)/subscription.test.tsx
git commit -m "test(billing): child paywall navigation, XP stats, notification copy tests [BILLING-06]"
```

---

## Self-Review

### Spec Coverage Check

| Spec | Requirement | Task |
|------|-------------|------|
| ACCOUNT-20 | Child enters parent email directly | Task 2 |
| ACCOUNT-20 | "My parent is here" secondary link | Task 2 |
| ACCOUNT-20 | Same-email validation | Task 2 (copy from parent phase) |
| ACCOUNT-20 | Updated success copy | Task 2 |
| ACCOUNT-20 | "Got it" → router.back() | Task 2 |
| AUTH-05 | backup_code strategy support | Tasks 4, 5 |
| AUTH-05 | backup_code UI (heading, body, no resend) | Task 6 |
| AUTH-05 | SSO-aware unsupported messaging | Tasks 5, 6 |
| BILLING-06 | "See your progress" button | Task 8 |
| BILLING-06 | "Go Home" button | Task 8 |
| BILLING-06 | Warmer post-notification copy | Task 8 |
| BILLING-06 | Always-show stats with fallback | Task 8 |

### Type Consistency Check

- `BackupCodeFactor` defined in Task 4, used in `isBackupCodeFactor` (Task 4) and `getVerificationStep` (Task 5) ✓
- `VerificationState` union updated in Task 4, affects `startVerificationFlow` (Task 5) and JSX (Task 6) ✓
- `childSubmitButton` / `parentIsHereButton` added to interface in Task 1, used in consent.tsx Task 2 ✓
- `unsupportedHasSSOProviders` state added Task 4, set in Task 5, read in Task 6 ✓

### Placeholder Scan

No TBD, TODO, or placeholder patterns found.
