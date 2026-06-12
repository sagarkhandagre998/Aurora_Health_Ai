import { Platform } from 'react-native';

/**
 * Unified health-provider facade.
 *
 * Selects Apple HealthKit on iOS and Android Health Connect on Android, exposing
 * one identical API to the sync engine and UI. Each underlying wrapper is
 * platform-guarded and lazily requires its native module, so importing this file
 * is safe everywhere and the wrong-platform module never loads.
 */

// ── Shared data shapes (single source of truth for both providers) ──────────
export interface DailyValue {
  date: string; // "YYYY-MM-DD"
  value: number;
}

export interface HealthSleepSample {
  startDate: string;
  endDate: string;
  value: string; // 'ASLEEP' | 'AWAKE' | 'CORE' | 'DEEP' | 'REM' | 'INBED' ...
  sourceName?: string;
}

export interface HealthWaterSample {
  id?: string;
  startDate: string;
  endDate: string;
  value: number; // millilitres
  sourceName?: string;
}

export interface HealthProvider {
  /** Stable key used for provenance + source matching. */
  key: 'apple_health' | 'health_connect';
  /** User-facing name, e.g. "Apple Health". */
  displayName: string;
  isAvailable(): boolean;
  requestPermissions(): Promise<boolean>;
  getStepsSeries(days?: number): Promise<DailyValue[]>;
  getActiveEnergySeries(days?: number): Promise<DailyValue[]>;
  getSleepSamples(days?: number): Promise<HealthSleepSample[]>;
  getWaterSamples(days?: number): Promise<HealthWaterSample[]>;
  saveWater(amountMl: number, date?: Date): Promise<string | null>;
}

// ── Platform selection ───────────────────────────────────────────────────────
function buildProvider(): HealthProvider | null {
  if (Platform.OS === 'ios') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hk = require('./healthkit');
    return {
      key: 'apple_health',
      displayName: 'Apple Health',
      isAvailable: hk.isHealthKitAvailable,
      requestPermissions: hk.requestPermissions,
      getStepsSeries: hk.getStepsSeries,
      getActiveEnergySeries: hk.getActiveEnergySeries,
      getSleepSamples: hk.getSleepSamples,
      getWaterSamples: hk.getWaterSamples,
      saveWater: hk.saveWater,
    };
  }
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hc = require('./healthConnect');
    return {
      key: 'health_connect',
      displayName: 'Health Connect',
      isAvailable: hc.isHealthConnectAvailable,
      requestPermissions: hc.requestPermissions,
      getStepsSeries: hc.getStepsSeries,
      getActiveEnergySeries: hc.getActiveEnergySeries,
      getSleepSamples: hc.getSleepSamples,
      getWaterSamples: hc.getWaterSamples,
      saveWater: hc.saveWater,
    };
  }
  return null;
}

let _provider: HealthProvider | null | undefined;

/** The active provider for this platform, or null on unsupported platforms. */
export function getHealthProvider(): HealthProvider | null {
  if (_provider === undefined) _provider = buildProvider();
  return _provider;
}

/** Whether a health provider exists AND its native module is usable right now. */
export function isHealthAvailable(): boolean {
  const p = getHealthProvider();
  return !!p && p.isAvailable();
}

/** User-facing provider name for the current platform (falls back gracefully). */
export function getHealthProviderName(): string {
  return getHealthProvider()?.displayName ?? 'Health';
}
