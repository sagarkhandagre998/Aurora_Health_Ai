import { supabase } from './supabase';
import {
  isHealthKitAvailable,
  getStepsSeries,
  getActiveEnergySeries,
  getSleepSamples,
  getWaterSamples,
  saveWater,
  type HealthSleepSample,
} from './healthkit';
import type { AppDispatch } from '@/store';
import { setActivitySeries, setLastSyncedAt } from '@/store/slices/activitySlice';
import { setLogs as setSleepLogs } from '@/store/slices/sleepSlice';
import { setLogs as setWaterLogs } from '@/store/slices/hydrationSlice';
import type { ActivityDay, HealthMetric, SleepLog, WaterLog } from '@/types';

/** Name(s) this app reports samples under in HealthKit (to skip re-importing our own writes). */
const APP_SOURCE_HINTS = ['aurora', 'health tracker', 'healthtracker'];

function isOwnSource(sourceName?: string): boolean {
  if (!sourceName) return false;
  const s = sourceName.toLowerCase();
  return APP_SOURCE_HINTS.some((h) => s.includes(h));
}

function toDateKey(iso: string): string {
  return new Date(iso).toISOString().split('T')[0];
}

// ── Sleep aggregation ────────────────────────────────────────────────────────
const ASLEEP_VALUES = new Set(['ASLEEP', 'CORE', 'DEEP', 'REM', 'ASLEEPUNSPECIFIED']);

interface AggregatedNight {
  date: string;
  durationMin: number;
  sleepStart: string;
  sleepEnd: string;
}

/** Collapse raw HealthKit sleep samples into one "asleep" total per night. */
function aggregateSleep(samples: HealthSleepSample[]): AggregatedNight[] {
  const byNight = new Map<string, { min: number; start: number; end: number }>();
  for (const s of samples) {
    const v = (s.value || '').toUpperCase();
    // Count only true "asleep" categories; ignore INBED/AWAKE to avoid inflation.
    const isAsleep = ASLEEP_VALUES.has(v) || v.includes('ASLEEP');
    if (!isAsleep) continue;
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    if (!(end > start)) continue;
    // Attribute the night to the wake (end) day.
    const key = toDateKey(s.endDate);
    const cur = byNight.get(key) ?? { min: 0, start, end };
    cur.min += (end - start) / 60000;
    cur.start = Math.min(cur.start, start);
    cur.end = Math.max(cur.end, end);
    byNight.set(key, cur);
  }
  return Array.from(byNight.entries())
    .map(([date, v]) => ({
      date,
      durationMin: Math.round(v.min),
      sleepStart: new Date(v.start).toISOString(),
      sleepEnd: new Date(v.end).toISOString(),
    }))
    .filter((n) => n.durationMin >= 30);
}

// ── Public API ────────────────────────────────────────────────────────────────

interface SyncResult {
  steps: number;
  activeEnergyKcal: number;
  sleepNights: number;
  waterImported: number;
}

/**
 * Pull enabled metrics from Apple Health into Supabase + Redux.
 * Safe to call on any platform — no-ops when HealthKit is unavailable.
 */
