# Account Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Account Security" section to the settings screen with email-based 2FA toggle and password change, visible only to account owners, with SSO-aware adaptive UI.

**Architecture:** Client-only via Clerk SDK — no new API routes. Two new components (`AccountSecurity`, `ChangePassword`) rendered in both learner and parent `more.tsx` screens. Account owner detection uses `activeProfile.isOwner` from the existing profile context.

**Tech Stack:** React Native, Clerk SDK (`@clerk/clerk-expo`), existing `PasswordInput` component, existing `extractClerkError()` utility, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-04-04-account-security-design.md`

---

### Task 1: ChangePassword Component + Tests

**Files:**
- Create: `apps/mobile/src/components/change-password.tsx`
- Create: `apps/mobile/src/components/change-password.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/change-password.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockUpdatePassword = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({
    user: {
      updatePassword: mockUpdatePassword,
    },
  }),
  useAuth: () => ({
    signOut: mockSignOut,
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#999',
  }),
}));

import { ChangePassword } from './change-password';

describe('ChangePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdatePassword.mockResolvedValue({});
  });

  it('renders all three password fields', () => {
    render(<ChangePassword />);

    expect(screen.getByTestId('current-password')).toBeTruthy();
    expect(screen.getByTestId('new-password')).toBeTruthy();
    expect(screen.getByTestId('confirm-password')).toBeTruthy();
  });

  it('shows requirements hint on new password field', () => {
    render(<ChangePassword />);

    expect(screen.getByTestId('new-password-hint')).toBeTruthy();
  });

  it('shows mismatch error when confirm differs from new password', () => {
    render(<ChangePassword />);

    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'Different1!');
    fireEvent.press(screen.getByTestId('update-password-button'));

    expect(screen.getByText('Passwords do not match')).toBeTruthy();
  });

  it('does not submit when new password is too short', () => {
    render(<ChangePassword />);

    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'short');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'short');
    fireEvent.press(screen.getByTestId('update-password-button'));

    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it('calls user.updatePassword on valid submission', async () => {
    render(<ChangePassword />);

    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        currentPassword: 'OldPass1!',
        newPassword: 'NewPass123!',
      });
    });
  });

  it('shows Clerk error when current password is wrong', async () => {
    mockUpdatePassword.mockRejectedValue({
      errors: [{ longMessage: 'Password is incorrect.' }],
    });

    render(<ChangePassword />);

    fireEvent.changeText(screen.getByTestId('current-password'), 'WrongPass!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));

    await waitFor(() => {
      expect(screen.getByText('Password is incorrect.')).toBeTruthy();
    });
  });

  it('clears form and shows success after password update', async () => {
    render(<ChangePassword />);

    fireEvent.changeText(screen.getByTestId('current-password'), 'OldPass1!');
    fireEvent.changeText(screen.getByTestId('new-password'), 'NewPass123!');
    fireEvent.changeText(screen.getByTestId('confirm-password'), 'NewPass123!');
    fireEvent.press(screen.getByTestId('update-password-button'));

    await waitFor(() => {
      expect(screen.getByText('Password updated')).toBeTruthy();
    });
  });

  it('renders forgot password link', () => {
    render(<ChangePassword />);

    expect(screen.getByText('Forgot your password?')).toBeTruthy();
  });

  it('signs out and redirects when forgot password is tapped', async () => {
    render(<ChangePassword />);

    fireEvent.press(screen.getByText('Forgot your password?'));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/components/change-password.test.tsx --no-coverage
```
Expected: FAIL — module `./change-password` not found.

- [ ] **Step 3: Write the ChangePassword component**

Create `apps/mobile/src/components/change-password.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { PasswordInput } from './common';
import { extractClerkError } from '../lib/clerk-error';

export function ChangePassword() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await user?.updatePassword({
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [user, currentPassword, newPassword, confirmPassword]);

  const handleForgotPassword = useCallback(async () => {
    await signOut();
    router.replace('/(auth)/sign-in' as never);
  }, [signOut, router]);

  return (
    <View className="mt-3">
      <PasswordInput
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder="Current password"
        testID="current-password"
      />

      <Pressable onPress={handleForgotPassword} className="mt-1 mb-3">
        <Text className="text-xs text-primary">Forgot your password?</Text>
      </Pressable>

      <PasswordInput
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder="New password"
        testID="new-password"
        showRequirements
      />

      <View className="mt-2">
        <PasswordInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password"
          testID="confirm-password"
        />
      </View>

      {error && (
        <Text className="text-xs text-danger mt-2" testID="password-error">
          {error}
        </Text>
      )}

      {success && (
        <Text className="text-xs text-success mt-2">Password updated</Text>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={isSubmitting}
        className="bg-primary rounded-card px-4 py-3 mt-3 items-center"
        accessibilityLabel="Update password"
        accessibilityRole="button"
        testID="update-password-button"
      >
        <Text className="text-body font-semibold text-text-inverse">
          {isSubmitting ? 'Updating...' : 'Update Password'}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/components/change-password.test.tsx --no-coverage
```
Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/change-password.tsx apps/mobile/src/components/change-password.test.tsx
git commit -m "feat: add ChangePassword component with validation and Clerk integration"
```

---

### Task 2: AccountSecurity Component + Tests

**Files:**
- Create: `apps/mobile/src/components/account-security.tsx`
- Create: `apps/mobile/src/components/account-security.test.tsx`

**Depends on:** Task 1 (imports `ChangePassword`)

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/account-security.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

let mockUser: Record<string, unknown> = {};
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useUser: () => ({ user: mockUser }),
  useAuth: () => ({ signOut: mockSignOut }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    muted: '#999',
  }),
}));

jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'profile-1', isOwner: true },
  }),
}));

