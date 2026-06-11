import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { format } from 'date-fns';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { ProgressRing } from '@/components/rings/ProgressRing';
import { RootState, AppDispatch } from '@/store';
import {
  setHabits,
  addHabit,
  updateHabit,
  removeHabit,
  setCompletions,
  upsertCompletion,
} from '@/store/slices/habitsSlice';
import { Habit, HabitCompletion } from '@/types';

const habitSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  icon: z.string().optional(),
  frequency: z.enum(['daily', 'weekly']),
  targetPerDay: z.number().min(1).max(20),
});
type HabitForm = z.infer<typeof habitSchema>;

const PRESETS = [
  { name: 'Reading', icon: '📚' },
  { name: 'Meditation', icon: '🧘' },
  { name: 'Stretching', icon: '🤸' },
  { name: 'Walking', icon: '🚶' },
  { name: 'Journaling', icon: '📝' },
  { name: 'Supplements', icon: '💊' },
  { name: 'Early Bedtime', icon: '😴' },
];

interface HabitRowProps {
  habit: Habit;
  completed: boolean;
  onComplete: (id: string) => void;
  onLongPress: (habit: Habit) => void;
  theme: ReturnType<typeof import('@/hooks/useTheme').useTheme>;
}

function HabitRow({ habit, completed, onComplete, onLongPress, theme }: HabitRowProps) {
  return (
    <TouchableOpacity
      style={[styles.habitRow, { backgroundColor: theme.card }]}
      onLongPress={() => onLongPress(habit)}
      activeOpacity={0.85}
    >
      <View style={styles.habitLeft}>
        <Text style={styles.habitEmoji}>{habit.icon ?? '✅'}</Text>
        <View style={styles.habitInfo}>
          <Text style={[styles.habitName, { color: theme.text }]}>{habit.name}</Text>
          <Text style={[styles.habitFreq, { color: theme.textSecondary }]}>
            {habit.frequency} · {habit.targetPerDay}×/day
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={[
          styles.checkBtn,
          {
            backgroundColor: completed ? theme.habits : 'transparent',
            borderColor: completed ? theme.habits : theme.border,
          },
        ]}
        onPress={() => onComplete(habit.id)}
      >
        {completed && <Ionicons name="checkmark" size={18} color="#fff" />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function HabitsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const { habits, todayCompletionIds } = useSelector((s: RootState) => s.habits);
  const activeHabits = useMemo(() => habits.filter((h) => h.status === 'active'), [habits]);
  const today = new Date().toISOString().split('T')[0];

  const [refreshing, setRefreshing] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['70%', '92%'], []);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<HabitForm>({
    resolver: zodResolver(habitSchema),
    defaultValues: { name: '', icon: '✅', frequency: 'daily', targetPerDay: 1 },
  });

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    const [habRes, compRes] = await Promise.all([
      supabase
        .from('habits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('habit_completions').select('*').eq('user_id', user.id).eq('date', today),
    ]);
    if (habRes.data) {
      dispatch(
        setHabits(
          habRes.data.map((r) => ({
            id: r.id,
            name: r.name,
            icon: r.icon ?? undefined,
            frequency: r.frequency,
            targetPerDay: r.target_per_day,
            status: r.status,
            createdAt: r.created_at,
          })),
        ),
      );
    }
    if (compRes.data) {
      dispatch(
        setCompletions(
          compRes.data.map((r) => ({
            id: r.id,
            habitId: r.habit_id,
            date: r.date,
            count: r.count,
          })),
        ),
      );
    }
  }, [user?.id, today, dispatch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const handleComplete = useCallback(
    async (habitId: string) => {
      if (!user?.id) return;
      const completion: HabitCompletion = {
        id: `tmp-${Date.now()}`,
        habitId,
        date: today,
        count: 1,
      };
      dispatch(upsertCompletion(completion));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const { data, error } = await supabase
          .from('habit_completions')
          .upsert(
            { user_id: user.id, habit_id: habitId, date: today, count: 1 },
            { onConflict: 'user_id,habit_id,date' },
          )
          .select()
          .single();
        if (error) throw error;
        dispatch(
          upsertCompletion({
            id: data.id,
            habitId: data.habit_id,
            date: data.date,
            count: data.count,
          }),
        );
        showToast('Habit completed! 🎉', 'success');
      } catch {
        showToast('Could not save completion', 'error');
      }
    },
    [user?.id, today, dispatch, showToast],
  );

  const handleLongPress = useCallback(
    (habit: Habit) => {
      Alert.alert(habit.name, 'What would you like to do?', [
        {
          text: 'Pause',
          onPress: async () => {
            dispatch(updateHabit({ ...habit, status: 'paused' }));
            await supabase.from('habits').update({ status: 'paused' }).eq('id', habit.id);
            showToast('Habit paused', 'success');
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            dispatch(removeHabit(habit.id));
            await supabase.from('habits').delete().eq('id', habit.id);
            showToast('Habit deleted', 'success');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [dispatch, showToast],
  );

  const onAddHabit = useCallback(
    async (form: HabitForm) => {
      if (!user?.id) return;
      const tempHabit: Habit = {
        id: `tmp-${Date.now()}`,
        name: form.name,
        icon: form.icon,
        frequency: form.frequency,
        targetPerDay: form.targetPerDay,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      dispatch(addHabit(tempHabit));
      sheetRef.current?.close();
      reset();
      try {
        const { data, error } = await supabase
          .from('habits')
          .insert({
            user_id: user.id,
            name: form.name,
            icon: form.icon,
            frequency: form.frequency,
            target_per_day: form.targetPerDay,
            status: 'active',
          })
          .select()
          .single();
        if (error) throw error;
        dispatch(removeHabit(tempHabit.id));
        dispatch(
          addHabit({
            id: data.id,
            name: data.name,
            icon: data.icon ?? undefined,
            frequency: data.frequency,
            targetPerDay: data.target_per_day,
            status: data.status,
            createdAt: data.created_at,
          }),
        );
        showToast('Habit created! ✅', 'success');
      } catch {
        dispatch(removeHabit(tempHabit.id));
        showToast('Could not create habit', 'error');
      }
    },
    [user?.id, dispatch, showToast, reset],
  );

  const completedCount = todayCompletionIds.length;
  const progress = activeHabits.length > 0 ? completedCount / activeHabits.length : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Habits</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {format(new Date(), 'EEEE, MMM d')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.habits }]}
            onPress={() => sheetRef.current?.snapToIndex(0)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>New Habit</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Progress Ring */}
        <Animated.View entering={FadeInDown.delay(60).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#0D1F18', '#0F2A1A'] : ['#F0FFF6', '#E6FAF0']}
            style={styles.progressCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <ProgressRing
              progress={progress}
              size={90}
              color={theme.habits}
              label={`${completedCount}/${activeHabits.length}`}
              strokeWidth={9}
            />
            <View style={styles.progressInfo}>
              <Text style={[styles.progressTitle, { color: theme.text }]}>
                {completedCount === activeHabits.length && activeHabits.length > 0
                  ? '🎉 All done!'
                  : `${activeHabits.length - completedCount} remaining`}
              </Text>
              <Text style={[styles.progressSubtitle, { color: theme.textSecondary }]}>
                {Math.round(progress * 100)}% of today's habits complete
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Habit List */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Today's Habits</Text>
          {activeHabits.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No habits yet! Add one below or pick from presets.
              </Text>
            </View>
          ) : (
            <FlashList
              data={activeHabits}
              renderItem={({ item }) => (
                <HabitRow
                  habit={item}
                  completed={todayCompletionIds.includes(item.id)}
                  onComplete={handleComplete}
                  onLongPress={handleLongPress}
                  theme={theme}
                />
              )}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
            />
          )}
        </Animated.View>

        {/* Presets */}
        <Animated.View entering={FadeInDown.delay(180).springify()}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Add Presets</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p.name}
                style={[
                  styles.presetChip,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
                onPress={() => {
                  setValue('name', p.name);
                  setValue('icon', p.icon);
                  sheetRef.current?.snapToIndex(0);
                }}
              >
                <Text style={styles.presetEmoji}>{p.icon}</Text>
                <Text style={[styles.presetName, { color: theme.text }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Add Habit Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheetContent, { backgroundColor: theme.card }]}
        >
          <Text style={[styles.sheetTitle, { color: theme.text }]}>New Habit</Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Name</Text>
          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange } }) => (
              <BottomSheetTextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: errors.name ? theme.error : theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="e.g. Morning walk"
                placeholderTextColor={theme.textSecondary}
                value={value}
                onChangeText={onChange}
              />
            )}
          />
          {errors.name && (
            <Text style={[styles.errorText, { color: theme.error }]}>{errors.name.message}</Text>
          )}

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Icon (emoji)</Text>
          <Controller
            control={control}
            name="icon"
            render={({ field: { value, onChange } }) => (
              <BottomSheetTextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="✅"
                placeholderTextColor={theme.textSecondary}
                value={value}
                onChangeText={onChange}
              />
            )}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Frequency</Text>
          <Controller
            control={control}
            name="frequency"
            render={({ field: { value, onChange } }) => (
              <View style={styles.segmentRow}>
                {(['daily', 'weekly'] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.segment,
                      {
                        backgroundColor: value === f ? theme.habits : theme.background,
                        borderColor: theme.border,
                      },
                    ]}
                    onPress={() => onChange(f)}
                  >
                    <Text
                      style={[styles.segmentText, { color: value === f ? '#fff' : theme.text }]}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Target per day</Text>
          <Controller
            control={control}
            name="targetPerDay"
            render={({ field: { value, onChange } }) => (
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[
                    styles.stepperBtn,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  onPress={() => onChange(Math.max(1, value - 1))}
                >
                  <Ionicons name="remove" size={20} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.stepperVal, { color: theme.text }]}>{value}</Text>
                <TouchableOpacity
                  style={[
                    styles.stepperBtn,
                    { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  onPress={() => onChange(Math.min(20, value + 1))}
                >
                  <Ionicons name="add" size={20} color={theme.text} />
                </TouchableOpacity>
              </View>
            )}
          />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.habits }]}
            onPress={handleSubmit(onAddHabit)}
          >
            <Text style={styles.saveBtnText}>Create Habit</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: '500' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  progressCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  progressInfo: { flex: 1 },
  progressTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  progressSubtitle: { fontSize: 13, fontWeight: '500' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  habitLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  habitEmoji: { fontSize: 26 },
  habitInfo: { flex: 1 },
  habitName: { fontSize: 16, fontWeight: '700' },
  habitFreq: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  checkBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetEmoji: { fontSize: 16 },
  presetName: { fontSize: 13, fontWeight: '600' },
  sheetContent: { padding: 24, gap: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 15 },
  errorText: { fontSize: 12, marginTop: -6 },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segment: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperVal: { fontSize: 22, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  saveBtn: { borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
