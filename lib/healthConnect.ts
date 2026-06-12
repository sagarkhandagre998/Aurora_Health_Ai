import { Platform } from 'react-native';
import type { DailyValue, HealthSleepSample, HealthWaterSample } from './healthProvider';

/**
 * Guarded Android Health Connect wrapper.
 *
 * Mirrors the shape of `lib/healthkit.ts` so the sync engine can treat both
 * providers identically. The native module (`react-native-health-connect`) is
 * lazily required and every function is safe to call on any platform — they
 * no-op when Health Connect isn't available.
 */

// ── Lazy native module resolution ──────────────────────────────────────────
let _hc: any | null = null;
let _resolved = false;

function getHC(): any | null {
  if (_resolved) return _hc;
  _resolved = true;
  if (Platform.OS !== 'android') {
    _hc = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _hc = require('react-native-health-connect');
  } catch {
    _hc = null;
  }
  return _hc;
}

/**
 * True only on Android with the native Health Connect JS module linked.
 * NOTE: this does NOT guarantee the Health Connect SDK/app is installed on the
 * device — use `getSdkStatus()` for that. We keep this loose so the UI still
 * renders (and can prompt to install) rather than hiding the feature entirely.
 */
export function isHealthConnectAvailable(): boolean {
  return Platform.OS === 'android' && getHC() != null;
}

/** Health Connect availability on this device, derived from the SDK status. */
export type HCStatus = 'available' | 'not_installed' | 'update_required' | 'unsupported';

/**
 * Probe the on-device Health Connect SDK status. Never throws.
 * Returns 'unsupported' if the module isn't linked or the call fails.
 */
export async function getSdkStatus(): Promise<HCStatus> {
  const hc = getHC();
  if (!hc || typeof hc.getSdkStatus !== 'function') return 'unsupported';
  try {
    const status = await hc.getSdkStatus();
    const C = hc.SdkAvailabilityStatus ?? {};
    if (status === C.SDK_AVAILABLE) return 'available';
    if (status === C.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update_required';
    return 'not_installed';
  } catch {
    return 'unsupported';
  }
}

/** Open the Health Connect app / Play Store listing so the user can install it. */
export function openSettings(): void {
  const hc = getHC();
  try {
    hc?.openHealthConnectSettings?.();
  } catch {
    // no-op
  }
}

// ── Permissions ─────────────────────────────────────────────────────────────
const REQUESTED_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Hydration' },
  { accessType: 'write', recordType: 'Hydration' },
];

/**
 * Initialize Health Connect and request permissions.
 * Resolves true when the client initializes and at least one permission is
 * granted. Returns false if the Health Connect app isn't installed/available.
 */
export async function requestPermissions(): Promise<boolean> {
  const hc = getHC();
  if (!hc) return false;
  try {
    // Guard: don't touch initialize() unless the SDK is actually present,
    // otherwise the native layer can throw/crash on some devices.
    const status = await getSdkStatus();
    if (status !== 'available') return false;
    const ok = await hc.initialize();
    if (!ok) return false;
    const granted = await hc.requestPermission(REQUESTED_PERMISSIONS);
    return Array.isArray(granted) ? granted.length > 0 : !!granted;
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function toDateKey(iso: string): string {
  return new Date(iso).toISOString().split('T')[0];
}

function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

function timeRange(days: number) {
  return {
    timeRangeFilter: {
      operator: 'between',
      startTime: startOfDaysAgo(days - 1).toISOString(),
      endTime: new Date().toISOString(),
    },
  };
}

async function read(recordType: string, days: number): Promise<any[]> {
  const hc = getHC();
  if (!hc) return [];
  try {
    await hc.initialize();
    const res = await hc.readRecords(recordType, timeRange(days));
    return res?.records ?? (Array.isArray(res) ? res : []);
  } catch {
    return [];
  }
}

// ── Steps ─────────────────────────────────────────────────────────────────────
export async function getStepsSeries(days = 7): Promise<DailyValue[]> {
  const records = await read('Steps', days);
  const byDay = new Map<string, number>();
  for (const r of records) {
    const key = toDateKey(r.startTime);
    byDay.set(key, (byDay.get(key) ?? 0) + (r.count ?? 0));
  }
  return Array.from(byDay.entries()).map(([date, value]) => ({ date, value: Math.round(value) }));
}

/** Total step count for today. */
export async function getTodaySteps(): Promise<number> {
  const series = await getStepsSeries(1);
  const today = new Date().toISOString().split('T')[0];
  return series.find((d) => d.date === today)?.value ?? 0;
}

// ── Active energy ─────────────────────────────────────────────────────────────
export async function getActiveEnergySeries(days = 7): Promise<DailyValue[]> {
  const records = await read('ActiveCaloriesBurned', days);
  const byDay = new Map<string, number>();
  for (const r of records) {
    const kcal = r.energy?.inKilocalories ?? r.energy?.value ?? 0;
    const key = toDateKey(r.startTime);
    byDay.set(key, (byDay.get(key) ?? 0) + kcal);
  }
  return Array.from(byDay.entries()).map(([date, value]) => ({ date, value: Math.round(value) }));
}

// ── Sleep ─────────────────────────────────────────────────────────────────────
// Health Connect sleep stage codes → our value strings (compatible with the
// aggregator in healthSync.ts which counts any "ASLEEP"-like value).
const STAGE_ASLEEP = new Set([2, 4, 5, 6]); // SLEEPING, LIGHT, DEEP, REM

export async function getSleepSamples(days = 14): Promise<HealthSleepSample[]> {
  const records = await read('SleepSession', days);
  const out: HealthSleepSample[] = [];
  for (const session of records) {
    const source = session.metadata?.dataOrigin;
    const stages = Array.isArray(session.stages) ? session.stages : [];
    if (stages.length > 0) {
      for (const st of stages) {
        out.push({
          startDate: st.startTime,
          endDate: st.endTime,
          value: STAGE_ASLEEP.has(st.stage) ? 'ASLEEP' : 'AWAKE',
          sourceName: source,
        });
      }
    } else {
      // No staged data — treat the whole session as asleep.
      out.push({
        startDate: session.startTime,
        endDate: session.endTime,
        value: 'ASLEEP',
        sourceName: source,
      });
    }
  }
  return out;
}

// ── Water ─────────────────────────────────────────────────────────────────────
export async function getWaterSamples(days = 7): Promise<HealthWaterSample[]> {
  const records = await read('Hydration', days);
  return records.map((r) => ({
    id: r.metadata?.id,
    startDate: r.startTime,
    endDate: r.endTime,
    value: Math.round((r.volume?.inLiters ?? r.volume?.value ?? 0) * 1000), // L → ml
    sourceName: r.metadata?.dataOrigin,
  }));
}

/** Write a water entry to Health Connect. Resolves the created record id or null. */
export async function saveWater(amountMl: number, date = new Date()): Promise<string | null> {
  const hc = getHC();
  if (!hc || amountMl <= 0) return null;
  try {
    await hc.initialize();
    const iso = date.toISOString();
    const ids = await hc.insertRecords([
      {
        recordType: 'Hydration',
        startTime: iso,
        endTime: iso,
        volume: { value: amountMl / 1000, unit: 'liters' },
      },
    ]);
    return Array.isArray(ids) ? (ids[0] ?? null) : (ids ?? null);
  } catch {
    return null;
  }
}