import { AccountSecurity } from './account-security';

describe('AccountSecurity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
      passwordEnabled: true,
      twoFactorEnabled: false,
      externalAccounts: [],
      primaryEmailAddress: {
        emailAddress: 'test@example.com',
        id: 'email_1',
        prepareVerification: jest.fn(),
        attemptVerification: jest.fn(),
      },
      disableTOTP: jest.fn().mockResolvedValue({}),
    };
  });

  it('renders Account Security section header', () => {
    render(<AccountSecurity />);

    expect(screen.getByText('Account Security')).toBeTruthy();
  });

  it('renders email verification toggle for password users', () => {
    render(<AccountSecurity />);

    expect(screen.getByText('Email Verification')).toBeTruthy();
  });

  it('renders Change Password row for password users', () => {
    render(<AccountSecurity />);

    expect(screen.getByText('Change Password')).toBeTruthy();
  });

  it('shows SSO message when passwordEnabled is false', () => {
    mockUser = {
      passwordEnabled: false,
      twoFactorEnabled: false,
      externalAccounts: [{ provider: 'google' }],
    };

    render(<AccountSecurity />);

    expect(screen.getByText(/secured via Google/i)).toBeTruthy();
    expect(screen.queryByText('Email Verification')).toBeNull();
    expect(screen.queryByText('Change Password')).toBeNull();
  });

  it('shows Apple in SSO message when provider is apple', () => {
    mockUser = {
      passwordEnabled: false,
      twoFactorEnabled: false,
      externalAccounts: [{ provider: 'apple' }],
    };

    render(<AccountSecurity />);

    expect(screen.getByText(/secured via Apple/i)).toBeTruthy();
  });

  it('shows toggle ON when twoFactorEnabled is true', () => {
    mockUser = { ...mockUser, twoFactorEnabled: true };

    render(<AccountSecurity />);

    const toggle = screen.getByTestId('email-2fa-toggle');
    expect(toggle.props.value).toBe(true);
  });

  it('shows toggle OFF when twoFactorEnabled is false', () => {
    render(<AccountSecurity />);

    const toggle = screen.getByTestId('email-2fa-toggle');
    expect(toggle.props.value).toBe(false);
  });

  it('expands password form when Change Password is tapped', () => {
    render(<AccountSecurity />);

    fireEvent.press(screen.getByText('Change Password'));

    expect(screen.getByTestId('current-password')).toBeTruthy();
  });

  it('does not render when activeProfile is not owner', () => {
    jest.resetModules();
    jest.doMock('../../lib/profile', () => ({
      useProfile: () => ({
        activeProfile: { id: 'profile-child', isOwner: false },
      }),
    }));
    // Re-require with the new mock
    const { AccountSecurity: ChildSecurity } = require('./account-security');

    const { toJSON } = render(<ChildSecurity />);
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/components/account-security.test.tsx --no-coverage
```
Expected: FAIL — module `./account-security` not found.

- [ ] **Step 3: Write the AccountSecurity component**

Create `apps/mobile/src/components/account-security.tsx`:

```tsx
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Switch,
  Pressable,
  Alert,
  TextInput,
} from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useProfile } from '../lib/profile';
import { useThemeColors } from '../lib/theme';
import { extractClerkError } from '../lib/clerk-error';
import { ChangePassword } from './change-password';

