/**
 * Progress & Reports — weekly progress + monthly analytics.
 *
 * Fetches 30 days of logs once, then derives everything client-side via the
 * pure helpers in utils/reports.ts. Stack screen reached from the Dashboard.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { subDays } from 'date-fns';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { ProgressRing } from '@/components/rings/ProgressRing';
import { DayBars } from '@/components/charts/DayBars';
import { Sparkline } from '@/components/charts/Sparkline';
import { RootState } from '@/store';
import { WaterLog, SleepLog, Habit, HabitCompletion, Meal, Streak } from '@/types';
import {
  dailyWater,
  dailySleep,
  dailyHabit,
  dailyCalories,
  weeklyTrend,
  consistencyScore,
  achievements,
  behaviorTrends,
  areasForImprovement,
  Trend,
} from '@/utils/reports';

type Tab = 'weekly' | 'monthly';

function TrendChip({ trend, theme }: { trend: Trend; theme: ReturnType<typeof useTheme> }) {
  const up = trend.direction === 'up';
  const flat = trend.direction === 'flat';
  const color = flat ? theme.textSecondary : up ? theme.success : theme.error;
  const icon = flat ? 'remove' : up ? 'arrow-up' : 'arrow-down';
  return (
    <View style={[chipStyles.chip, { backgroundColor: color + '18' }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[chipStyles.text, { color }]}>
        {flat ? 'Steady' : `${Math.abs(Math.round(trend.deltaPct))}%`}
      </Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  text: { fontSize: 12, fontWeight: '700' },
});

export default function ReportsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { dailyGoalMl } = useSelector((s: RootState) => s.hydration);

  const [tab, setTab] = useState<Tab>('weekly');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [water, setWater] = useState<WaterLog[]>([]);
  const [sleep, setSleep] = useState<SleepLog[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [streaks, setStreaks] = useState<Streak[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    const since = subDays(new Date(), 29).toISOString().split('T')[0];
    const [w, s, h, c, m, st] = await Promise.all([
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_at', `${since}T00:00:00`),
      supabase.from('sleep_logs').select('*').eq('user_id', user.id).gte('date', since),
      supabase.from('habits').select('*').eq('user_id', user.id),
      supabase.from('habit_completions').select('*').eq('user_id', user.id).gte('date', since),
      supabase
        .from('meals')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_at', `${since}T00:00:00`),
      supabase.from('streaks').select('*').eq('user_id', user.id),
    ]);
    if (w.data)
      setWater(w.data.map((r) => ({ id: r.id, amountMl: r.amount_ml, loggedAt: r.logged_at })));
    if (s.data)
      setSleep(
        s.data.map((r) => ({
          id: r.id,
          date: r.date,
          durationMin: r.duration_min,
          quality: r.quality ?? undefined,
          sleepStart: r.sleep_start ?? undefined,
          sleepEnd: r.sleep_end ?? undefined,
        })),
      );
    if (h.data)
      setHabits(
        h.data.map((r) => ({
          id: r.id,
          name: r.name,
          icon: r.icon ?? undefined,
          frequency: r.frequency,
          targetPerDay: r.target_per_day,
          status: r.status,
          createdAt: r.created_at,
        })),
      );
    if (c.data)
      setCompletions(
        c.data.map((r) => ({ id: r.id, habitId: r.habit_id, date: r.date, count: r.count })),
      );
    if (m.data)
      setMeals(
        m.data.map((r) => ({
          id: r.id,
          name: r.name,
          mealType: r.meal_type,
          calories: r.calories ?? undefined,
          proteinG: r.protein_g ?? undefined,
          carbsG: r.carbs_g ?? undefined,
          fatG: r.fat_g ?? undefined,
          loggedAt: r.logged_at,
        })),
      );
    if (st.data)
      setStreaks(
        st.data.map((r) => ({
          type: r.type,
          current: r.current,
          longest: r.longest,
          lastDate: r.last_date,
        })),
      );
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchAll();
      setLoading(false);
    })();
  }, [fetchAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  // ── Derived analytics (30-day window) ────────────────────────────────────
  const water30 = useMemo(() => dailyWater(water, dailyGoalMl, 30), [water, dailyGoalMl]);
  const sleep30 = useMemo(() => dailySleep(sleep, 30), [sleep]);
  const habit30 = useMemo(() => dailyHabit(habits, completions, 30), [habits, completions]);
  const cal30 = useMemo(() => dailyCalories(meals, 30), [meals]);

  const consistency = useMemo(
    () => consistencyScore(water30, sleep30, habit30, cal30),
    [water30, sleep30, habit30, cal30],
  );
  const badges = useMemo(
    () => achievements(streaks, water30, sleep30, habit30, cal30),
    [streaks, water30, sleep30, habit30, cal30],
  );
  const trends = useMemo(
    () => behaviorTrends(water30, sleep30, habit30, cal30),
    [water30, sleep30, habit30, cal30],
  );
  const improvements = useMemo(() => areasForImprovement(consistency.sub), [consistency.sub]);

  const moduleColor: Record<string, string> = {
    hydration: theme.hydration,
    sleep: theme.sleep,
    habits: theme.habits,
    nutrition: theme.nutrition,
  };

  // ── Weekly cards data ────────────────────────────────────────────────────
  const weekSlice = <T,>(arr: T[]) => arr.slice(-7);
  const weeklyCards = useMemo(() => {
    const w7 = weekSlice(water30);
    const s7 = weekSlice(sleep30);
    const h7 = weekSlice(habit30);
    const c7 = weekSlice(cal30);
    return [
      {
        key: 'hydration',
        label: 'Hydration',
        emoji: '💧',
        color: theme.hydration,
        data: w7.map((d) => ({ date: d.date, value: d.ml })),
        format: (v: number) => (v > 0 ? `${(v / 1000).toFixed(1)}L` : ''),
        headline: `${Math.round(w7.reduce((s, d) => s + d.ml, 0) / 7 / 100) / 10}L avg/day`,
        sub: `${w7.filter((d) => d.goalMet).length}/7 days goal met`,
        trend: weeklyTrend(
          water30.slice(-7).map((d) => d.ml),
          water30.slice(-14, -7).map((d) => d.ml),
        ),
      },
      {
        key: 'sleep',
        label: 'Sleep',
        emoji: '😴',
        color: theme.sleep,
        data: s7.map((d) => ({ date: d.date, value: d.min })),
        format: (v: number) => (v > 0 ? `${(v / 60).toFixed(1)}h` : ''),
        headline: `${(
          s7.filter((d) => d.min > 0).reduce((s, d) => s + d.min, 0) /
            Math.max(1, s7.filter((d) => d.min > 0).length) /
            60 || 0
        ).toFixed(1)}h avg`,
        sub: `${s7.filter((d) => d.min > 0).length}/7 nights logged`,
        trend: weeklyTrend(
          sleep30.slice(-7).map((d) => d.min),
          sleep30.slice(-14, -7).map((d) => d.min),
        ),
      },
      {
        key: 'habits',
        label: 'Habits',
        emoji: '✅',
        color: theme.habits,
        data: h7.map((d) => ({ date: d.date, value: d.completed })),
        format: (v: number) => (v > 0 ? String(v) : ''),
        headline: `${Math.round((h7.reduce((s, d) => s + d.rate, 0) / 7) * 100)}% avg completion`,
        sub: `${h7.reduce((s, d) => s + d.completed, 0)} completions`,
        trend: weeklyTrend(
          habit30.slice(-7).map((d) => d.rate * 100),
          habit30.slice(-14, -7).map((d) => d.rate * 100),
        ),
      },
      {
        key: 'nutrition',
        label: 'Nutrition',
        emoji: '🥗',
        color: theme.nutrition,
        data: c7.map((d) => ({ date: d.date, value: d.kcal })),
        format: (v: number) => (v > 0 ? `${v}` : ''),
        headline: `${Math.round(c7.reduce((s, d) => s + d.kcal, 0) / 7)} kcal avg/day`,
        sub: `${c7.filter((d) => d.mealCount > 0).length}/7 days logged`,
        trend: weeklyTrend(
          cal30.slice(-7).map((d) => d.kcal),
          cal30.slice(-14, -7).map((d) => d.kcal),
        ),
      },
    ];
  }, [water30, sleep30, habit30, cal30, theme]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />
        }
      >
        {/* Tab toggle */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <View
            style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            {(['weekly', 'monthly'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.segmentBtn, tab === t && { backgroundColor: theme.tint }]}
                onPress={() => setTab(t)}
                activeOpacity={0.85}
              >
                <Text
                  style={[styles.segmentText, { color: tab === t ? '#fff' : theme.textSecondary }]}
                >
                  {t === 'weekly' ? 'Weekly' : 'Monthly'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {tab === 'weekly' ? (
          <View>
            {weeklyCards.map((card, idx) => (
              <Animated.View key={card.key} entering={FadeInDown.delay(60 + idx * 60).springify()}>
                <View style={[styles.card, { backgroundColor: theme.card }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardEmoji}>{card.emoji}</Text>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>{card.label}</Text>
                    </View>
                    <TrendChip trend={card.trend} theme={theme} />
                  </View>
                  <DayBars
                    data={card.data}
                    color={card.color}
                    formatValue={card.format}
                    labelColor={theme.textSecondary}
                  />
                  <View style={styles.cardFooter}>
                    <Text style={[styles.cardHeadline, { color: card.color }]}>
                      {card.headline}
                    </Text>
                    <Text style={[styles.cardSub, { color: theme.textSecondary }]}>{card.sub}</Text>
                  </View>
                </View>
              </Animated.View>
            ))}
            <Text style={[styles.trendNote, { color: theme.textSecondary }]}>
              Trend chips compare this week against the previous week.
            </Text>
          </View>
        ) : (
          <View>
            {/* Consistency Score */}
            <Animated.View entering={FadeInDown.delay(60).springify()}>
              <View style={[styles.card, styles.scoreCard, { backgroundColor: theme.card }]}>
                <ProgressRing
                  progress={consistency.score / 100}
                  size={104}
                  strokeWidth={11}
                  color={theme.tint}
                  label={`${consistency.score}`}
                  sublabel="/ 100"
                />
                <View style={styles.scoreInfo}>
                  <Text style={[styles.scoreTitle, { color: theme.text }]}>Consistency Score</Text>
                  <Text style={[styles.scoreLabel, { color: theme.tint }]}>
                    {consistency.label}
                  </Text>
                  <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
                    Across hydration, sleep, habits & nutrition over 30 days.
                  </Text>
                </View>
              </View>
            </Animated.View>

            {/* Achievements */}
            <Animated.View entering={FadeInDown.delay(120).springify()}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Achievements</Text>
              <View style={styles.badgeGrid}>
                {badges.map((b) => (
                  <View
                    key={b.key}
                    style={[
                      styles.badge,
                      {
                        backgroundColor: theme.card,
                        opacity: b.earned ? 1 : 0.5,
                        borderColor: b.earned ? theme.tint + '50' : theme.border,
                      },
                    ]}
                  >
                    <Text style={styles.badgeEmoji}>{b.earned ? b.emoji : '🔒'}</Text>
                    <Text style={[styles.badgeLabel, { color: theme.text }]} numberOfLines={1}>
                      {b.label}
                    </Text>
                    <Text
                      style={[styles.badgeDetail, { color: theme.textSecondary }]}
                      numberOfLines={2}
                    >
                      {b.detail}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* Behavior Trends */}
            <Animated.View entering={FadeInDown.delay(180).springify()}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Behavior Trends</Text>
              <View style={[styles.card, { backgroundColor: theme.card, gap: 4 }]}>
                {trends.map((t, i) => (
                  <View
                    key={t.module}
                    style={[
                      styles.trendRow,
                      i < trends.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.border,
                      },
                    ]}
                  >
                    <View style={styles.trendLeft}>
                      <Text style={styles.cardEmoji}>{t.emoji}</Text>
                      <View>
                        <Text style={[styles.trendLabel, { color: theme.text }]}>{t.label}</Text>
                        <Text style={[styles.trendValue, { color: theme.textSecondary }]}>
                          {t.valueText}
                        </Text>
                      </View>
                    </View>
                    <Sparkline
                      points={t.series}
                      color={moduleColor[t.module]}
                      width={90}
                      height={34}
                    />
                    <TrendChip trend={t.trend} theme={theme} />
                  </View>
                ))}
              </View>
            </Animated.View>

            {/* Areas for Improvement */}
            <Animated.View entering={FadeInDown.delay(240).springify()}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Areas for Improvement
              </Text>
              {improvements.length === 0 ? (
                <View style={[styles.card, styles.allGood, { backgroundColor: theme.card }]}>
                  <Text style={{ fontSize: 28 }}>🎉</Text>
                  <Text style={[styles.allGoodText, { color: theme.text }]}>
                    {"You're consistent across the board. Keep it up!"}
                  </Text>
                </View>
              ) : (
                improvements.map((a) => (
                  <View
                    key={a.module}
                    style={[
                      styles.improveCard,
                      { backgroundColor: theme.card, borderLeftColor: moduleColor[a.module] },
                    ]}
                  >
                    <View style={styles.improveHeader}>
                      <Text style={[styles.improveTitle, { color: theme.text }]}>{a.title}</Text>
                      <Text style={[styles.improvePct, { color: moduleColor[a.module] }]}>
                        {a.scorePct}%
                      </Text>
                    </View>
                    <Text style={[styles.improveTip, { color: theme.textSecondary }]}>{a.tip}</Text>
                  </View>
                ))
              )}
            </Animated.View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  segment: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segmentText: { fontSize: 14, fontWeight: '700' },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardEmoji: { fontSize: 18 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardFooter: { marginTop: 14 },
  cardHeadline: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  cardSub: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  trendNote: { fontSize: 12, textAlign: 'center', marginBottom: 8, fontStyle: 'italic' },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  scoreInfo: { flex: 1 },
  scoreTitle: { fontSize: 17, fontWeight: '800' },
  scoreLabel: { fontSize: 14, fontWeight: '700', marginTop: 2, marginBottom: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 4 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  badge: {
    width: '47%',
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 3,
  },
  badgeEmoji: { fontSize: 26, marginBottom: 2 },
  badgeLabel: { fontSize: 13, fontWeight: '700' },
  badgeDetail: { fontSize: 11, fontWeight: '500', textAlign: 'center', lineHeight: 15 },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
  },
  trendLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 110 },
  trendLabel: { fontSize: 15, fontWeight: '700' },
  trendValue: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  improveCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  improveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  improveTitle: { fontSize: 15, fontWeight: '700' },
  improvePct: { fontSize: 15, fontWeight: '800' },
  improveTip: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  allGood: { alignItems: 'center', gap: 10 },
  allGoodText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
