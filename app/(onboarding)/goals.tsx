import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
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
import { useTheme } from '@/hooks/useTheme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Radius, Spacing, Typography } from '@/constants/theme';
import type { HealthGoal } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP = 3;
const TOTAL_STEPS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PROGRESS_TRACK_WIDTH = SCREEN_WIDTH - 48;

const GOAL_OPTIONS: {
  value: HealthGoal;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}[] = [
  {
    value: 'improve_hydration',
    label: 'Improve Hydration',
    desc: 'Hit your daily water intake goal',
    icon: 'water-outline',
    color: '#34C5FF',
  },
  {
    value: 'sleep_better',
    label: 'Sleep Better',
    desc: 'Build a consistent sleep routine',
    icon: 'moon-outline',
    color: '#8B7CF0',
  },
  {
    value: 'build_habits',
    label: 'Build Habits',
    desc: 'Create lasting healthy routines',
    icon: 'checkmark-circle-outline',
    color: '#4CAF82',
  },
  {
    value: 'eat_healthier',
    label: 'Eat Healthier',
    desc: 'Track and improve your nutrition',
    icon: 'nutrition-outline',
    color: '#F5A623',
  },
  {
    value: 'improve_energy',
    label: 'Improve Energy',
    desc: 'Feel more energized every day',
    icon: 'flash-outline',
    color: '#FF6B6B',
  },
  {
    value: 'improve_consistency',
    label: 'Improve Consistency',
    desc: 'Stay on track day after day',
    icon: 'trending-up-outline',
    color: '#4F7EF5',
  },
];

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

export default function OnboardingGoalsScreen() {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const dispatch = useDispatch<AppDispatch>();
  const existingProfile = useSelector((state: RootState) => state.profile.profile);

  const [selected, setSelected] = useState<Set<HealthGoal>>(
    new Set(existingProfile?.goals ?? []),
  );
  const [hasError, setHasError] = useState(false);

  const toggleGoal = async (goal: HealthGoal) => {
    await Haptics.selectionAsync();
    setHasError(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(goal)) {
        next.delete(goal);
      } else {
        next.add(goal);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    if (selected.size === 0) {
      setHasError(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(updateProfile({ goals: Array.from(selected) }));
    router.push('/(onboarding)/notifications');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Progress */}
      <View style={styles.topBar}>
        <ProgressBar step={STEP} total={TOTAL_STEPS} tintColor={theme.tint} />
        <Text style={[styles.stepLabel, { color: theme.textSecondary }]}>
          Step {STEP} of {TOTAL_STEPS}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>What are your goals?</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Select all that apply. Aurora will tailor your daily insights around these.
          </Text>
        </Animated.View>

        {/* Goal grid */}
        <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.goalGrid}>
          {GOAL_OPTIONS.map((opt) => {
            const active = selected.has(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.goalChip,
                  {
                    backgroundColor: active
                      ? opt.color + '18'
                      : isDark
                      ? theme.card
                      : '#FAFBFF',
                    borderColor: active ? opt.color : theme.border,
                    borderWidth: active ? 2 : 1.5,
                  },
                ]}
                onPress={() => toggleGoal(opt.value)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.goalIconWrap,
                    { backgroundColor: active ? opt.color + '25' : opt.color + '12' },
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={22}
                    color={active ? opt.color : theme.textSecondary}
                  />
                </View>

                <View style={styles.goalTextCol}>
                  <Text
                    style={[
                      styles.goalLabel,
                      { color: active ? theme.text : theme.text },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <Text style={[styles.goalDesc, { color: theme.textSecondary }]}>
                    {opt.desc}
                  </Text>
                </View>

                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: active ? opt.color : 'transparent',
                      borderColor: active ? opt.color : theme.border,
                    },
                  ]}
                >
                  {active && <Ionicons name="checkmark" size={13} color="#FFFFFF" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        {/* Selection count */}
        <Animated.View entering={FadeInDown.duration(600).delay(350)} style={styles.selectionHint}>
          {hasError ? (
            <Text style={[styles.errorText, { color: theme.error }]}>
              Please select at least one goal to continue.
            </Text>
          ) : (
            <Text style={[styles.hintText, { color: theme.textSecondary }]}>
              {selected.size === 0
                ? 'Select at least one goal'
                : `${selected.size} goal${selected.size > 1 ? 's' : ''} selected — you can change these any time`}
            </Text>
          )}
        </Animated.View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            { backgroundColor: selected.size > 0 ? theme.tint : theme.border },
          ]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
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
  goalGrid: {
    gap: Spacing.sm,
  },
  goalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  goalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalTextCol: {
    flex: 1,
    gap: 3,
  },
  goalLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  goalDesc: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionHint: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  hintText: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: Radius.lg,
    gap: 8,
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
