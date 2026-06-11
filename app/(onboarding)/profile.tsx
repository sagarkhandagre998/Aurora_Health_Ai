import React, { useEffect } from 'react';
import {
  Dimensions,
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
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useDispatch, useSelector } from 'react-redux';
import { setProfile, updateProfile } from '@/store/slices/profileSlice';
import type { AppDispatch, RootState } from '@/store';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Radius, Spacing, Typography } from '@/constants/theme';
import type { Gender, Profile } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP = 1;
const TOTAL_STEPS = 4;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PROGRESS_TRACK_WIDTH = SCREEN_WIDTH - 48;

const GENDER_OPTIONS: { label: string; value: Gender }[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not', value: 'prefer_not' },
];

// ─── Validation ───────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(80, 'Name too long'),
  age: z
    .string()
    .optional()
    .refine(
      (val) => !val || (Number(val) >= 10 && Number(val) <= 120),
      'Age must be between 10 and 120',
    ),
  gender: z.enum(['male', 'female', 'other', 'prefer_not']).optional(),
  heightCm: z
    .string()
    .optional()
    .refine((val) => !val || (Number(val) > 50 && Number(val) < 280), 'Enter a valid height'),
  weightKg: z
    .string()
    .optional()
    .refine((val) => !val || (Number(val) > 10 && Number(val) < 500), 'Enter a valid weight'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

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

export default function OnboardingProfileScreen() {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const dispatch = useDispatch<AppDispatch>();
  const { user } = useAuth();
  const existingProfile = useSelector((state: RootState) => state.profile.profile);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: existingProfile?.name ?? '',
      age: existingProfile?.age?.toString() ?? '',
      gender: existingProfile?.gender,
      heightCm: existingProfile?.heightCm?.toString() ?? '',
      weightKg: existingProfile?.weightKg?.toString() ?? '',
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const partial: Partial<Profile> = {
      name: data.name.trim(),
      age: data.age ? Number(data.age) : undefined,
      gender: data.gender,
      heightCm: data.heightCm ? Number(data.heightCm) : undefined,
      weightKg: data.weightKg ? Number(data.weightKg) : undefined,
    };

    if (existingProfile) {
      dispatch(updateProfile(partial));
    } else {
      // Bootstrap a profile skeleton with required fields and defaults
      dispatch(
        setProfile({
          id: user?.id ?? '',
          name: partial.name ?? '',
          age: partial.age,
          gender: partial.gender,
          heightCm: partial.heightCm,
          weightKg: partial.weightKg,
          goals: [],
          notificationPrefs: { hydration: true, sleep: true, habits: true, insights: true },
          onboardingComplete: false,
        }),
      );
    }

    router.push('/(onboarding)/lifestyle');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Step indicator */}
      <View style={styles.topBar}>
        <ProgressBar step={STEP} total={TOTAL_STEPS} tintColor={theme.tint} />
        <Text style={[styles.stepLabel, { color: theme.textSecondary }]}>
          Step {STEP} of {TOTAL_STEPS}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(600).delay(100)} style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>Tell us about yourself</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              This helps Aurora personalize your experience. Optional fields can be skipped.
            </Text>
          </Animated.View>

          {/* Fields */}
          <Animated.View entering={FadeInDown.duration(600).delay(200)} style={styles.fieldsCard}>
            {/* Name */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Your name <Text style={{ color: theme.error }}>*</Text>
              </Text>
              <Controller
                control={control}
                name="name"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View
                    style={[
                      styles.inputRow,
                      {
                        backgroundColor: isDark ? theme.background : '#F8F9FF',
                        borderColor: errors.name ? theme.error : theme.border,
                      },
                    ]}
                  >
                    <Ionicons name="person-outline" size={17} color={theme.textSecondary} />
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="What should we call you?"
                      placeholderTextColor={theme.textSecondary + '70'}
                      autoCapitalize="words"
                      returnKeyType="next"
                    />
                  </View>
                )}
              />
              {errors.name && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.name.message}</Text>
              )}
            </View>

            {/* Age */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Age</Text>
              <Controller
                control={control}
                name="age"
                render={({ field: { value, onChange, onBlur } }) => (
                  <View
                    style={[
                      styles.inputRow,
                      {
                        backgroundColor: isDark ? theme.background : '#F8F9FF',
                        borderColor: errors.age ? theme.error : theme.border,
                      },
                    ]}
                  >
                    <Ionicons name="calendar-outline" size={17} color={theme.textSecondary} />
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      placeholder="e.g. 28"
                      placeholderTextColor={theme.textSecondary + '70'}
                      keyboardType="number-pad"
                      returnKeyType="next"
                      maxLength={3}
                    />
                  </View>
                )}
              />
              {errors.age && (
                <Text style={[styles.errorText, { color: theme.error }]}>{errors.age.message}</Text>
              )}
            </View>

            {/* Gender segmented */}
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Gender</Text>
              <Controller
                control={control}
                name="gender"
                render={({ field: { value, onChange } }) => (
                  <View style={styles.segmentedRow}>
                    {GENDER_OPTIONS.map((opt) => {
                      const active = value === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.segmentChip,
                            {
                              backgroundColor: active ? theme.tint : isDark ? theme.background : '#F0F2FF',
                              borderColor: active ? theme.tint : theme.border,
                            },
                          ]}
                          onPress={() => onChange(active ? undefined : opt.value)}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              { color: active ? '#FFFFFF' : theme.textSecondary },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              />
            </View>

            {/* Height & Weight inline */}
            <View style={styles.rowFields}>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Height (cm)</Text>
                <Controller
                  control={control}
                  name="heightCm"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <View
                      style={[
                        styles.inputRow,
                        {
                          backgroundColor: isDark ? theme.background : '#F8F9FF',
                          borderColor: errors.heightCm ? theme.error : theme.border,
                        },
                      ]}
                    >
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="170"
                        placeholderTextColor={theme.textSecondary + '70'}
                        keyboardType="decimal-pad"
                        returnKeyType="next"
                        maxLength={5}
                      />
                      <Text style={[styles.unit, { color: theme.textSecondary }]}>cm</Text>
                    </View>
                  )}
                />
                {errors.heightCm && (
                  <Text style={[styles.errorText, { color: theme.error }]}>
                    {errors.heightCm.message}
                  </Text>
                )}
              </View>

              <View style={[styles.field, { flex: 1 }]}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Weight (kg)</Text>
                <Controller
                  control={control}
                  name="weightKg"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <View
                      style={[
                        styles.inputRow,
                        {
                          backgroundColor: isDark ? theme.background : '#F8F9FF',
                          borderColor: errors.weightKg ? theme.error : theme.border,
                        },
                      ]}
                    >
                      <TextInput
                        style={[styles.input, { color: theme.text }]}
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        placeholder="70"
                        placeholderTextColor={theme.textSecondary + '70'}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                        maxLength={5}
                      />
                      <Text style={[styles.unit, { color: theme.textSecondary }]}>kg</Text>
                    </View>
                  )}
                />
                {errors.weightKg && (
                  <Text style={[styles.errorText, { color: theme.error }]}>
                    {errors.weightKg.message}
                  </Text>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Skip hint */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)} style={styles.skipHint}>
            <Ionicons name="information-circle-outline" size={15} color={theme.textSecondary} />
            <Text style={[styles.skipHintText, { color: theme.textSecondary }]}>
              Only your name is required. You can update everything later in Settings.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* CTA */}
      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: theme.tint }]}
          onPress={handleSubmit(onSubmit)}
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
  stepLabel: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },
  kav: { flex: 1 },
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
  fieldsCard: { gap: Spacing.lg },
  field: { gap: Spacing.xs },
  label: { ...Typography.labelLarge, marginLeft: 2 },
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
  unit: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: { fontSize: 12, fontWeight: '500', marginLeft: 2 },
  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  segmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  segmentText: { fontSize: 13, fontWeight: '600' },
  rowFields: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  skipHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: Spacing.xl,
    paddingHorizontal: 4,
  },
  skipHintText: {
    flex: 1,
    ...Typography.bodySmall,
    lineHeight: 18,
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
