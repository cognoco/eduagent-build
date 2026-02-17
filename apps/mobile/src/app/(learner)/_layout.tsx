import { Tabs, Redirect } from 'expo-router';
import { View, Text } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTheme } from '../../lib/theme';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: focused ? '●' : '○',
    Book: focused ? '◆' : '◇',
    More: focused ? '≡' : '☰',
  };
  return (
    <Text style={{ fontSize: 20, color: focused ? '#7c3aed' : '#a3a3a3' }}>
      {icons[name] ?? '○'}
    </Text>
  );
}

export default function LearnerLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { persona } = useTheme();
  const isDark = persona === 'teen';

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  if (persona === 'parent') return <Redirect href="/(parent)/dashboard" />;

  return (
    <View className={persona === 'learner' ? 'theme-learner flex-1' : 'flex-1'}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
            borderTopColor: isDark ? '#262626' : '#e5e7eb',
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: isDark ? '#a855f7' : '#4f46e5',
          tabBarInactiveTintColor: isDark ? '#525252' : '#94a3b8',
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
          name="learning-book"
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
