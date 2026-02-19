import { Tabs, Redirect } from 'expo-router';
import { View, Text } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme, useThemeColors } from '../../lib/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const colors = useThemeColors();
  const icons: Record<string, string> = {
    Dashboard: focused ? '●' : '○',
    Book: focused ? '◆' : '◇',
    More: focused ? '≡' : '☰',
  };
  return (
    <Text
      style={{ fontSize: 20, color: focused ? colors.accent : colors.muted }}
    >
      {icons[name] ?? '○'}
    </Text>
  );
}

export default function ParentLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { persona } = useTheme();
  const colors = useThemeColors();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (persona !== 'parent') return <Redirect href="/(learner)/home" />;

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
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarIcon: ({ focused }) => (
              <TabIcon name="Dashboard" focused={focused} />
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
      </Tabs>
    </View>
  );
}
