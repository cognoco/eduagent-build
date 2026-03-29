import { Tabs, Redirect } from 'expo-router';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeColors, useTokenVars } from '../../lib/theme';
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

export default function ParentLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { persona, colorScheme, accentPresetId } = useTheme();
  const colors = useThemeColors();
  const tokenVars = useTokenVars();
  const insets = useSafeAreaInsets();

  // Register push token on app launch (runs once, guarded internally)
  usePushTokenRegistration();

  // Sync Clerk auth state with RevenueCat identity (runs on auth change)
  useRevenueCatIdentity();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (persona !== 'parent') return <Redirect href="/(learner)/home" />;

  // Force NativeWind to remount the CSS variable scope when accent changes,
  // guaranteeing that --color-primary / --color-accent propagate to all
  // tab screens (Bug #6 — accent color propagation).
  const themeKey = `theme-${persona}-${colorScheme}-${
    accentPresetId ?? 'default'
  }`;

  return (
    <View key={themeKey} style={[{ flex: 1 }, tokenVars]}>
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
          name="book"
          options={{
            title: 'Learning Book',
            tabBarButtonTestID: 'tab-book',
            tabBarAccessibilityLabel: 'Learning Book Tab',
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
