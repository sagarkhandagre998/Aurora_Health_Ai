import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';

export default function AuthLayout() {
  const { session, profile, loading } = useAuth();
  const theme = useTheme();

  if (loading) {
    return (
      <View style={[styles.loader, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  // Authenticated users are routed out of auth screens
  if (session) {
    if (!profile?.onboardingComplete) {
      return <Redirect href="/(onboarding)/profile" />;
    }
    return <Redirect href="/(tabs)/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
