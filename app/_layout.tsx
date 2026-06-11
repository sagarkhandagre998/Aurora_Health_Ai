import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, SplashScreen, useRouter, useSegments, ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from '@/store';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Keep the native splash visible until auth state is resolved.
SplashScreen.preventAutoHideAsync();

// ---------------------------------------------------------------------------
// Loading screen — shown while AuthProvider resolves the session.
// ---------------------------------------------------------------------------
function LoadingScreen({ colorScheme }: { colorScheme: 'light' | 'dark' }) {
  return (
    <View style={[styles.loadingContainer, { backgroundColor: Colors[colorScheme].background }]}>
      <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// RootNavigator — auth routing guard + Stack configuration.
// Must be rendered inside AuthProvider so useAuth() is available.
// ---------------------------------------------------------------------------
function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const colorScheme = (useColorScheme() ?? 'light') as 'light' | 'dark';

  useEffect(() => {
    if (loading) return;

    // Dismiss the native splash now that we know the auth state.
    SplashScreen.hideAsync();

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';

    if (!session && !inAuth) {
      // Not signed in — must go through auth flow.
      router.replace('/(auth)/landing');
    } else if (session && !profile?.onboardingComplete && !inOnboarding) {
      // Signed in but onboarding is incomplete.
      router.replace('/(onboarding)/profile');
    } else if (session && profile?.onboardingComplete && (inAuth || inOnboarding)) {
      // Fully onboarded — send to the main app.
      router.replace('/(tabs)/');
    }
    // Otherwise the user is already on the correct segment; nothing to do.
  }, [session, profile, loading]);

  if (loading) {
    return <LoadingScreen colorScheme={colorScheme} />;
  }

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: Colors[colorScheme].background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// RootLayout — provider tree + theme.
// ---------------------------------------------------------------------------
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const resolvedColorScheme = (colorScheme ?? 'light') as 'light' | 'dark';
  const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  const customTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: Colors[resolvedColorScheme].background,
      card: Colors[resolvedColorScheme].card,
      text: Colors[resolvedColorScheme].text,
      border: Colors[resolvedColorScheme].border,
      notification: Colors[resolvedColorScheme].tint,
    },
  };

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: Colors[resolvedColorScheme].background }}
    >
      <SafeAreaProvider>
        <Provider store={store}>
          <PersistGate loading={null} persistor={persistor}>
            <AuthProvider>
              <ToastProvider>
                <BottomSheetModalProvider>
                  <ThemeProvider value={customTheme}>
                    <RootNavigator />
                    <StatusBar style="auto" />
                  </ThemeProvider>
                </BottomSheetModalProvider>
              </ToastProvider>
            </AuthProvider>
          </PersistGate>
        </Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// ErrorBoundary — shown when an unhandled render error propagates to the root.
// Uses hardcoded styles to stay independent of any theme/context provider.
// ---------------------------------------------------------------------------
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorContainer}>
      <IconSymbol name="exclamationmark.triangle.fill" size={64} color="#ff3b30" />
      <Text style={styles.errorTitle}>Something went wrong!</Text>
      <Text style={styles.errorMessage}>
        {error.message || 'An unexpected application error occurred. We have logged the issue.'}
      </Text>
      <TouchableOpacity style={styles.retryButton} onPress={retry}>
        <Text style={styles.retryText}>Restart Session</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f9fafb',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 12,
    color: '#111827',
  },
  errorMessage: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
