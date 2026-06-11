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
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
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
import type { ActivityLevel } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP = 2;
const TOTAL_STEPS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PROGRESS_TRACK_WIDTH = SCREEN_WIDTH - 48;

const ACTIVITY_OPTIONS: { label: string; value: ActivityLevel; icon: string; desc: string }[] = [
  { label: 'Sedentary', value: 'sedentary', icon: '🛋️', desc: 'Little or no exercise' },
  { label: 'Light', value: 'light', icon: '🚶', desc: '1–3 days/week' },
  { label: 'Moderate', value: 'moderate', icon: '🏃', desc: '3–5 days/week' },
  { label: 'Active', value: 'active', icon: '⚡', desc: '6–7 days/week' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateToTimeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function timeStringToDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function formatDisplayTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

// ─── Time Picker Row ──────────────────────────────────────────────────────────

interface TimePickerRowProps {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  date: Date;
  showPicker: boolean;
  onPress: () => void;
  onChange: (event: DateTimePickerEvent, date?: Date) => void;
  accentColor: string;
  borderColor: string;
  textColor: string;
  secondaryColor: string;
  isDark: boolean;
}

function TimePickerRow({
  label,
  icon,
  date,
  showPicker,
  onPress,
  onChange,
  accentColor,
  borderColor,
  textColor,
  secondaryColor,
  isDark,
}: TimePickerRowProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: secondaryColor }]}>{label}</Text>
      <TouchableOpacity
        style={[
          styles.timeButton,
          {
            backgroundColor: isDark ? '#1A1D2E' : '#F8F9FF',
            borderColor,
          },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View style={[styles.timeIconWrap, { backgroundColor: accentColor + '18' }]}>
          <Ionicons name={icon} size={18} color={accentColor} />
        </View>
        <Text style={[styles.timeDisplayText, { color: textColor }]}>
          {formatDisplayTime(date)}
        </Text>
        <Ionicons name="chevron-down" size={16} color={secondaryColor} />
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={date}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChange}
          themeVariant={isDark ? 'dark' : 'light'}
        />
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingLifestyleScreen() {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const dispatch = useDispatch<AppDispatch>();
  const existingProfile = useSelector((state: RootState) => state.profile.profile);

  // Wake time state
  const [wakeDate, setWakeDate] = useState<Date>(
    existingProfile?.wakeTime
      ? timeStringToDate(existingProfile.wakeTime)
      : timeStringToDate('07:00'),
  );
  const [showWakePicker, setShowWakePicker] = useState(Platform.OS === 'ios');

  // Bedtime state
  const [bedDate, setBedDate] = useState<Date>(
    existingProfile?.bedtime
      ? timeStringToDate(existingProfile.bedtime)
      : timeStringToDate('23:00'),
  );
  const [showBedPicker, setShowBedPicker] = useState(Platform.OS === 'ios');

  // Activity level state
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    existingProfile?.activityLevel ?? 'moderate',
  );

  const handleWakeChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowWakePicker(false);
    if (selected) setWakeDate(selected);
  };

  const handleBedChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowBedPicker(false);
    if (selected) setBedDate(selected);
  };

  const handleContinue = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(
      updateProfile({
        wakeTime: dateToTimeString(wakeDate),
        bedtime: dateToTimeString(bedDate),
        activityLevel,
      }),
    );
    router.push('/(onboarding)/goals');
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
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Your daily rhythm</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Help Aurora understand your schedule so it can send reminders at the right time.
          </Text>
        </Animated.View>

        {/* Sleep schedule card */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(200)}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: theme.sleep + '20' }]}>
              <Ionicons name="moon" size={20} color={theme.sleep} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Sleep Schedule</Text>
          </View>

          <TimePickerRow
            label="Wake-up time"
            icon="sunny-outline"
            date={wakeDate}
            showPicker={showWakePicker}
            onPress={() => setShowWakePicker((v) => !v)}
            onChange={handleWakeChange}
            accentColor="#F5A623"
            borderColor={theme.border}
            textColor={theme.text}
            secondaryColor={theme.textSecondary}
            isDark={isDark}
          />

          <TimePickerRow
            label="Bedtime"
            icon="moon-outline"
            date={bedDate}
            showPicker={showBedPicker}
            onPress={() => setShowBedPicker((v) => !v)}
            onChange={handleBedChange}
            accentColor={theme.sleep}
            borderColor={theme.border}
            textColor={theme.text}
            secondaryColor={theme.textSecondary}
            isDark={isDark}
          />
        </Animated.View>

        {/* Activity level card */}
        <Animated.View
          entering={FadeInDown.duration(600).delay(300)}
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconWrap, { backgroundColor: theme.habits + '20' }]}>
              <Ionicons name="fitness-outline" size={20} color={theme.habits} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Activity Level</Text>
          </View>

          <View style={styles.activityGrid}>
            {ACTIVITY_OPTIONS.map((opt) => {
              const active = activityLevel === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.activityChip,
                    {
                      backgroundColor: active ? theme.tint + '15' : isDark ? theme.background : '#F8F9FF',
                      borderColor: active ? theme.tint : theme.border,
                    },
                  ]}
                  onPress={async () => {
                    await Haptics.selectionAsync();
                    setActivityLevel(opt.value);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.activityEmoji}>{opt.icon}</Text>
                  <View style={styles.activityTextCol}>
                    <Text
                      style={[
                        styles.activityLabel,
                        { color: active ? theme.tint : theme.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={[styles.activityDesc, { color: theme.textSecondary }]}>
                      {opt.desc}
                    </Text>
                  </View>
                  {active && (
                    <Ionicons name="checkmark-circle" size={20} color={theme.tint} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: theme.tint }]}
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
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { ...Typography.headingSmall },
  field: { gap: Spacing.xs },
  label: { ...Typography.labelLarge, marginLeft: 2 },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  timeIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeDisplayText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  activityGrid: {
    gap: Spacing.sm,
  },
  activityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  activityEmoji: {
    fontSize: 22,
  },
  activityTextCol: {
    flex: 1,
    gap: 2,
  },
  activityLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  activityDesc: {
    fontSize: 12,
    fontWeight: '400',
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
