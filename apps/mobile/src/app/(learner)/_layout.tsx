import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../lib/profile';
import { useTheme, useThemeColors } from '../../lib/theme';

const iconMap: Record<
  string,
  {
    focused: keyof typeof Ionicons.glyphMap;
    default: keyof typeof Ionicons.glyphMap;
  }
> = {
  Home: { focused: 'home', default: 'home-outline' },
  Book: { focused: 'book', default: 'book-outline' },
  More: { focused: 'menu', default: 'menu-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const colors = useThemeColors();
  const entry = iconMap[name];
  return (
    <Ionicons
      name={
        entry ? (focused ? entry.focused : entry.default) : 'ellipse-outline'
      }
      size={22}
      color={focused ? colors.accent : colors.muted}
    />
  );
}

/** Consent statuses that block app access */
const PENDING_CONSENT_STATUSES = new Set([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
]);

function ConsentPendingGate(): React.ReactElement {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const [checking, setChecking] = React.useState(false);

  const onCheckAgain = async () => {
    setChecking(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    } finally {
      setChecking(false);
    }
  };

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="consent-pending-gate"
    >
      <Text className="text-h1 font-bold text-text-primary mb-4 text-center">
        Almost there!
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        We've sent an email to your parent or guardian. Once they approve,
        you'll be able to start learning.
      </Text>

      <Pressable
        onPress={onCheckAgain}
        disabled={checking}
        className="bg-primary rounded-button py-3.5 px-8 items-center mb-3 w-full"
        testID="consent-check-again"
        accessibilityRole="button"
        accessibilityLabel="Check again"
      >
        {checking ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text className="text-body font-semibold text-text-inverse">
            Check again
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => signOut()}
        className="py-3.5 px-8 items-center w-full"
        testID="consent-sign-out"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text className="text-body font-semibold text-primary">Sign out</Text>
      </Pressable>
    </View>
  );
}

export default function LearnerLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { persona } = useTheme();
  const colors = useThemeColors();
  const { activeProfile, isLoading: isProfileLoading } = useProfile();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (persona === 'parent') return <Redirect href="/(parent)/dashboard" />;

  // Show nothing while profiles are still loading to avoid flash
  if (isProfileLoading) return null;

  // Gate: block app access when parental consent is pending (COPPA/GDPR)
  if (
    activeProfile?.consentStatus &&
    PENDING_CONSENT_STATUSES.has(activeProfile.consentStatus)
  ) {
    return <ConsentPendingGate />;
  }

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="book"
          options={{
            title: 'Learning Book',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Book" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="More" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="onboarding"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="session"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
        <Tabs.Screen
          name="topic"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="subscription"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="homework"
          options={{
            href: null,
            tabBarStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </View>
  );
}
