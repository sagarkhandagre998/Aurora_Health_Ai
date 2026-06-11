import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useDispatch, useSelector } from 'react-redux';
import { updateProfile } from '@/store/slices/profileSlice';
import type { AppDispatch, RootState } from '@/store';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { useTheme } from '@/hooks/useTheme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Radius, Spacing, Typography } from '@/constants/theme';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP = 4;
const TOTAL_STEPS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PROGRESS_TRACK_WIDTH = SCREEN_WIDTH - 48;

const NOTIFICATION_ITEMS: {
  key: keyof NotificationPrefs;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}[] = [
  {
    key: 'hydration',
    label: 'Hydration Reminders',
    desc: 'Gentle nudges to drink water throughout the day',
    icon: 'water-outline',
    color: '#34C5FF',
  },
  {
    key: 'sleep',
    label: 'Sleep Reminders',
    desc: "Wind-down alerts before your target bedtime",
    icon: 'moon-outline',
    color: '#8B7CF0',
  },
  {
    key: 'habits',
    label: 'Habit Nudges',
    desc: 'Keep your streaks alive with daily check-ins',
    icon: 'checkmark-circle-outline',
    color: '#4CAF82',
  },
  {
    key: 'insights',
    label: 'Daily Insights',
    desc: "AI-powered observations about your health trends",
    icon: 'sparkles-outline',
    color: '#4F7EF5',
  },
];

interface NotificationPrefs {
  hydration: boolean;
  sleep: boolean;
  habits: boolean;
  insights: boolean;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total, tintColor }: { step: number; total: number; tintColor: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming((step / total) * PROGRESS_TRACK_WIDTH, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, []);
  const barStyle = useAnimatedStyle(() => ({ width: progress.value }));
  return (
    <View style={[styles.progressTrack, { width: PROGRESS_TRACK_WIDTH }]}>
      <Animated.View style={[styles.progressFill, { backgroundColor: tintColor }, barStyle]} />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingNotificationsScreen() {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const dispatch = useDispatch<AppDispatch>();
  const { user, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const reduxProfile = useSelector((state: RootState) => state.profile.profile);

  const [prefs, setPrefs] = useState<NotificationPrefs>(
    reduxProfile?.notificationPrefs ?? {
      hydration: true,
      sleep: true,
      habits: true,
      insights: true,
    },
  );
  const [isLoading, setIsLoading] = useState(false);

  const togglePref = async (key: keyof NotificationPrefs) => {
    await Haptics.selectionAsync();
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFinish = async () => {
    if (!user) return;

    setIsLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Merge final notification prefs into Redux
    dispatch(updateProfile({ notificationPrefs: prefs }));

    // Build the full profile payload for Supabase
    const profile = reduxProfile;
    const profileData = {
      name: profile?.name ?? '',
      age: profile?.age ?? null,
      gender: profile?.gender ?? null,
      height_cm: profile?.heightCm ?? null,
      weight_kg: profile?.weightKg ?? null,
      wake_time: profile?.wakeTime ?? null,
      bedtime: profile?.bedtime ?? null,
      activity_level: profile?.activityLevel ?? null,
      goals: profile?.goals ?? [],
      notification_prefs: prefs,
      onboarding_complete: true,
      updated_at: new Date().toISOString(),
    };

    // Upsert profile row (Supabase trigger creates the row on signup,
    // but upsert handles both create and update gracefully)
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileData)
      .eq('id', user.id);

    if (profileError) {
      setIsLoading(false);
      showToast(profileError.message, 'error');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // Seed initial streak rows (upsert is idempotent)
    const today = new Date().toISOString().split('T')[0];
    const streakTypes = ['hydration', 'sleep', 'habit', 'nutrition'] as const;

    const { error: streakError } = await supabase.from('streaks').upsert(
      streakTypes.map((type) => ({
        user_id: user.id,
        type,
        current: 0,
        longest: 0,
        last_date: today,
      })),
      { onConflict: 'user_id,type', ignoreDuplicates: true },
    );

    if (streakError) {
      // Non-fatal: log but don't block the user
      console.warn('[Aurora] Streak seeding failed:', streakError.message);
    }

    // Refresh auth context profile so the guard can redirect
    await refreshProfile();

    setIsLoading(false);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)/');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Progress */}
      <View style={styles.topBar}>
        <ProgressBar step={STEP} total={TOTAL_STEPS} tintColor={theme.tint} />
        <Text style={[styles.stepLabel, { color: theme.textSecondary }]}>
          Almost there — Step {STEP} of {TOTAL_STEPS}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Stay in the loop</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Aurora works best when it can reach you at the right moment. You can adjust these
            any time in Settings.
          </Text>
        </Animated.View>

        {/* Toggle rows */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          {NOTIFICATION_ITEMS.map((item, idx) => (
            <View key={item.key}>
              <View style={styles.toggleRow}>
                <View style={[styles.notifIconWrap, { backgroundColor: item.color + '18' }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <View style={styles.notifTextCol}>
                  <Text style={[styles.notifLabel, { color: theme.text }]}>{item.label}</Text>
                  <Text style={[styles.notifDesc, { color: theme.textSecondary }]}>
                    {item.desc}
                  </Text>
                </View>
                <Switch
                  value={prefs[item.key]}
                  onValueChange={() => togglePref(item.key)}
                  trackColor={{ false: theme.border, true: item.color + '70' }}
                  thumbColor={prefs[item.key] ? item.color : '#F4F3F4'}
                  ios_backgroundColor={theme.border}
                />
              </View>
              {idx < NOTIFICATION_ITEMS.length - 1 && (
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
              )}
            </View>
          ))}
        </Animated.View>

        {/* Privacy note */}
        <Animated.View entering={FadeInDown.duration(600).delay(300)} style={styles.privacyNote}>
          <Ionicons name="lock-closed-outline" size={14} color={theme.textSecondary} />
          <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
            Aurora never sells your data. Notifications are powered by your device and can be
            revoked at any time from system settings.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Finish CTA */}
      <Animated.View
        entering={FadeInDown.duration(600).delay(350)}
        style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}
      >
        <TouchableOpacity
          style={[
            styles.finishButton,
            { backgroundColor: theme.tint, opacity: isLoading ? 0.75 : 1 },
          ]}
          onPress={handleFinish}
          activeOpacity={0.85}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Ionicons name="reload-outline" size={20} color="#FFFFFF" />
              <Text style={styles.finishButtonText}>Setting up your profile…</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.finishButtonText}>Finish Setup</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.finishHint, { color: theme.textSecondary }]}>
          You're all set! Your Aurora journey starts now. ✨
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    paddingHorizontal: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  progressTrack: {
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: '#E8ECFF',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: Radius.full,
  },
  stepLabel: { ...Typography.bodySmall, fontWeight: '600' },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  header: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  title: { ...Typography.displayMedium },
  subtitle: { ...Typography.bodyLarge, lineHeight: 24 },
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  notifIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTextCol: {
    flex: 1,
    gap: 3,
  },
  notifLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  notifDesc: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 24 + 40 + 12, // align with text
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: Spacing.xl,
    paddingHorizontal: 4,
  },
  privacyText: {
    flex: 1,
    ...Typography.bodySmall,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  finishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: Radius.lg,
    gap: 10,
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  finishHint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
});
