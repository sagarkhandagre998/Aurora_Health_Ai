/**
 * reports.ts — pure analytics for the Progress & Reports screen.
 *
 * No React Native imports: deterministic functions over the raw log arrays
 * already loaded from Supabase, so they are easy to reason about and test.
 *
 * Date keys are UTC "YYYY-MM-DD" via toISOString(), matching how the rest of
 * the app keys days (water_logs.logged_at prefix, sleep_logs.date,
 * habit_completions.date, meals.logged_at prefix).
 */
import { subDays } from 'date-fns';
import { WaterLog, SleepLog, Habit, HabitCompletion, Meal, Streak } from '@/types';

export type ModuleKey = 'hydration' | 'sleep' | 'habits' | 'nutrition';

/** ISO "YYYY-MM-DD" keys for the last `n` days, oldest → newest. */
export function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(subDays(new Date(), i).toISOString().split('T')[0]);
  }
  return out;
}

// ── Per-day series ──────────────────────────────────────────────────────────

export interface WaterDay {
  date: string;
  ml: number;
  goalMet: boolean;
}
export function dailyWater(logs: WaterLog[], goalMl: number, days: number): WaterDay[] {
  return lastNDays(days).map((date) => {
    const ml = logs.filter((l) => l.loggedAt.startsWith(date)).reduce((s, l) => s + l.amountMl, 0);
    return { date, ml, goalMet: goalMl > 0 && ml >= goalMl };
  });
}

export interface SleepDay {
  date: string;
  min: number;
}
export function dailySleep(sleepLogs: SleepLog[], days: number): SleepDay[] {
  return lastNDays(days).map((date) => {
    const log = sleepLogs.find((l) => l.date === date);
    return { date, min: log?.durationMin ?? 0 };
  });
}

export interface HabitDay {
  date: string;
  completed: number;
  total: number;
  rate: number; // 0..1
}
export function dailyHabit(
  habits: Habit[],
  completions: HabitCompletion[],
  days: number,
): HabitDay[] {
  const total = habits.filter((h) => h.status === 'active').length;
  return lastNDays(days).map((date) => {
    const completed = new Set(
      completions.filter((c) => c.date === date && c.count > 0).map((c) => c.habitId),
    ).size;
    const rate = total > 0 ? Math.min(1, completed / total) : 0;
    return { date, completed, total, rate };
  });
}

export interface CalorieDay {
  date: string;
  kcal: number;
  mealCount: number;
}
export function dailyCalories(meals: Meal[], days: number): CalorieDay[] {
  return lastNDays(days).map((date) => {
    const dayMeals = meals.filter((m) => m.loggedAt.startsWith(date));
    return {
      date,
      kcal: dayMeals.reduce((s, m) => s + (m.calories ?? 0), 0),
      mealCount: dayMeals.length,
    };
  });
}

