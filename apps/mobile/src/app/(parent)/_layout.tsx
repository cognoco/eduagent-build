import React from 'react';
import { Tabs, Redirect, useRouter } from 'expo-router';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile } from '../../lib/profile';
import { useThemeColors, useTokenVars } from '../../lib/theme';
import { usePushTokenRegistration } from '../../hooks/use-push-token-registration';
import { useRevenueCatIdentity } from '../../hooks/use-revenuecat';

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
      color={focused ? colors.accent : colors.textSecondary}
    />
  );
}

/** Consent statuses that block app access */
const PENDING_CONSENT_STATUSES = new Set([
  'PENDING',
  'PARENTAL_CONSENT_REQUESTED',
]);

/**
 * Gate shown when no profile exists yet (first-time parent after sign-up).
 */
function CreateProfileGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="create-profile-gate"
    >
      <Text className="text-h1 font-bold text-text-primary mb-3 text-center">
        Welcome!
      </Text>
      <Text className="text-body text-text-secondary text-center mb-8">
        Let's set up your profile so you can manage your family's learning.
      </Text>
      <Pressable
        onPress={() => router.push('/create-profile')}
        className="bg-primary rounded-button py-3.5 px-8 items-center w-full"
        style={{ minHeight: 48 }}
        testID="create-profile-cta"
        accessibilityRole="button"
        accessibilityLabel="Get started"
      >
        <Text className="text-body font-semibold text-text-inverse">
          Get started
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Gate shown when consent has been withdrawn (defense-in-depth for parent profiles).
 */
function ConsentWithdrawnGate(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();

  return (
    <View
      className="flex-1 bg-background items-center justify-center px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      testID="consent-withdrawn-gate"
    >
      <Text
        className="text-h1 font-bold text-text-primary mb-4 text-center"
        accessibilityRole="header"
      >
        Account restricted
      </Text>
      <Text className="text-body text-text-secondary mb-8 text-center">
        Your account access is currently restricted. Please contact support if
        you believe this is an error.
      </Text>
      <Pressable
        onPress={() => signOut()}
        className="py-3.5 px-8 items-center w-full"
        testID="withdrawn-sign-out"
        accessibilityRole="button"
        accessibilityLabel="Sign out"
      >
        <Text className="text-body font-semibold text-primary">Sign out</Text>
      </Pressable>
    </View>
  );
}

export default function ParentLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useThemeColors();
  const tokenVars = useTokenVars();
  const insets = useSafeAreaInsets();
  const { profiles, activeProfile, isLoading: isProfileLoading } = useProfile();
  const hasLinkedChildren =
    activeProfile?.isOwner === true &&
    profiles.some(
      (profile) => profile.id !== activeProfile.id && !profile.isOwner
    );

  // Register push token on app launch (runs once, guarded internally)
  usePushTokenRegistration();

  // Sync Clerk auth state with RevenueCat identity (runs on auth change)
  useRevenueCatIdentity();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  // Show a centered spinner while profiles load
  if (isProfileLoading)
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="profile-loading"
      >
        <ActivityIndicator size="large" />
      </View>
    );

  // No profile exists — show gate that pushes to profile creation modal
  if (!activeProfile) return <CreateProfileGate />;

  if (!hasLinkedChildren) return <Redirect href="/(learner)/home" />;

  // Gate: block app access when consent is pending (defense-in-depth — unlikely for adults)
  if (
    activeProfile?.consentStatus &&
    PENDING_CONSENT_STATUSES.has(activeProfile.consentStatus)
  ) {
    return <CreateProfileGate />;
  }

  // Gate: block access when consent has been withdrawn
  if (activeProfile?.consentStatus === 'WITHDRAWN') {
    return <ConsentWithdrawnGate />;
  }

  // key={themeKey} removed — crashes Android Fabric (MENTOMATE-MOBILE-6).
  // NativeWind vars() style updates propagate without remounting.
  return (
    <View style={[{ flex: 1 }, tokenVars]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            height: 56 + Math.max(insets.bottom, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Home',
            tabBarButtonTestID: 'tab-home',
            tabBarAccessibilityLabel: 'Home Tab',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarButtonTestID: 'tab-library',
            tabBarAccessibilityLabel: 'Library Tab',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Book" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarButtonTestID: 'tab-more',
            tabBarAccessibilityLabel: 'More Tab',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="More" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="child/[profileId]"
          options={{
            href: null,
            // href:null + display:none hides tab; tabBarButton:() => null
            // cannot be combined with href (Expo Router throws render error)
            tabBarItemStyle: { display: 'none' },
          }}
        />
      </Tabs>
    </View>
  );
}
