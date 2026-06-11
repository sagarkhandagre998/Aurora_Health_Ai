import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { WaterLog } from '@/types';

interface HydrationState {
  logs: WaterLog[];
  dailyGoalMl: number;
  todayTotalMl: number;
}

const initialState: HydrationState = {
  logs: [],
  dailyGoalMl: 2000,
  todayTotalMl: 0,
};

export const hydrationSlice = createSlice({
  name: 'hydration',
  initialState,
  reducers: {
    setLogs: (state, action: PayloadAction<WaterLog[]>) => {
      state.logs = action.payload;
      const today = new Date().toISOString().split('T')[0];
      state.todayTotalMl = action.payload
        .filter(l => l.loggedAt.startsWith(today))
        .reduce((sum, l) => sum + l.amountMl, 0);
    },
    addLog: (state, action: PayloadAction<WaterLog>) => {
      state.logs.unshift(action.payload);
      const today = new Date().toISOString().split('T')[0];
      if (action.payload.loggedAt.startsWith(today)) {
        state.todayTotalMl += action.payload.amountMl;
      }
    },
    removeLog: (state, action: PayloadAction<string>) => {
      const log = state.logs.find(l => l.id === action.payload);
      state.logs = state.logs.filter(l => l.id !== action.payload);
      if (log) {
        const today = new Date().toISOString().split('T')[0];
        if (log.loggedAt.startsWith(today)) state.todayTotalMl -= log.amountMl;
      }
    },
    setDailyGoal: (state, action: PayloadAction<number>) => {
      state.dailyGoalMl = action.payload;
    },
  },
});

export const { setLogs, addLog, removeLog, setDailyGoal } = hydrationSlice.actions;
export default hydrationSlice.reducer;
