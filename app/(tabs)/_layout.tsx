import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTab } from '@/components/haptic-tab';
import { useTheme } from '@/hooks/useTheme';
import { FloatingCompanion } from '@/components/companion/FloatingCompanion';
import { AnimatedMicButton } from '@/components/companion/AnimatedMicButton';

export default function TabLayout() {
  const theme = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={23} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="hydration"
        options={{
          title: 'Water',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'water' : 'water-outline'} size={23} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="sleep"
        options={{
          title: 'Sleep',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'moon' : 'moon-outline'} size={23} color={color} />
          ),
        }}
      />

      {/* Center FAB — Aurora AI Companion (animated to draw attention) */}
      <Tabs.Screen
        name="companion"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarIcon: ({ focused }) => <AnimatedMicButton focused={focused} />,
        }}
      />

      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Nutrition',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'restaurant' : 'restaurant-outline'}
              size={23}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={24}
              color={color}
            />
          ),
        }}
      />
      </Tabs>

      {/* Global proactive Aurora presence — floats above all tabs. */}
      <FloatingCompanion />
    </View>
  );
}
