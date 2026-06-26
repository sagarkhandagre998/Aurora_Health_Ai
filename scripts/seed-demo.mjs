/**
 * seed-demo.mjs — Fill the last 7 days of demo data for a single user.
 *
 * Signs in as the user (so RLS `auth.uid() = user_id` is satisfied) and seeds
 * hydration, sleep, habits + completions, meals, and streaks. Idempotent: it
 * clears the seeded 7-day window first, so re-running won't pile up duplicates.
 *
 * Run: node scripts/seed-demo.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://knjxbuenymfiumjvbsvs.supabase.co';
const ANON_KEY = 'sb_publishable_rXdbB8EvEX8dEQFJbw-OrA_03rwFCPw';
const EMAIL = 'sagarkhandagre789@gmail.com';
const PASSWORD = '12345678';

const DAYS = 7;

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── helpers ──────────────────────────────────────────────────────────────────
const ymd = (d) => d.toISOString().split('T')[0];
const rand = (min, max) => Math.round(min + Math.random() * (max - min));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ISO timestamp for a given day offset (0 = today) at a fixed UTC hour:minute.
function tsOn(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dayOffset);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}
function dateOn(dayOffset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return ymd(d);
}

const HABITS = [
  { name: 'Morning walk', icon: 'walk', hitRate: 0.85 },
  { name: 'Meditate 10 min', icon: 'leaf', hitRate: 0.7 },
  { name: 'Stretch', icon: 'body', hitRate: 1.0 },
  { name: 'Read 20 min', icon: 'book', hitRate: 0.6 },
  { name: 'Take vitamins', icon: 'medkit', hitRate: 0.85 },
];

const BREAKFASTS = [
  { name: 'Oats with banana & peanut butter', calories: 420, protein_g: 18, carbs_g: 58, fat_g: 12 },
  { name: 'Veg poha', calories: 350, protein_g: 9, carbs_g: 60, fat_g: 8 },
  { name: 'Greek yogurt & berries', calories: 300, protein_g: 22, carbs_g: 34, fat_g: 6 },
  { name: 'Masala omelette & toast', calories: 460, protein_g: 26, carbs_g: 30, fat_g: 24 },
  { name: 'Idli with sambar', calories: 330, protein_g: 12, carbs_g: 58, fat_g: 5 },
];
const LUNCHES = [
  { name: 'Paneer rice bowl', calories: 680, protein_g: 34, carbs_g: 78, fat_g: 22 },
  { name: 'Grilled chicken salad', calories: 540, protein_g: 45, carbs_g: 28, fat_g: 24 },
  { name: 'Rajma chawal', calories: 640, protein_g: 22, carbs_g: 96, fat_g: 14 },
  { name: 'Veg pulao with raita', calories: 600, protein_g: 16, carbs_g: 88, fat_g: 18 },
  { name: 'Dal, roti & sabzi', calories: 580, protein_g: 24, carbs_g: 74, fat_g: 16 },
];
const DINNERS = [
  { name: 'Tofu stir-fry with noodles', calories: 620, protein_g: 30, carbs_g: 72, fat_g: 20 },
  { name: 'Fish curry with rice', calories: 660, protein_g: 40, carbs_g: 70, fat_g: 18 },
  { name: 'Khichdi with curd', calories: 480, protein_g: 18, carbs_g: 72, fat_g: 10 },
  { name: 'Chicken wrap', calories: 560, protein_g: 38, carbs_g: 48, fat_g: 22 },
  { name: 'Mixed veg & chapati', calories: 500, protein_g: 16, carbs_g: 66, fat_g: 14 },
];
const SNACKS = [
  { name: 'Apple & almonds', calories: 200, protein_g: 6, carbs_g: 24, fat_g: 11 },
  { name: 'Protein shake', calories: 180, protein_g: 25, carbs_g: 9, fat_g: 3 },
  { name: 'Roasted chana', calories: 160, protein_g: 9, carbs_g: 22, fat_g: 4 },
  { name: 'Banana', calories: 105, protein_g: 1, carbs_g: 27, fat_g: 0 },
];

async function main() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authErr) throw new Error(`Sign-in failed: ${authErr.message}`);
  const userId = auth.user.id;
  console.log(`✓ Signed in as ${EMAIL} (${userId})`);

  const since = dateOn(DAYS - 1); // earliest day we touch, e.g. 7 days ago
  const sinceTs = `${since}T00:00:00`;

  // ── Clean the 7-day window (idempotent re-runs) ─────────────────────────────
  await supabase.from('water_logs').delete().eq('user_id', userId).gte('logged_at', sinceTs);
  await supabase.from('meals').delete().eq('user_id', userId).gte('logged_at', sinceTs);
  await supabase.from('sleep_logs').delete().eq('user_id', userId).gte('date', since);
  await supabase.from('habit_completions').delete().eq('user_id', userId).gte('date', since);
  console.log('✓ Cleared existing last-7-days data');

  // ── Profile (make sure dashboard shows, not onboarding) ─────────────────────
  await supabase
    .from('profiles')
    .update({
      name: 'Sagar',
      onboarding_complete: true,
      goals: ['Stay hydrated', 'Sleep better', 'Eat balanced', 'Build habits'],
    })
    .eq('id', userId);

  // ── Hydration ───────────────────────────────────────────────────────────────
  const waterRows = [];
  for (let d = 0; d < DAYS; d++) {
    // 4–6 sips across the day, total ~1.8–2.6 L
    const sips = [
      { h: 8, ml: pick([250, 300]) },
      { h: 11, ml: pick([250, 300, 500]) },
      { h: 14, ml: pick([300, 500]) },
      { h: 17, ml: pick([250, 300]) },
      { h: 20, ml: pick([300, 500]) },
    ];
    if (Math.random() > 0.5) sips.push({ h: 22, ml: 250 });
    for (const s of sips) {
      waterRows.push({ user_id: userId, amount_ml: s.ml, logged_at: tsOn(d, s.h, rand(0, 55)) });
    }
  }
  {
    const { error } = await supabase.from('water_logs').insert(waterRows);
    if (error) throw new Error(`water_logs: ${error.message}`);
    console.log(`✓ Hydration: ${waterRows.length} entries`);
  }

  // ── Sleep ───────────────────────────────────────────────────────────────────
  const sleepRows = [];
  for (let d = 0; d < DAYS; d++) {
    const hours = +(6.5 + Math.random() * 1.8).toFixed(1); // 6.5–8.3h
    const duration = Math.round(hours * 60);
    // Slept from ~23:00 the night before to morning.
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - d);
    end.setUTCHours(7, rand(0, 45), 0, 0);
    const start = new Date(end.getTime() - duration * 60 * 1000);
    sleepRows.push({
      user_id: userId,
      date: dateOn(d),
      sleep_start: start.toISOString(),
      sleep_end: end.toISOString(),
      duration_min: duration,
      quality: rand(6, 9),
    });
  }
  {
    const { error } = await supabase
      .from('sleep_logs')
      .upsert(sleepRows, { onConflict: 'user_id,date' });
    if (error) throw new Error(`sleep_logs: ${error.message}`);
    console.log(`✓ Sleep: ${sleepRows.length} nights`);
  }

  // ── Habits (reuse existing by name, else create) ────────────────────────────
  const { data: existingHabits } = await supabase
    .from('habits')
    .select('id, name')
    .eq('user_id', userId);
  const byName = new Map((existingHabits ?? []).map((h) => [h.name, h.id]));

  const toCreate = HABITS.filter((h) => !byName.has(h.name)).map((h) => ({
    user_id: userId,
    name: h.name,
    icon: h.icon,
    frequency: 'daily',
    target_per_day: 1,
    status: 'active',
  }));
  if (toCreate.length) {
    const { data: created, error } = await supabase.from('habits').insert(toCreate).select('id, name');
    if (error) throw new Error(`habits: ${error.message}`);
    for (const h of created) byName.set(h.name, h.id);
  }
  console.log(`✓ Habits: ${byName.size} active`);

  // ── Habit completions ───────────────────────────────────────────────────────
  const compRows = [];
  for (const h of HABITS) {
    const habitId = byName.get(h.name);
    for (let d = 0; d < DAYS; d++) {
      // Force a few completions today so the dashboard "today" looks active.
      const doneToday = d === 0 && h.hitRate >= 0.7;
      if (doneToday || Math.random() < h.hitRate) {
        compRows.push({ user_id: userId, habit_id: habitId, date: dateOn(d), count: 1 });
      }
    }
  }
  {
    const { error } = await supabase
      .from('habit_completions')
      .upsert(compRows, { onConflict: 'habit_id,date' });
    if (error) throw new Error(`habit_completions: ${error.message}`);
    console.log(`✓ Habit completions: ${compRows.length}`);
  }

  // ── Meals ───────────────────────────────────────────────────────────────────
  const mealRows = [];
  for (let d = 0; d < DAYS; d++) {
    const add = (meal, type, hour) =>
      mealRows.push({
        user_id: userId,
        name: meal.name,
        meal_type: type,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        logged_at: tsOn(d, hour, rand(0, 50)),
      });
    add(pick(BREAKFASTS), 'breakfast', 8);
    add(pick(LUNCHES), 'lunch', 13);
    add(pick(DINNERS), 'dinner', 20);
    if (Math.random() > 0.4) add(pick(SNACKS), 'snack', 17);
  }
  {
    const { error } = await supabase.from('meals').insert(mealRows);
    if (error) throw new Error(`meals: ${error.message}`);
    console.log(`✓ Meals: ${mealRows.length} entries`);
  }

  // ── Streaks ─────────────────────────────────────────────────────────────────
  const today = dateOn(0);
  const streakRows = [
    { user_id: userId, type: 'hydration', current: 7, longest: 14, last_date: today },
    { user_id: userId, type: 'sleep', current: 7, longest: 11, last_date: today },
    { user_id: userId, type: 'habit', current: 5, longest: 9, last_date: today },
    { user_id: userId, type: 'nutrition', current: 7, longest: 12, last_date: today },
  ];
  {
    const { error } = await supabase
      .from('streaks')
      .upsert(streakRows, { onConflict: 'user_id,type' });
    if (error) throw new Error(`streaks: ${error.message}`);
    console.log('✓ Streaks: 4 types updated');
  }

  await supabase.auth.signOut();
  console.log('\n✅ Done — last 7 days seeded. Pull-to-refresh in the app to see it.');
}

main().catch((e) => {
  console.error('\n❌ Seed failed:', e.message);
  process.exit(1);
});
