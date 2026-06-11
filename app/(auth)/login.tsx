import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/useTheme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Radius, Spacing, Typography } from '@/constants/theme';

// ─── Validation ───────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });

    setIsLoading(false);

    if (error) {
      showToast(error.message, 'error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    // On success, the auth layout guard automatically redirects
  };

  const handleGoogleSignIn = () => {
    showToast('Google sign-in coming soon!', 'info');
  };

  const gradientColors: [string, string] = isDark
    ? ['#0D0F1A', '#1A1D2E']
    : ['#EEF2FF', '#F4F6FF'];

  return (
    <LinearGradient colors={gradientColors} style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.kav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(600).delay(50)} style={styles.header}>
              <View style={[styles.logoMark, { backgroundColor: theme.tint + '18' }]}>
                <Ionicons name="sparkles" size={28} color={theme.tint} />
              </View>
              <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Sign in to continue your health journey
              </Text>
            </Animated.View>

            {/* Card */}
            <Animated.View
              entering={FadeInDown.duration(600).delay(150)}
              style={[
                styles.card,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  shadowColor: isDark ? '#000' : '#4F7EF5',
                },
              ]}
            >
              {/* Email */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Email</Text>
                <Controller
                  control={control}
                  name="email"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <View
                      style={[
                        styles.inputRow,
                        {
                          backgroundColor: isDark ? theme.background : '#F8F9FF',
                          borderColor: errors.email ? theme.error : theme.border,
                        },
                      ]}
                    >
                      <Ionicons name="mail-outline" size={18} color={theme.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="you@example.com"
                        placeholderTextColor={theme.textSecondary + '80'}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="email"
                        returnKeyType="next"
                      />
                    </View>
                  )}
                />
                {errors.email && (
                  <Text style={[styles.errorText, { color: theme.error }]}>
                    {errors.email.message}
                  </Text>
                )}
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <View
                      style={[
                        styles.inputRow,
                        {
                          backgroundColor: isDark ? theme.background : '#F8F9FF',
                          borderColor: errors.password ? theme.error : theme.border,
                        },
                      ]}
                    >
                      <Ionicons name="lock-closed-outline" size={18} color={theme.textSecondary} />
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="••••••••"
                        placeholderTextColor={theme.textSecondary + '80'}
                        secureTextEntry={!showPassword}
                        autoComplete="password"
                        returnKeyType="done"
                        onSubmitEditing={handleSubmit(onSubmit)}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword((v) => !v)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={theme.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                />
                {errors.password && (
                  <Text style={[styles.errorText, { color: theme.error }]}>
                    {errors.password.message}
                  </Text>
                )}
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  { backgroundColor: theme.tint, opacity: isLoading ? 0.7 : 1 },
                ]}
                onPress={handleSubmit(onSubmit)}
                activeOpacity={0.85}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Ionicons name="reload-outline" size={20} color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <Text style={[styles.dividerText, { color: theme.textSecondary }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              {/* Google */}
              <TouchableOpacity
                style={[
                  styles.socialButton,
                  { borderColor: theme.border, backgroundColor: theme.card },
                ]}
                onPress={handleGoogleSignIn}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={20} color={theme.text} />
                <Text style={[styles.socialButtonText, { color: theme.text }]}>
                  Continue with Google
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* Footer link */}
            <Animated.View entering={FadeInDown.duration(600).delay(250)} style={styles.footer}>
              <Text style={[styles.footerText, { color: theme.textSecondary }]}>
                Don't have an account?{' '}
              </Text>
              <Link href="/(auth)/signup" asChild>
                <TouchableOpacity>
                  <Text style={[styles.footerLink, { color: theme.tint }]}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  kav: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 32,
    justifyContent: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
    gap: Spacing.sm,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.displayMedium,
  },
  subtitle: {
    ...Typography.bodyLarge,
    textAlign: 'center',
  },

  // Card
  card: {
    borderRadius: Radius.xxl,
    borderWidth: 1,
    padding: Spacing.xxl,
    gap: Spacing.lg,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  field: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.labelLarge,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    padding: 0,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 2,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: Radius.lg,
    gap: 8,
    marginTop: Spacing.sm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
    shadowColor: '#4F7EF5',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    gap: 10,
  },
  socialButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '400',
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});
