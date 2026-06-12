import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { ProgressRing } from '@/components/rings/ProgressRing';
import { RootState, AppDispatch } from '@/store';
import { setLogs as setWaterLogs } from '@/store/slices/hydrationSlice';
import { setLogs as setSleepLogs } from '@/store/slices/sleepSlice';
import { setHabits, setCompletions } from '@/store/slices/habitsSlice';
import { setMeals } from '@/store/slices/nutritionSlice';
import { setStreaks } from '@/store/slices/streakSlice';
import { Insight } from '@/types';

function getGreeting(name: string): string {
  const h = new Date().getHours();
  const s = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${s}, ${name || 'there'} 👋`;
}

const STREAK_EMOJI: Record<string, string> = {
  hydration: '💧',
  sleep: '😴',
  habit: '✅',
  nutrition: '🥗',
};

export default function DashboardScreen() {
  const theme = useTheme();
  const { user, profile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);

  const { todayTotalMl, dailyGoalMl } = useSelector((s: RootState) => s.hydration);
  const { lastNight } = useSelector((s: RootState) => s.sleep);
  const { habits, todayCompletionIds } = useSelector((s: RootState) => s.habits);
  const { todayMeals } = useSelector((s: RootState) => s.nutrition);
  const { streaks } = useSelector((s: RootState) => s.streak);
  const { hkConnected, todaySteps, todayActiveEnergyKcal } = useSelector(
    (s: RootState) => s.activity,
  );

  const today = new Date().toISOString().split('T')[0];

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [water, sleep, hab, comp, meals, stk, ins] = await Promise.all([
        supabase
          .from('water_logs')
          .select('*')
          .eq('user_id', user.id)
          .gte('logged_at', `${today}T00:00:00`)
          .order('logged_at', { ascending: false }),
        supabase
          .from('sleep_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(7),
        supabase.from('habits').select('*').eq('user_id', user.id).eq('status', 'active'),
        supabase.from('habit_completions').select('*').eq('user_id', user.id).eq('date', today),
        supabase
          .from('meals')
          .select('*')
          .eq('user_id', user.id)
          .gte('logged_at', `${today}T00:00:00`)
          .order('logged_at', { ascending: false }),
        supabase.from('streaks').select('*').eq('user_id', user.id),
        supabase
          .from('insights')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (water.data) {
        dispatch(
          setWaterLogs(
            water.data.map((r) => ({ id: r.id, amountMl: r.amount_ml, loggedAt: r.logged_at })),
          ),
        );
      }
      if (sleep.data) {
        dispatch(
          setSleepLogs(
            sleep.data.map((r) => ({
              id: r.id,
              date: r.date,
              durationMin: r.duration_min,
              quality: r.quality ?? undefined,
              sleepStart: r.sleep_start ?? undefined,
              sleepEnd: r.sleep_end ?? undefined,
            })),
          ),
        );
      }
      if (hab.data) {
        dispatch(
          setHabits(
            hab.data.map((r) => ({
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
      if (comp.data) {
        dispatch(
          setCompletions(
            comp.data.map((r) => ({ id: r.id, habitId: r.habit_id, date: r.date, count: r.count })),
          ),
        );
      }
      if (meals.data) {
        dispatch(
          setMeals(
            meals.data.map((r) => ({
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
      if (stk.data) {
        dispatch(
          setStreaks(
            stk.data.map((r) => ({
              type: r.type,
              current: r.current,
              longest: r.longest,
              lastDate: r.last_date,
            })),
          ),
        );
      }
      if (ins.data?.[0]) {
        setInsight({
          id: ins.data[0].id,
          text: ins.data[0].text,
          category: ins.data[0].category,
          createdAt: ins.data[0].created_at,
        });
      }
    } catch {
      showToast('Could not refresh dashboard', 'error');
    }
  }, [user?.id, today, dispatch, showToast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const activeHabits = habits.filter((h) => h.status === 'active');
  const completedCount = todayCompletionIds.length;
  const totalCal = todayMeals.reduce((s, m) => s + (m.calories ?? 0), 0);
  const hydPct = dailyGoalMl > 0 ? todayTotalMl / dailyGoalMl : 0;
  const habPct = activeHabits.length > 0 ? completedCount / activeHabits.length : 0;
  const sleepHrs = lastNight ? (lastNight.durationMin / 60).toFixed(1) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.tint}
            colors={[theme.tint]}
          />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.header}>
          <Text style={[styles.greeting, { color: theme.text }]}>
            {getGreeting(profile?.name ?? '')}
          </Text>
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {format(new Date(), 'EEEE, MMMM d')}
          </Text>
        </Animated.View>

        {/* 1 · Insight Card */}
        <Animated.View entering={FadeInDown.delay(60).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#1E2550', '#232845'] : ['#EEF2FF', '#F0E8FF']}
            style={[styles.card, styles.insightCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={[styles.chipLabel, { color: theme.tint }]}>✨ Daily Insight</Text>
            <Text style={[styles.insightText, { color: theme.text }]}>
              {insight?.text ??
                'Your personalized insights will appear here as you build your health habits with Aurora.'}
            </Text>
            {insight?.category ? (
              <Text style={[styles.insightCategory, { color: theme.textSecondary }]}>
                {insight.category}
              </Text>
            ) : null}
          </LinearGradient>
        </Animated.View>

        {/* 2 · Hydration Card */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card }]}
            onPress={() => router.push('/hydration')}
            activeOpacity={0.82}
          >
            <View style={styles.cardRow}>
              <View style={styles.cardLeft}>
                <View style={styles.labelRow}>
                  <Ionicons name="water" size={15} color={theme.hydration} />
                  <Text style={[styles.chipLabel, { color: theme.hydration, marginLeft: 5 }]}>
                    Hydration
                  </Text>
                </View>
                <Text style={[styles.bigValue, { color: theme.text }]}>
                  {todayTotalMl.toLocaleString()}
                  <Text style={[styles.unit, { color: theme.textSecondary }]}> ml</Text>
                </Text>
                <Text style={[styles.subText, { color: theme.textSecondary }]}>
                  of {dailyGoalMl.toLocaleString()} ml goal
                </Text>
              </View>
              <ProgressRing
                progress={hydPct}
                size={68}
                color={theme.hydration}
                label={`${Math.round(hydPct * 100)}%`}
                strokeWidth={7}
              />
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, hydPct * 100)}%` as `${number}%`,
                    backgroundColor: theme.hydration,
                  },
                ]}
              />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* 3 · Sleep Card */}
        <Animated.View entering={FadeInDown.delay(180).springify()}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card }]}
            onPress={() => router.push('/sleep')}
            activeOpacity={0.82}
          >
            <View style={styles.labelRow}>
              <Ionicons name="moon" size={15} color={theme.sleep} />
              <Text style={[styles.chipLabel, { color: theme.sleep, marginLeft: 5 }]}>Sleep</Text>
            </View>
            {sleepHrs ? (
              <View style={styles.sleepRow}>
                <Text style={[styles.bigValue, { color: theme.text }]}>
                  {sleepHrs}
                  <Text style={[styles.unit, { color: theme.textSecondary }]}> hrs</Text>
                </Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons
                      key={s}
                      name={s <= (lastNight?.quality ?? 0) ? 'star' : 'star-outline'}
                      size={15}
                      color={s <= (lastNight?.quality ?? 0) ? theme.sleep : theme.border}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <Text style={[styles.subText, { color: theme.textSecondary, marginTop: 6 }]}>
                No sleep logged yet — tap to add
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* 3b · Activity Card (Apple Health) */}
        {hkConnected && (
          <Animated.View entering={FadeInDown.delay(210).springify()}>
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.card }]}
              onPress={() => router.push('/health-connect')}
              activeOpacity={0.82}
            >
              <View style={styles.labelRow}>
                <Ionicons name="walk" size={15} color={theme.habits} />
                <Text style={[styles.chipLabel, { color: theme.habits, marginLeft: 5 }]}>
                  Activity
                </Text>
                <View style={styles.hkBadge}>
                  <Ionicons name="heart" size={9} color="#FF4F6D" />
                  <Text style={styles.hkBadgeText}>Apple Health</Text>
                </View>
              </View>
              <View style={styles.activityRow}>
                <View style={styles.activityItem}>
                  <Text style={[styles.bigValue, { color: theme.text }]}>
                    {todaySteps.toLocaleString()}
                  </Text>
                  <Text style={[styles.subText, { color: theme.textSecondary }]}>steps</Text>
                </View>
                <View style={[styles.activityDivider, { backgroundColor: theme.border }]} />
                <View style={styles.activityItem}>
                  <Text style={[styles.bigValue, { color: theme.text }]}>
                    {todayActiveEnergyKcal.toLocaleString()}
                    <Text style={[styles.unit, { color: theme.textSecondary }]}> kcal</Text>
                  </Text>
                  <Text style={[styles.subText, { color: theme.textSecondary }]}>
                    active energy
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* 4 · Habits Card */}
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card }]}
            onPress={() => router.push('/habits')}
            activeOpacity={0.82}
          >
            <View style={styles.cardRow}>
              <View style={styles.cardLeft}>
                <View style={styles.labelRow}>
                  <Ionicons name="checkmark-circle" size={15} color={theme.habits} />
                  <Text style={[styles.chipLabel, { color: theme.habits, marginLeft: 5 }]}>
                    Habits
                  </Text>
                </View>
                <Text style={[styles.bigValue, { color: theme.text }]}>
                  {completedCount}
                  <Text style={[styles.unit, { color: theme.textSecondary }]}>
                    /{activeHabits.length}
                  </Text>
                </Text>
                <Text style={[styles.subText, { color: theme.textSecondary }]}>
                  completed today
                </Text>
              </View>
              <ProgressRing
                progress={habPct}
                size={68}
                color={theme.habits}
                label={`${completedCount}/${activeHabits.length}`}
                strokeWidth={7}
              />
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* 5 · Nutrition Card */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: theme.card }]}
            onPress={() => router.push('/nutrition')}
            activeOpacity={0.82}
          >
            <View style={styles.labelRow}>
              <Ionicons name="restaurant" size={15} color={theme.nutrition} />
              <Text style={[styles.chipLabel, { color: theme.nutrition, marginLeft: 5 }]}>
                Nutrition
              </Text>
            </View>
            <Text style={[styles.bigValue, { color: theme.text }]}>
              {todayMeals.length}
              <Text style={[styles.unit, { color: theme.textSecondary }]}>
                {' '}
                meal{todayMeals.length !== 1 ? 's' : ''} logged
              </Text>
            </Text>
            {totalCal > 0 && (
              <Text style={[styles.subText, { color: theme.textSecondary }]}>
                {totalCal} kcal today
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* 6 · Streak Card */}
        <Animated.View entering={FadeInDown.delay(360).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#2A1820', '#1E1425'] : ['#FFF5F5', '#FFF0F0']}
            style={[styles.card, styles.streakCard]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.labelRow}>
              <Text style={{ fontSize: 15 }}>🔥</Text>
              <Text style={[styles.chipLabel, { color: theme.streak, marginLeft: 5 }]}>
                Streaks
              </Text>
            </View>
            {streaks.length > 0 ? (
              <View style={styles.streaksRow}>
                {streaks.map((s) => (
                  <View
                    key={s.type}
                    style={[styles.streakChip, { backgroundColor: theme.streak + '18' }]}
                  >
                    <Text style={styles.streakEmoji}>{STREAK_EMOJI[s.type] ?? '⭐'}</Text>
                    <Text style={[styles.streakNum, { color: theme.streak }]}>{s.current}</Text>
                    <Text style={[styles.streakLabel, { color: theme.textSecondary }]}>
                      {s.type}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={[styles.subText, { color: theme.textSecondary, marginTop: 6 }]}>
                Start logging to build your streaks!
              </Text>
            )}
          </LinearGradient>
        </Animated.View>

        <View style={{ height: 110 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  header: { paddingTop: 8, marginBottom: 20 },
  greeting: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  dateText: { fontSize: 14, marginTop: 4, fontWeight: '500' },
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  insightCard: { paddingVertical: 22 },
  streakCard: {},
  insightText: { fontSize: 16, lineHeight: 25, fontWeight: '500', marginTop: 8 },
  insightCategory: {
    fontSize: 11,
    marginTop: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLeft: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  chipLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bigValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginBottom: 2 },
  unit: { fontSize: 16, fontWeight: '500' },
  subText: { fontSize: 13, fontWeight: '500' },
  progressBar: { height: 6, borderRadius: 3, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  sleepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  starRow: { flexDirection: 'row', gap: 3 },
  hkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,79,109,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  hkBadgeText: { fontSize: 9, fontWeight: '700', color: '#FF4F6D', letterSpacing: 0.2 },
  activityRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  activityItem: { flex: 1 },
  activityDivider: { width: 1, height: 36, marginHorizontal: 16 },
  streaksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  streakChip: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    minWidth: 72,
  },
  streakEmoji: { fontSize: 20, marginBottom: 3 },
  streakNum: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  streakLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
