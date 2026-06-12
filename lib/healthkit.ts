import { Platform } from 'react-native';
import type { DailyValue, HealthSleepSample, HealthWaterSample } from './healthProvider';

/**
 * Guarded Apple HealthKit wrapper.
 *
 * The native module (`@kingstinct/react-native-health`) is lazily required so
 * that Android, web, Expo Go, and builds without the native module pod simply
 * get a disabled, no-op surface instead of a crash at import time. Every public
 * function is safe to call on any platform.
 *
 * iOS dev/standalone builds that include the config plugin will resolve the
 * real module and talk to HealthKit.
 */

// ── Lazy native module resolution ──────────────────────────────────────────
let _hk: any | null = null;
let _resolved = false;

function getHK(): any | null {
  if (_resolved) return _hk;
  _resolved = true;
  if (Platform.OS !== 'ios') {
    _hk = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-health');
    _hk = mod?.default ?? mod ?? null;
  } catch {
    _hk = null;
  }
  return _hk;
}

/** True only when running on iOS with the native HealthKit module available. */
export function isHealthKitAvailable(): boolean {
  return Platform.OS === 'ios' && getHK() != null;
}

// ── Permissions ─────────────────────────────────────────────────────────────
function buildPermissions() {
  const hk = getHK();
  const P = hk?.Constants?.Permissions ?? {};
  return {
    permissions: {
      read: [P.StepCount, P.ActiveEnergyBurned, P.SleepAnalysis, P.Water].filter(Boolean),
      write: [P.Water].filter(Boolean),
    },
  };
}

/**
 * Request HealthKit authorization. Resolves true if the native init succeeds.
 * Note: iOS never reveals whether the user granted read access (privacy), so a
 * successful init is treated as "connected".
 */
export function requestPermissions(): Promise<boolean> {
  const hk = getHK();
  if (!hk) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      hk.initHealthKit(buildPermissions(), (err: unknown) => {
        resolve(!err);
      });
    } catch {
      resolve(false);
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function toDateKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function startOfDaysAgo(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

// ── Steps ─────────────────────────────────────────────────────────────────────
/** Total step count for today. */
export function getTodaySteps(): Promise<number> {
  const hk = getHK();
  if (!hk) return Promise.resolve(0);
  return new Promise((resolve) => {
    try {
      hk.getStepCount({ date: new Date().toISOString() }, (err: unknown, res: any) => {
        resolve(err ? 0 : Math.round(res?.value ?? 0));
      });
    } catch {
      resolve(0);
    }
  });
}

/** Daily step totals for the last `days` days (inclusive of today). */
export function getStepsSeries(days = 7): Promise<DailyValue[]> {
  const hk = getHK();
  if (!hk) return Promise.resolve([]);
  const options = {
    startDate: startOfDaysAgo(days - 1).toISOString(),
    endDate: new Date().toISOString(),
    includeManuallyAdded: true,
  };
  return new Promise((resolve) => {
    try {
      hk.getDailyStepCountSamples(options, (err: unknown, res: any[]) => {
        if (err || !Array.isArray(res)) return resolve([]);
        const byDay = new Map<string, number>();
        for (const s of res) {
          const key = toDateKey(new Date(s.startDate));
          byDay.set(key, (byDay.get(key) ?? 0) + (s.value ?? 0));
        }
        resolve(
          Array.from(byDay.entries()).map(([date, value]) => ({ date, value: Math.round(value) })),
        );
      });
    } catch {
      resolve([]);
    }
  });
}

// ── Active energy ─────────────────────────────────────────────────────────────
/** Daily active-energy totals (kcal) for the last `days` days. */
export function getActiveEnergySeries(days = 7): Promise<DailyValue[]> {
  const hk = getHK();
  if (!hk) return Promise.resolve([]);
  const options = {
    startDate: startOfDaysAgo(days - 1).toISOString(),
    endDate: new Date().toISOString(),
    includeManuallyAdded: true,
  };
  return new Promise((resolve) => {
    try {
      hk.getActiveEnergyBurned(options, (err: unknown, res: any[]) => {
        if (err || !Array.isArray(res)) return resolve([]);
        const byDay = new Map<string, number>();
        for (const s of res) {
          const key = toDateKey(new Date(s.startDate));
          byDay.set(key, (byDay.get(key) ?? 0) + (s.value ?? 0));
        }
        resolve(
          Array.from(byDay.entries()).map(([date, value]) => ({ date, value: Math.round(value) })),
        );
      });
    } catch {
      resolve([]);
    }
  });
}

// ── Sleep ─────────────────────────────────────────────────────────────────────
/** Raw sleep samples for the last `days` days. */
export function getSleepSamples(days = 14): Promise<HealthSleepSample[]> {
  const hk = getHK();
  if (!hk) return Promise.resolve([]);
  const options = {
    startDate: startOfDaysAgo(days - 1).toISOString(),
    endDate: new Date().toISOString(),
    limit: 1000,
  };
  return new Promise((resolve) => {
    try {
      hk.getSleepSamples(options, (err: unknown, res: any[]) => {
        if (err || !Array.isArray(res)) return resolve([]);
        resolve(
          res.map((s) => ({
            startDate: s.startDate,
            endDate: s.endDate,
            value: String(s.value ?? ''),
            sourceName: s.sourceName,
          })),
        );
      });
    } catch {
      resolve([]);
    }
  });
}

// ── Water ─────────────────────────────────────────────────────────────────────
/** Water samples (in millilitres) for the last `days` days. */
export function getWaterSamples(days = 7): Promise<HealthWaterSample[]> {
  const hk = getHK();
  if (!hk) return Promise.resolve([]);
  const options = {
    startDate: startOfDaysAgo(days - 1).toISOString(),
    endDate: new Date().toISOString(),
    unit: 'liter',
  };
  return new Promise((resolve) => {
    try {
      hk.getWaterSamples(options, (err: unknown, res: any[]) => {
        if (err || !Array.isArray(res)) return resolve([]);
        resolve(
          res.map((s) => ({
            id: s.id,
            startDate: s.startDate,
            endDate: s.endDate,
            value: Math.round((s.value ?? 0) * 1000), // L → ml
            sourceName: s.sourceName,
          })),
        );
      });
    } catch {
      resolve([]);
    }
  });
}

/**
 * Write a water entry to HealthKit. Resolves the created sample's UUID when the
 * native module returns one, otherwise null (still considered a success).
 */
export function saveWater(amountMl: number, date = new Date()): Promise<string | null> {
  const hk = getHK();
  if (!hk || amountMl <= 0) return Promise.resolve(null);
  const options = { value: amountMl / 1000, date: date.toISOString(), unit: 'liter' };
  return new Promise((resolve) => {
    try {
      hk.saveWater(options, (err: unknown, res: any) => {
        if (err) return resolve(null);
        resolve(typeof res === 'string' ? res : (res?.id ?? res?.uuid ?? null));
      });
    } catch {
      resolve(null);
    }
  });
}