function getSsoProviderLabel(
  externalAccounts: Array<{ provider: string }>
): string {
  const provider = externalAccounts[0]?.provider ?? 'your provider';
  if (provider === 'google' || provider === 'oauth_google') return 'Google';
  if (provider === 'apple' || provider === 'oauth_apple') return 'Apple';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

type VerifyStage = 'idle' | 'code_sent' | 'verifying';

export function AccountSecurity() {
  const { user } = useUser();
  const { activeProfile } = useProfile();
  const colors = useThemeColors();

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [verifyStage, setVerifyStage] = useState<VerifyStage>('idle');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const isOwner = activeProfile?.isOwner ?? false;
  const passwordEnabled = (user as Record<string, unknown>)
    ?.passwordEnabled as boolean;
  const twoFactorEnabled = (user as Record<string, unknown>)
    ?.twoFactorEnabled as boolean;
  const externalAccounts = ((user as Record<string, unknown>)
    ?.externalAccounts ?? []) as Array<{ provider: string }>;

  const handleToggle2FA = useCallback(
    async (enable: boolean) => {
      if (!user) return;

      if (!enable) {
        // Disable — show confirmation dialog
        Alert.alert(
          'Turn off email verification?',
          "You'll only need your password to sign in.",
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Turn Off',
              style: 'destructive',
              onPress: async () => {
                try {
                  // Clerk method to disable 2FA
                  await (user as unknown as { disableTOTP: () => Promise<void> }).disableTOTP();
                } catch (err) {
                  Alert.alert('Error', extractClerkError(err));
                }
              },
            },
          ]
        );
        return;
      }

      // Enable — start email verification flow
      try {
        setVerifyError(null);
        const emailAddress = (
          user as unknown as {
            primaryEmailAddress: {
              prepareVerification: (opts: {
                strategy: string;
              }) => Promise<void>;
            };
          }
        ).primaryEmailAddress;
        await emailAddress.prepareVerification({
          strategy: 'email_code',
        });
        setVerifyStage('code_sent');
      } catch (err) {
        setVerifyError(extractClerkError(err));
      }
    },
    [user]
  );

  const handleVerifyCode = useCallback(async () => {
    if (!user) return;
    setVerifyStage('verifying');
    setVerifyError(null);

    try {
      const emailAddress = (
        user as unknown as {
          primaryEmailAddress: {
            attemptVerification: (opts: {
              code: string;
            }) => Promise<void>;
          };
        }
      ).primaryEmailAddress;
      await emailAddress.attemptVerification({ code: verifyCode });
      setVerifyStage('idle');
      setVerifyCode('');
    } catch (err) {
      setVerifyError(extractClerkError(err));
      setVerifyStage('code_sent');
    }
  }, [user, verifyCode]);

  const handleCancelVerify = useCallback(() => {
    setVerifyStage('idle');
    setVerifyCode('');
    setVerifyError(null);
  }, []);

  if (!isOwner) return null;

  // SSO-only users
  if (!passwordEnabled) {
    const providerLabel = getSsoProviderLabel(externalAccounts);
    return (
      <View className="mt-6">
        <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
          Account Security
        </Text>
        <View className="bg-surface rounded-card px-4 py-3.5">
          <Text className="text-body text-text-secondary">
            Your account is secured via {providerLabel}. Manage your security
            settings there.
          </Text>
        </View>
      </View>
    );
  }

  // Password users — full controls
  return (
    <View className="mt-6">
      <Text className="text-body-sm font-semibold text-text-primary opacity-70 uppercase tracking-wider mb-2">
        Account Security
      </Text>

      {/* Email 2FA Toggle */}
      <View className="bg-surface rounded-card px-4 py-3 mb-2">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-body text-text-primary">
              Email Verification
            </Text>
            <Text className="text-xs text-text-secondary mt-0.5">
              Require a code sent to your email when signing in
            </Text>
          </View>
          <Switch
            value={twoFactorEnabled ?? false}
            onValueChange={handleToggle2FA}
            disabled={verifyStage !== 'idle'}
            accessibilityLabel="Email Verification"
            testID="email-2fa-toggle"
          />
        </View>

        {/* Verification code entry (shown during enable flow) */}
        {verifyStage !== 'idle' && (
          <View className="mt-3 pt-3 border-t border-border">
            <Text className="text-body-sm text-text-secondary mb-2">
              Enter the 6-digit code sent to your email
            </Text>
            <TextInput
              className="bg-background text-text-primary text-body px-4 py-3 rounded-input"
              value={verifyCode}
              onChangeText={setVerifyCode}
              placeholder="000000"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              testID="verify-2fa-code"
            />
            {verifyError && (
              <Text className="text-xs text-danger mt-1">{verifyError}</Text>
            )}
            <View className="flex-row mt-3 gap-2">
              <Pressable
                onPress={handleCancelVerify}
                className="flex-1 bg-background rounded-card px-4 py-2.5 items-center"
                testID="cancel-2fa-verify"
              >
                <Text className="text-body-sm font-semibold text-text-primary">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleVerifyCode}
                disabled={verifyCode.length < 6 || verifyStage === 'verifying'}
                className="flex-1 bg-primary rounded-card px-4 py-2.5 items-center"
                testID="confirm-2fa-code"
              >
                <Text className="text-body-sm font-semibold text-text-inverse">
                  {verifyStage === 'verifying' ? 'Verifying...' : 'Verify'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Change Password */}
      <Pressable
        onPress={() => setShowPasswordForm((v) => !v)}
        className="flex-row items-center justify-between bg-surface rounded-card px-4 py-3.5 mb-2"
        accessibilityLabel="Change Password"
        accessibilityRole="button"
        testID="change-password-row"
      >
        <Text className="text-body text-text-primary">Change Password</Text>
        <Text className="text-body text-text-secondary">
          {showPasswordForm ? '−' : '>'}
        </Text>
      </Pressable>

      {showPasswordForm && (
        <View className="bg-surface rounded-card px-4 py-3 mb-2">
          <ChangePassword />
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/components/account-security.test.tsx --no-coverage
```
Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/account-security.tsx apps/mobile/src/components/account-security.test.tsx
git commit -m "feat: add AccountSecurity component with email 2FA toggle and SSO detection"
```

---

### Task 3: Wire AccountSecurity into Learner more.tsx

**Files:**
- Modify: `apps/mobile/src/app/(learner)/more.tsx` (lines ~291-293, Account section)
- Modify: `apps/mobile/src/app/(learner)/more.test.tsx`

**Depends on:** Task 2

- [ ] **Step 1: Add test for AccountSecurity rendering**

Add to the bottom of the existing `more.test.tsx` file (after the final `});`):

```tsx
describe('MoreScreen — Account Security', () => {
  it('renders Account Security section', () => {
    render(<MoreScreen />, { wrapper: createWrapper() });

    expect(screen.getByText('Account Security')).toBeTruthy();
  });
});
```

Note: The existing mock for `useProfile` returns `{ id: 'profile-1', displayName: 'Alex' }` without `isOwner`. Update the mock at the top of the file to include `isOwner: true`:

```tsx
jest.mock('../../lib/profile', () => ({
  useProfile: () => ({
    activeProfile: { id: 'profile-1', displayName: 'Alex', isOwner: true },
  }),
}));
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/app/\(learner\)/more.test.tsx --no-coverage
```
Expected: FAIL — "Account Security" not found in output.

- [ ] **Step 3: Import and render AccountSecurity in learner more.tsx**

In `apps/mobile/src/app/(learner)/more.tsx`, add the import at the top alongside existing imports:

```tsx
import { AccountSecurity } from '../../components/account-security';
```

Insert `<AccountSecurity />` between the "Delete account" `SettingsRow` and the "Sign out" `Pressable` (after line 323):

```tsx
        <SettingsRow
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />

        <AccountSecurity />

        <Pressable
          onPress={async () => {
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest src/app/\(learner\)/more.test.tsx --no-coverage
```
Expected: All tests PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/app/\(learner\)/more.tsx apps/mobile/src/app/\(learner\)/more.test.tsx
git commit -m "feat: wire AccountSecurity into learner settings screen"
```

---

### Task 4: Wire AccountSecurity into Parent more.tsx

**Files:**
- Modify: `apps/mobile/src/app/(parent)/more.tsx` (lines ~269-273, before Sign out)
- Modify: `apps/mobile/src/app/(parent)/more.test.tsx` (if it exists — create minimal test if not)

**Depends on:** Task 2

- [ ] **Step 1: Check if parent more.test.tsx exists**

Run:
```bash
ls apps/mobile/src/app/\(parent\)/more.test.tsx 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If it exists, add a test similar to Task 3. If missing, create a minimal test file.

- [ ] **Step 2: Import and render AccountSecurity in parent more.tsx**

In `apps/mobile/src/app/(parent)/more.tsx`, add the import:

```tsx
import { AccountSecurity } from '../../components/account-security';
```

Insert `<AccountSecurity />` between the "Delete account" `SettingsRow` and the "Sign out" `Pressable` (after line 273):

```tsx
        <SettingsRow
          label="Delete account"
          onPress={() => router.push('/delete-account')}
        />

        <AccountSecurity />

        <Pressable
          onPress={async () => {
```

- [ ] **Step 3: Run related tests**

Run:
```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/app/\(parent\)/more.tsx --no-coverage
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/app/\(parent\)/more.tsx
git commit -m "feat: wire AccountSecurity into parent settings screen"
```

---

### Task 5: Type-check and Final Verification

**Files:** None — verification only.

- [ ] **Step 1: Run type checker**

```bash
cd apps/mobile && pnpm exec tsc --noEmit
```
Expected: Clean — no errors.

- [ ] **Step 2: Run all related tests together**

```bash
cd apps/mobile && TS_NODE_COMPILER_OPTIONS='{"moduleResolution":"node10","module":"commonjs","customConditions":null}' pnpm exec jest --findRelatedTests src/components/change-password.tsx src/components/account-security.tsx src/app/\(learner\)/more.tsx src/app/\(parent\)/more.tsx --no-coverage
```
Expected: All tests PASS.

- [ ] **Step 3: Run lint**

```bash
pnpm exec nx lint mobile
```
Expected: Clean.

- [ ] **Step 4: Final commit (if any lint fixes)**

Only if lint required auto-fixes:
```bash
git add -u && git commit -m "fix: lint auto-fixes for account security components"
```