export async function syncFromHealthKit(
  userId: string,
  dispatch: AppDispatch,
  enabled: Record<HealthMetric, boolean>,
): Promise<SyncResult | null> {
  if (!isHealthKitAvailable() || !userId) return null;

  const result: SyncResult = { steps: 0, activeEnergyKcal: 0, sleepNights: 0, waterImported: 0 };

  // ── Activity (steps + active energy) → Redux only (local source of truth) ──
  if (enabled.steps || enabled.activeEnergy) {
    const [steps, energy] = await Promise.all([
      enabled.steps ? getStepsSeries(7) : Promise.resolve([]),
      enabled.activeEnergy ? getActiveEnergySeries(7) : Promise.resolve([]),
    ]);
    const dayMap = new Map<string, ActivityDay>();
    for (const s of steps) {
      dayMap.set(s.date, { date: s.date, steps: s.value, activeEnergyKcal: 0 });
    }
    for (const e of energy) {
      const row = dayMap.get(e.date) ?? { date: e.date, steps: 0, activeEnergyKcal: 0 };
      row.activeEnergyKcal = e.value;
      dayMap.set(e.date, row);
    }
    const series = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    dispatch(setActivitySeries(series));
    const today = new Date().toISOString().split('T')[0];
    const todayRow = series.find((d) => d.date === today);
    result.steps = todayRow?.steps ?? 0;
    result.activeEnergyKcal = todayRow?.activeEnergyKcal ?? 0;
  }

  // ── Sleep → sleep_logs (upsert per night) ──
  if (enabled.sleep) {
    const nights = aggregateSleep(await getSleepSamples(14));
    if (nights.length > 0) {
      await supabase.from('sleep_logs').upsert(
        nights.map((n) => ({
          user_id: userId,
          date: n.date,
          duration_min: n.durationMin,
          sleep_start: n.sleepStart,
          sleep_end: n.sleepEnd,
          source: 'apple_health',
        })),
        { onConflict: 'user_id,date' },
      );
      result.sleepNights = nights.length;
    }
    // Refresh sleep slice from DB
    const { data } = await supabase
      .from('sleep_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(14);
    if (data) {
      const mapped: SleepLog[] = data.map((r) => ({
        id: r.id,
        date: r.date,
        durationMin: r.duration_min,
        quality: r.quality ?? undefined,
        sleepStart: r.sleep_start ?? undefined,
        sleepEnd: r.sleep_end ?? undefined,
        source: r.source ?? undefined,
      }));
      dispatch(setSleepLogs(mapped));
    }
  }

  // ── Water → water_logs (import external samples, deduped by hk_uuid) ──
  if (enabled.water) {
    const samples = await getWaterSamples(7);
    const external = samples.filter((s) => s.id && !isOwnSource(s.sourceName) && s.value > 0);
    if (external.length > 0) {
      const ids = external.map((s) => s.id as string);
      const { data: existing } = await supabase
        .from('water_logs')
        .select('hk_uuid')
        .eq('user_id', userId)
        .in('hk_uuid', ids);
      const seen = new Set((existing ?? []).map((r: { hk_uuid: string }) => r.hk_uuid));
      const fresh = external.filter((s) => !seen.has(s.id as string));
      if (fresh.length > 0) {
        await supabase.from('water_logs').insert(
          fresh.map((s) => ({
            user_id: userId,
            amount_ml: s.value,
            logged_at: s.startDate,
            source: 'apple_health',
            hk_uuid: s.id,
          })),
        );
        result.waterImported = fresh.length;
      }
    }
    // Refresh today's hydration slice from DB
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('water_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('logged_at', `${today}T00:00:00`)
      .order('logged_at', { ascending: false });
    if (data) {
      const mapped: WaterLog[] = data.map((r) => ({
        id: r.id,
        amountMl: r.amount_ml,
        loggedAt: r.logged_at,
        source: r.source ?? undefined,
        hkUuid: r.hk_uuid ?? undefined,
      }));
      dispatch(setWaterLogs(mapped));
    }
  }

  dispatch(setLastSyncedAt(new Date().toISOString()));
  return result;
}

/**
 * Write a manually-logged water amount through to Apple Health and tag the
 * Supabase row with the returned HealthKit UUID (prevents re-import double counts).
 */
export async function pushWaterToHealthKit(
  rowId: string,
  amountMl: number,
  loggedAt: string,
): Promise<void> {
  if (!isHealthKitAvailable()) return;
  const uuid = await saveWater(amountMl, new Date(loggedAt));
  if (uuid && rowId && !rowId.startsWith('tmp-')) {
    await supabase.from('water_logs').update({ hk_uuid: uuid }).eq('id', rowId);
  }
}