// ── Trends ──────────────────────────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'flat';
export interface Trend {
  thisAvg: number;
  lastAvg: number;
  deltaPct: number;
  direction: TrendDirection;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Compare the average of `thisWeek` against `lastWeek`. */
export function weeklyTrend(thisWeek: number[], lastWeek: number[]): Trend {
  const thisAvg = avg(thisWeek);
  const lastAvg = avg(lastWeek);
  let deltaPct: number;
  if (lastAvg === 0) deltaPct = thisAvg > 0 ? 100 : 0;
  else deltaPct = ((thisAvg - lastAvg) / lastAvg) * 100;
  const direction: TrendDirection = Math.abs(deltaPct) < 5 ? 'flat' : deltaPct > 0 ? 'up' : 'down';
  return { thisAvg, lastAvg, deltaPct, direction };
}

// ── Consistency score (0..100) over `days` ─────────────────────────────────

export interface ConsistencySubScores {
  hydration: number; // 0..1
  sleep: number;
  habits: number | null; // null when no active habits
  nutrition: number;
}
export interface ConsistencyResult {
  score: number; // 0..100
  sub: ConsistencySubScores;
  label: string;
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Outstanding';
  if (score >= 70) return 'On track';
  if (score >= 50) return 'Building up';
  if (score >= 25) return 'Getting started';
  return 'Just beginning';
}

export function consistencyScore(
  water: WaterDay[],
  sleep: SleepDay[],
  habit: HabitDay[],
  calories: CalorieDay[],
): ConsistencyResult {
  const n = Math.max(1, water.length);
  const hydration = water.filter((d) => d.goalMet).length / n;
  const sleepScore = sleep.filter((d) => d.min > 0).length / n;
  const hasHabits = habit.some((d) => d.total > 0);
  const habits = hasHabits ? avg(habit.map((d) => d.rate)) : null;
  const nutrition = calories.filter((d) => d.mealCount > 0).length / n;

  const dims = [hydration, sleepScore, nutrition, ...(habits != null ? [habits] : [])];
  const score = Math.round(avg(dims) * 100);
  return {
    score,
    sub: { hydration, sleep: sleepScore, habits, nutrition },
    label: scoreLabel(score),
  };
}

// ── Achievements ───────────────────────────────────────────────────────────

export interface Achievement {
  key: string;
  label: string;
  emoji: string;
  earned: boolean;
  detail: string;
}

const STREAK_EMOJI: Record<string, string> = {
  hydration: '💧',
  sleep: '😴',
  habit: '✅',
  nutrition: '🥗',
};

export function achievements(
  streaks: Streak[],
  water: WaterDay[],
  sleep: SleepDay[],
  habit: HabitDay[],
  calories: CalorieDay[],
): Achievement[] {
  const out: Achievement[] = [];
  const longestOf = (t: string) => streaks.find((s) => s.type === t)?.longest ?? 0;

  // Streak milestones per tracked domain.
  for (const t of ['hydration', 'sleep', 'habit', 'nutrition'] as const) {
    const longest = longestOf(t);
    const emoji = STREAK_EMOJI[t];
    const name = t === 'habit' ? 'Habit' : t.charAt(0).toUpperCase() + t.slice(1);
    out.push({
      key: `${t}_7`,
      label: `${name} Week`,
      emoji,
      earned: longest >= 7,
      detail: `7-day ${name.toLowerCase()} streak`,
    });
  }

  // Perfect day: every active dimension hit on the same day.
  const perfect = water.some((w) => {
    const s = sleep.find((x) => x.date === w.date);
    const h = habit.find((x) => x.date === w.date);
    const c = calories.find((x) => x.date === w.date);
    const habitOk = !h || h.total === 0 || h.rate >= 1;
    return w.goalMet && (s?.min ?? 0) > 0 && habitOk && (c?.mealCount ?? 0) > 0;
  });
  out.push({
    key: 'perfect_day',
    label: 'Perfect Day',
    emoji: '🌟',
    earned: perfect,
    detail: 'All goals met in one day',
  });

  // Hydration volume over the window.
  const totalMl = water.reduce((s, d) => s + d.ml, 0);
  out.push({
    key: 'hydrated_50l',
    label: 'Ocean',
    emoji: '🌊',
    earned: totalMl >= 50000,
    detail: `${(totalMl / 1000).toFixed(0)}L / 50L logged`,
  });

  // Well rested: average sleep across logged nights ≥ 7h.
  const nights = sleep.filter((d) => d.min > 0);
  const avgSleepH = nights.length ? avg(nights.map((d) => d.min)) / 60 : 0;
  out.push({
    key: 'well_rested',
    label: 'Well Rested',
    emoji: '🛌',
    earned: nights.length >= 5 && avgSleepH >= 7,
    detail: `${avgSleepH.toFixed(1)}h avg sleep`,
  });

  // Nutrition logging habit.
  const mealDays = calories.filter((d) => d.mealCount > 0).length;
  out.push({
    key: 'meal_logger',
    label: 'Food Diary',
    emoji: '📔',
    earned: mealDays >= 14,
    detail: `${mealDays} days with meals logged`,
  });

  return out;
}

// ── Behaviour trends (week over week + sparkline series) ────────────────────

export interface BehaviorTrend {
  module: ModuleKey;
  label: string;
  emoji: string;
  /** 30-day series used for the sparkline. */
  series: number[];
  trend: Trend;
  /** Human-readable current value, e.g. "1.8L" or "7.2h". */
  valueText: string;
}

function lastTwoWeeks<T>(arr: T[], pick: (x: T) => number) {
  const vals = arr.map(pick);
  return { thisWeek: vals.slice(-7), lastWeek: vals.slice(-14, -7) };
}

export function behaviorTrends(
  water: WaterDay[],
  sleep: SleepDay[],
  habit: HabitDay[],
  calories: CalorieDay[],
): BehaviorTrend[] {
  const w = lastTwoWeeks(water, (d) => d.ml);
  const s = lastTwoWeeks(sleep, (d) => d.min);
  const h = lastTwoWeeks(habit, (d) => d.rate * 100);
  const c = lastTwoWeeks(calories, (d) => d.kcal);

  const waterTrend = weeklyTrend(w.thisWeek, w.lastWeek);
  const sleepTrend = weeklyTrend(s.thisWeek, s.lastWeek);
  const habitTrend = weeklyTrend(h.thisWeek, h.lastWeek);
  const calTrend = weeklyTrend(c.thisWeek, c.lastWeek);

  return [
    {
      module: 'hydration',
      label: 'Hydration',
      emoji: '💧',
      series: water.map((d) => d.ml),
      trend: waterTrend,
      valueText: `${(waterTrend.thisAvg / 1000).toFixed(1)}L avg`,
    },
    {
      module: 'sleep',
      label: 'Sleep',
      emoji: '😴',
      series: sleep.map((d) => d.min),
      trend: sleepTrend,
      valueText: `${(sleepTrend.thisAvg / 60).toFixed(1)}h avg`,
    },
    {
      module: 'habits',
      label: 'Habits',
      emoji: '✅',
      series: habit.map((d) => d.rate * 100),
      trend: habitTrend,
      valueText: `${Math.round(habitTrend.thisAvg)}% avg`,
    },
    {
      module: 'nutrition',
      label: 'Nutrition',
      emoji: '🥗',
      series: calories.map((d) => d.kcal),
      trend: calTrend,
      valueText: `${Math.round(calTrend.thisAvg)} kcal avg`,
    },
  ];
}

// ── Areas for improvement ──────────────────────────────────────────────────

export interface ImprovementArea {
  module: ModuleKey;
  title: string;
  tip: string;
  scorePct: number;
}

const TIPS: Record<ModuleKey, { title: string; tip: string }> = {
  hydration: {
    title: 'Hydration',
    tip: 'You hit your water goal on few days. Try logging a glass right after waking up and with each meal.',
  },
  sleep: {
    title: 'Sleep',
    tip: 'Sleep tracking is patchy. Log your sleep each morning and aim for a consistent bedtime.',
  },
  habits: {
    title: 'Habits',
    tip: 'Habit completion is low. Start with one or two key habits and build from there.',
  },
  nutrition: {
    title: 'Nutrition',
    tip: 'Meals were rarely logged. Capturing even one meal a day makes your trends much clearer.',
  },
};

export function areasForImprovement(sub: ConsistencySubScores): ImprovementArea[] {
  const entries: { module: ModuleKey; score: number }[] = [
    { module: 'hydration', score: sub.hydration },
    { module: 'sleep', score: sub.sleep },
    { module: 'nutrition', score: sub.nutrition },
    ...(sub.habits != null ? [{ module: 'habits' as ModuleKey, score: sub.habits }] : []),
  ];

  return entries
    .filter((e) => e.score < 0.6)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((e) => ({
      module: e.module,
      title: TIPS[e.module].title,
      tip: TIPS[e.module].tip,
      scorePct: Math.round(e.score * 100),
    }));
}
