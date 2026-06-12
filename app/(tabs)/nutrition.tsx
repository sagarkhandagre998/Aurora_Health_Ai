import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import BottomSheet, { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { sendToCompanion } from '@/lib/ai';
import { DayBars, DayPills } from '@/components/charts/DayBars';
import { formatDate } from '@/utils/date';
import { RootState, AppDispatch } from '@/store';
import { addMeal, removeMeal, setMeals } from '@/store/slices/nutritionSlice';
import { Meal } from '@/types';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: { key: MealType; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
  { key: 'snack', label: 'Snack', emoji: '🍎' },
];

function MacroBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text
          style={{ fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color }}>{value}g</Text>
      </View>
      <View
        style={{ height: 6, borderRadius: 3, backgroundColor: color + '22', overflow: 'hidden' }}
      >
        <View
          style={{
            width: `${Math.round(pct * 100)}%` as `${number}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

function MealCard({
  meal,
  onDelete,
  theme,
}: {
  meal: Meal;
  onDelete: (id: string) => void;
  theme: ReturnType<typeof import('@/hooks/useTheme').useTheme>;
}) {
  const typeInfo = MEAL_TYPES.find((t) => t.key === meal.mealType);
  return (
    <View style={[mealCardStyles.row, { backgroundColor: theme.card }]}>
      <Text style={mealCardStyles.emoji}>{typeInfo?.emoji ?? '🍽️'}</Text>
      <View style={mealCardStyles.info}>
        <Text style={[mealCardStyles.name, { color: theme.text }]}>{meal.name}</Text>
        <Text style={[mealCardStyles.meta, { color: theme.textSecondary }]}>
          {format(new Date(meal.loggedAt), 'h:mm a')}
          {meal.calories ? ` · ${meal.calories} kcal` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onDelete(meal.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={17} color={theme.error} />
      </TouchableOpacity>
    </View>
  );
}

const mealCardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  emoji: { fontSize: 24, marginRight: 12 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2, fontWeight: '500' },
});

export default function NutritionScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const { meals, todayMeals } = useSelector((s: RootState) => s.nutrition);
  const [refreshing, setRefreshing] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['75%', '95%'], []);

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  // 7-day calorie history for the chart.
  const weeklyData = useMemo(() => {
    const data: { date: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const key = subDays(new Date(), i).toISOString().split('T')[0];
      const kcal = meals
        .filter((m) => m.loggedAt.startsWith(key))
        .reduce((s, m) => s + (m.calories ?? 0), 0);
      data.push({ date: key, value: kcal });
    }
    return data;
  }, [meals]);

  const selectedMeals = useMemo(
    () => meals.filter((m) => m.loggedAt.startsWith(selectedDate)),
    [meals, selectedDate],
  );
  const selectedMealsByType = useMemo(() => {
    const groups: Record<MealType, Meal[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    selectedMeals.forEach((m) => {
      groups[m.mealType].push(m);
    });
    return groups;
  }, [selectedMeals]);

  // Form state
  const [mealName, setMealName] = useState('');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchMeals = useCallback(async () => {
    if (!user?.id) return;
    const since = subDays(new Date(), 6).toISOString().split('T')[0];
    const { data } = await supabase
      .from('meals')
      .select('*')
      .eq('user_id', user.id)
      .gte('logged_at', `${since}T00:00:00`)
      .order('logged_at', { ascending: false });
    if (data) {
      dispatch(
        setMeals(
          data.map((r) => ({
            id: r.id,
            name: r.name,
            mealType: r.meal_type,
            calories: r.calories ?? undefined,
            proteinG: r.protein_g ?? undefined,
            carbsG: r.carbs_g ?? undefined,
            fatG: r.fat_g ?? undefined,
            loggedAt: r.logged_at,
          })),
        ),
      );
    }
  }, [user?.id, dispatch]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMeals();
    setRefreshing(false);
  }, [fetchMeals]);

  const handleDelete = useCallback(
    async (id: string) => {
      dispatch(removeMeal(id));
      try {
        await supabase.from('meals').delete().eq('id', id);
        showToast('Meal removed', 'success');
      } catch {
        showToast('Could not remove meal', 'error');
      }
    },
    [dispatch, showToast],
  );

  const handleEstimate = useCallback(async () => {
    if (!mealName.trim()) {
      showToast('Enter a meal name first', 'error');
      return;
    }
    setEstimating(true);
    try {
      const res = await sendToCompanion([
        {
          role: 'user',
          content: `Estimate the nutritional content for: "${mealName}". Reply ONLY with valid JSON: {"calories":number,"proteinG":number,"carbsG":number,"fatG":number}`,
        },
      ]);
      const match = res.replyText.match(/\{[^}]+\}/);
      if (match) {
        const m = JSON.parse(match[0]) as {
          calories?: number;
          proteinG?: number;
          carbsG?: number;
          fatG?: number;
        };
        if (m.calories) setCalories(String(m.calories));
        if (m.proteinG) setProtein(String(m.proteinG));
        if (m.carbsG) setCarbs(String(m.carbsG));
        if (m.fatG) setFat(String(m.fatG));
        showToast('Macros estimated ✨', 'success');
      }
    } catch {
      showToast('Could not estimate macros', 'error');
    } finally {
      setEstimating(false);
    }
  }, [mealName, showToast]);

  const handleAddMeal = useCallback(async () => {
    if (!user?.id || !mealName.trim()) {
      showToast('Meal name is required', 'error');
      return;
    }
    setSaving(true);
    const tempMeal: Meal = {
      id: `tmp-${Date.now()}`,
      name: mealName.trim(),
      mealType,
      calories: calories ? parseInt(calories) : undefined,
      proteinG: protein ? parseFloat(protein) : undefined,
      carbsG: carbs ? parseFloat(carbs) : undefined,
      fatG: fat ? parseFloat(fat) : undefined,
      loggedAt: new Date().toISOString(),
    };
    dispatch(addMeal(tempMeal));
    sheetRef.current?.close();
    setMealName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    try {
      const { data, error } = await supabase
        .from('meals')
        .insert({
          user_id: user.id,
          name: tempMeal.name,
          meal_type: mealType,
          calories: tempMeal.calories ?? null,
          protein_g: tempMeal.proteinG ?? null,
          carbs_g: tempMeal.carbsG ?? null,
          fat_g: tempMeal.fatG ?? null,
          logged_at: tempMeal.loggedAt,
        })
        .select()
        .single();
      if (error) throw error;
      dispatch(removeMeal(tempMeal.id));
      dispatch(
        addMeal({
          id: data.id,
          name: data.name,
          mealType: data.meal_type,
          calories: data.calories ?? undefined,
          proteinG: data.protein_g ?? undefined,
          carbsG: data.carbs_g ?? undefined,
          fatG: data.fat_g ?? undefined,
          loggedAt: data.logged_at,
        }),
      );
      showToast('Meal logged 🍽️', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      dispatch(removeMeal(tempMeal.id));
      showToast('Could not save meal', 'error');
    } finally {
      setSaving(false);
    }
  }, [user?.id, mealName, mealType, calories, protein, carbs, fat, dispatch, showToast]);

  // Daily totals
  const totalCal = todayMeals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const totalProt = todayMeals.reduce((s, m) => s + (m.proteinG ?? 0), 0);
  const totalCarb = todayMeals.reduce((s, m) => s + (m.carbsG ?? 0), 0);
  const totalFat = todayMeals.reduce((s, m) => s + (m.fatG ?? 0), 0);

  const mealsByType = useMemo(() => {
    const groups: Record<MealType, Meal[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
    todayMeals.forEach((m) => {
      groups[m.mealType].push(m);
    });
    return groups;
  }, [todayMeals]);

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
            <Text style={[styles.title, { color: theme.text }]}>Nutrition</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {format(new Date(), 'EEEE, MMM d')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: theme.nutrition }]}
            onPress={() => sheetRef.current?.snapToIndex(0)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Add Meal</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Daily Summary */}
        <Animated.View entering={FadeInDown.delay(60).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#2A1C00', '#231500'] : ['#FFF8EE', '#FFF3DC']}
            style={styles.summaryCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.calorieRow}>
              <View>
                <Text style={[styles.calorieVal, { color: theme.text }]}>{totalCal}</Text>
                <Text style={[styles.calorieLabel, { color: theme.textSecondary }]}>
                  kcal today
                </Text>
              </View>
              <Text style={{ fontSize: 36 }}>🥗</Text>
            </View>
            {(totalProt > 0 || totalCarb > 0 || totalFat > 0) && (
              <View style={styles.macroRow}>
                <MacroBar
                  label="Protein"
                  value={Math.round(totalProt)}
                  max={150}
                  color={theme.tint}
                />
                <MacroBar
                  label="Carbs"
                  value={Math.round(totalCarb)}
                  max={300}
                  color={theme.nutrition}
                />
                <MacroBar label="Fat" value={Math.round(totalFat)} max={80} color={theme.streak} />
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Meals by type */}
        {MEAL_TYPES.map((mt, idx) => {
          const meals = mealsByType[mt.key];
          if (meals.length === 0) return null;
          return (
            <Animated.View key={mt.key} entering={FadeInDown.delay(120 + idx * 60).springify()}>
              <View style={styles.mealTypeHeader}>
                <Text style={styles.mealTypeEmoji}>{mt.emoji}</Text>
                <Text style={[styles.mealTypeLabel, { color: theme.text }]}>{mt.label}</Text>
                <Text style={[styles.mealTypeCount, { color: theme.textSecondary }]}>
                  {meals.reduce((s, m) => s + (m.calories ?? 0), 0)} kcal
                </Text>
              </View>
              {meals.map((m) => (
                <MealCard key={m.id} meal={m} onDelete={handleDelete} theme={theme} />
              ))}
            </Animated.View>
          );
        })}

        {todayMeals.length === 0 && (
          <Animated.View entering={FadeInDown.delay(120).springify()}>
            <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
              <Text style={{ fontSize: 32, marginBottom: 12 }}>🍽️</Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No meals logged today. Tap "Add Meal" to start tracking your nutrition!
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Last 7 Days history — tap a day to view its meals */}
        <Animated.View entering={FadeInDown.delay(360).springify()}>
          <View style={[styles.historyCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.historyCardTitle, { color: theme.text }]}>Last 7 Days</Text>
            <DayBars
              data={weeklyData}
              color={theme.nutrition}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              formatValue={(v) => (v > 0 ? `${v}` : '')}
              labelColor={theme.textSecondary}
            />
            <View style={{ height: 14 }} />
            <DayPills
              dates={weeklyData.map((d) => d.date)}
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              color={theme.nutrition}
              cardColor={theme.background}
              borderColor={theme.border}
              textColor={theme.text}
              textSecondary={theme.textSecondary}
            />
          </View>

          <Text style={[styles.historySection, { color: theme.text }]}>
            {`${formatDate(selectedDate)}'s Meals`}
          </Text>
          {selectedMeals.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No meals logged on this day.
              </Text>
            </View>
          ) : (
            MEAL_TYPES.map((mt) => {
              const dayMeals = selectedMealsByType[mt.key];
              if (dayMeals.length === 0) return null;
              return (
                <View key={mt.key}>
                  <View style={styles.mealTypeHeader}>
                    <Text style={styles.mealTypeEmoji}>{mt.emoji}</Text>
                    <Text style={[styles.mealTypeLabel, { color: theme.text }]}>{mt.label}</Text>
                    <Text style={[styles.mealTypeCount, { color: theme.textSecondary }]}>
                      {dayMeals.reduce((s, m) => s + (m.calories ?? 0), 0)} kcal
                    </Text>
                  </View>
                  {dayMeals.map((m) => (
                    <MealCard key={m.id} meal={m} onDelete={handleDelete} theme={theme} />
                  ))}
                </View>
              );
            })
          )}
        </Animated.View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Add Meal Sheet */}
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
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Log a Meal</Text>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Meal Name</Text>
          <BottomSheetTextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
            placeholder="e.g. Grilled chicken salad"
            placeholderTextColor={theme.textSecondary}
            value={mealName}
            onChangeText={setMealName}
          />

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Meal Type</Text>
          <View style={styles.typeRow}>
            {MEAL_TYPES.map((mt) => (
              <TouchableOpacity
                key={mt.key}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor: mealType === mt.key ? theme.nutrition : theme.background,
                    borderColor: mealType === mt.key ? theme.nutrition : theme.border,
                  },
                ]}
                onPress={() => setMealType(mt.key)}
              >
                <Text style={{ fontSize: 16 }}>{mt.emoji}</Text>
                <Text
                  style={[
                    styles.typeChipText,
                    { color: mealType === mt.key ? '#fff' : theme.text },
                  ]}
                >
                  {mt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* AI Estimate */}
          <TouchableOpacity
            style={[
              styles.aiBtn,
              { backgroundColor: theme.tint + '18', borderColor: theme.tint + '40' },
            ]}
            onPress={handleEstimate}
            disabled={estimating}
          >
            {estimating ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <Ionicons name="sparkles" size={16} color={theme.tint} />
            )}
            <Text style={[styles.aiBtnText, { color: theme.tint }]}>
              {estimating ? 'Estimating…' : 'Estimate with AI ✨'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Calories (kcal)</Text>
          <BottomSheetTextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
            placeholder="Optional"
            placeholderTextColor={theme.textSecondary}
            value={calories}
            onChangeText={setCalories}
            keyboardType="numeric"
          />

          <View style={styles.macroInputRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Protein (g)</Text>
              <BottomSheetTextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                value={protein}
                onChangeText={setProtein}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Carbs (g)</Text>
              <BottomSheetTextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Fat (g)</Text>
              <BottomSheetTextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  },
                ]}
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                value={fat}
                onChangeText={setFat}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: theme.nutrition, opacity: saving ? 0.7 : 1 },
            ]}
            onPress={handleAddMeal}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Log Meal'}</Text>
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
  summaryCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  calorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calorieVal: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  calorieLabel: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  macroRow: { flexDirection: 'row', gap: 12 },
  mealTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  mealTypeEmoji: { fontSize: 18 },
  historyCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  historyCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  historySection: { fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 4 },
  mealTypeLabel: { fontSize: 16, fontWeight: '700', flex: 1 },
  mealTypeCount: { fontSize: 13, fontWeight: '600' },
  emptyCard: { borderRadius: 18, padding: 28, alignItems: 'center' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22, fontWeight: '500' },
  sheetContent: { padding: 24, gap: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 13, fontSize: 15 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  typeChipText: { fontSize: 13, fontWeight: '700' },
  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 13,
    borderRadius: 14,
    borderWidth: 1,
  },
  aiBtnText: { fontSize: 14, fontWeight: '700' },
  macroInputRow: { flexDirection: 'row', gap: 10 },
  saveBtn: { borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
