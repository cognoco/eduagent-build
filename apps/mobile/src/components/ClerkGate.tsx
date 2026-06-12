import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';

import { tokens } from '../lib/design-tokens';

/**
 * Replaces <ClerkLoaded> to avoid a white gap between splash dismissal and
 * Clerk initialization. ClerkLoaded renders NOTHING until Clerk is ready;
 * this component shows a themed spinner during the gap and signals readiness
 * back to the root layout so the splash doesn't dismiss prematurely.
 *
 * When `timedOut` is true the loading view is replaced with a retry / continue
 * offline screen, driven by the failsafe timer in `_layout.tsx` (BUG-507).
 */
export function ClerkGate({
  children,
  onReady,
  timedOut,
  onRetry,
  onContinueOffline,
}: {
  children: React.ReactNode;
  onReady: () => void;
  timedOut: boolean;
  /** Re-mounts ClerkProvider so Clerk can attempt initialization again. */
  onRetry: () => void;
  /** Lets the user proceed without a Clerk session (offline / degraded network). */
  onContinueOffline: () => void;
}) {
  const { isLoaded } = useAuth();
  const { t } = useTranslation();
  // ThemeContext is not yet mounted at this point (ClerkGate renders above
  // it in the tree). Read the system color scheme directly so dark-mode users
  // see a dark timeout screen instead of the default light palette.
  const systemScheme = useColorScheme();
  const gateColors =
    systemScheme === 'dark' ? tokens.dark.colors : tokens.light.colors;

  useEffect(() => {
    if (isLoaded) onReady();
  }, [isLoaded, onReady]);

  if (!isLoaded) {
    if (timedOut) {
      return (
        <View
          testID="clerk-timeout-screen"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: gateColors.background,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 8,
              textAlign: 'center',
              color: gateColors.textPrimary,
            }}
          >
            {t('clerkGate.timeoutTitle')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: gateColors.muted,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            {t('clerkGate.timeoutMessage')}
          </Text>
          {/* Primary action: force Clerk to re-initialise by remounting ClerkProvider */}
          <Pressable
            testID="clerk-retry-button"
            onPress={onRetry}
            style={{
              backgroundColor: gateColors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
              marginBottom: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={t('clerkGate.tryAgain')}
          >
            <Text
              style={{
                color: gateColors.textInverse,
                fontWeight: '600',
                fontSize: 16,
              }}
            >
              {t('clerkGate.tryAgain')}
            </Text>
          </Pressable>
          {/* Secondary action: continue without auth for offline / degraded network */}
          <Pressable
            testID="clerk-offline-button"
            onPress={onContinueOffline}
            style={{ paddingVertical: 10, paddingHorizontal: 16 }}
            accessibilityRole="button"
            accessibilityLabel={t('clerkGate.continueOffline')}
          >
            <Text
              style={{
                color: gateColors.muted,
                fontSize: 14,
                textDecorationLine: 'underline',
              }}
            >
              {t('clerkGate.continueOffline')}
            </Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View
        testID="clerk-loading-screen"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: gateColors.background,
        }}
      >
        <ActivityIndicator
          size="large"
          color={gateColors.primary}
          accessibilityLabel={t('common.loading')}
        />
        <Text
          style={{
            marginTop: 16,
            color: gateColors.textPrimary,
            fontSize: 16,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {t('clerkGate.connecting')}
        </Text>
      </View>
    );
  }

  return children as React.ReactElement;
}
