import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SleepLog } from '@/types';

interface SleepState {
  logs: SleepLog[];
  lastNight: SleepLog | null;
}

const initialState: SleepState = { logs: [], lastNight: null };

export const sleepSlice = createSlice({
  name: 'sleep',
  initialState,
  reducers: {
    setLogs: (state, action: PayloadAction<SleepLog[]>) => {
      state.logs = action.payload;
      state.lastNight = action.payload[0] ?? null;
    },
    upsertLog: (state, action: PayloadAction<SleepLog>) => {
      const idx = state.logs.findIndex(l => l.date === action.payload.date);
      if (idx >= 0) state.logs[idx] = action.payload;
      else state.logs.unshift(action.payload);
      // Update lastNight if it's the most recent
      const sorted = [...state.logs].sort((a,b) => b.date.localeCompare(a.date));
      state.lastNight = sorted[0] ?? null;
    },
    removeLog: (state, action: PayloadAction<string>) => {
      state.logs = state.logs.filter(l => l.id !== action.payload);
      const sorted = [...state.logs].sort((a,b) => b.date.localeCompare(a.date));
      state.lastNight = sorted[0] ?? null;
    },
  },
});

export const { setLogs, upsertLog, removeLog } = sleepSlice.actions;
export default sleepSlice.reducer;
