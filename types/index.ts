export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type Gender = 'male' | 'female' | 'other' | 'prefer_not';
export type HealthGoal =
  | 'improve_hydration'
  | 'sleep_better'
  | 'build_habits'
  | 'eat_healthier'
  | 'improve_energy'
  | 'improve_consistency';

export interface Profile {
  id: string;
  name: string;
  age?: number;
  gender?: Gender;
  heightCm?: number;
  weightKg?: number;
  wakeTime?: string; // "07:00"
  bedtime?: string; // "23:00"
  activityLevel?: ActivityLevel;
  goals: HealthGoal[];
  notificationPrefs: { hydration: boolean; sleep: boolean; habits: boolean; insights: boolean };
  onboardingComplete: boolean;
}
export type LogSource = 'manual' | 'apple_health' | 'ai';

export interface WaterLog {
  id: string;
  amountMl: number;
  loggedAt: string;
  source?: LogSource;
  hkUuid?: string;
}
export interface SleepLog {
  id: string;
  date: string;
  durationMin: number;
  quality?: number;
  sleepStart?: string;
  sleepEnd?: string;
  source?: LogSource;
  hkUuid?: string;
}
export interface Habit {
  id: string;
  name: string;
  icon?: string;
  frequency: 'daily' | 'weekly';
  targetPerDay: number;
  status: 'active' | 'paused';
  createdAt: string;
}
export interface HabitCompletion {
  id: string;
  habitId: string;
  date: string;
  count: number;
}
export interface Meal {
  id: string;
  name: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  loggedAt: string;
}
export interface Streak {
  type: 'hydration' | 'sleep' | 'habit' | 'nutrition';
  current: number;
  longest: number;
  lastDate: string;
}
export interface Insight {
  id: string;
  text: string;
  category: string;
  createdAt: string;
}

// ── Apple Health / Device integration ──────────────────────────────────
export type HealthMetric = 'steps' | 'activeEnergy' | 'sleep' | 'water';

export interface ActivityDay {
  date: string; // "YYYY-MM-DD"
  steps: number;
  activeEnergyKcal: number;
}
