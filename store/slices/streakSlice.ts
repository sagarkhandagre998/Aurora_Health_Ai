import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Streak } from '@/types';

interface StreakState {
  streaks: Streak[];
}

const initialState: StreakState = { streaks: [] };

export const streakSlice = createSlice({
  name: 'streak',
  initialState,
  reducers: {
    setStreaks: (state, action: PayloadAction<Streak[]>) => {
      state.streaks = action.payload;
    },
    updateStreak: (state, action: PayloadAction<Streak>) => {
      const idx = state.streaks.findIndex(s => s.type === action.payload.type);
      if (idx >= 0) state.streaks[idx] = action.payload;
      else state.streaks.push(action.payload);
    },
  },
});

export const { setStreaks, updateStreak } = streakSlice.actions;
export default streakSlice.reducer;
