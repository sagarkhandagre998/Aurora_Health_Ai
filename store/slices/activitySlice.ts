import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ActivityDay, HealthMetric } from '@/types';

interface ActivityState {
  /** Whether the user has connected Apple Health (authorization granted). */
  hkConnected: boolean;
  /** Per-metric toggles controlling what gets synced. */
  enabledMetrics: Record<HealthMetric, boolean>;
  /** Today's headline figures (mirrored from `series` for quick access). */
  todaySteps: number;
  todayActiveEnergyKcal: number;
  /** Last 7 days of activity for the dashboard mini-chart, oldest → newest. */
  series: ActivityDay[];
  /** ISO timestamp of the last successful sync, or null. */
  lastSyncedAt: string | null;
}

const initialState: ActivityState = {
  hkConnected: false,
  enabledMetrics: { steps: true, activeEnergy: true, sleep: true, water: true },
  todaySteps: 0,
  todayActiveEnergyKcal: 0,
  series: [],
  lastSyncedAt: null,
};

export const activitySlice = createSlice({
  name: 'activity',
  initialState,
  reducers: {
    setHkConnected: (state, action: PayloadAction<boolean>) => {
      state.hkConnected = action.payload;
      if (!action.payload) {
        state.lastSyncedAt = null;
      }
    },
    setEnabledMetric: (
      state,
      action: PayloadAction<{ metric: HealthMetric; enabled: boolean }>,
    ) => {
      state.enabledMetrics[action.payload.metric] = action.payload.enabled;
    },
    setActivitySeries: (state, action: PayloadAction<ActivityDay[]>) => {
      state.series = action.payload;
      const today = new Date().toISOString().split('T')[0];
      const todayRow = action.payload.find((d) => d.date === today);
      state.todaySteps = todayRow?.steps ?? 0;
      state.todayActiveEnergyKcal = todayRow?.activeEnergyKcal ?? 0;
    },
    setLastSyncedAt: (state, action: PayloadAction<string | null>) => {
      state.lastSyncedAt = action.payload;
    },
    resetActivity: () => initialState,
  },
});

export const {
  setHkConnected,
  setEnabledMetric,
  setActivitySeries,
  setLastSyncedAt,
  resetActivity,
} = activitySlice.actions;
export default activitySlice.reducer;
