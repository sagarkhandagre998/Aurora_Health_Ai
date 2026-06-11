import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Habit, HabitCompletion } from '@/types';

interface HabitsState {
  habits: Habit[];
  completions: HabitCompletion[];
  todayCompletionIds: string[]; // habitIds completed today
}

const initialState: HabitsState = { habits: [], completions: [], todayCompletionIds: [] };

export const habitsSlice = createSlice({
  name: 'habits',
  initialState,
  reducers: {
    setHabits: (state, action: PayloadAction<Habit[]>) => {
      state.habits = action.payload;
    },
    addHabit: (state, action: PayloadAction<Habit>) => {
      state.habits.unshift(action.payload);
    },
    updateHabit: (state, action: PayloadAction<Habit>) => {
      const idx = state.habits.findIndex(h => h.id === action.payload.id);
      if (idx >= 0) state.habits[idx] = action.payload;
    },
    removeHabit: (state, action: PayloadAction<string>) => {
      state.habits = state.habits.filter(h => h.id !== action.payload);
    },
    setCompletions: (state, action: PayloadAction<HabitCompletion[]>) => {
      state.completions = action.payload;
      const today = new Date().toISOString().split('T')[0];
      state.todayCompletionIds = action.payload
        .filter(c => c.date === today)
        .map(c => c.habitId);
    },
    upsertCompletion: (state, action: PayloadAction<HabitCompletion>) => {
      const idx = state.completions.findIndex(c => c.id === action.payload.id);
      if (idx >= 0) state.completions[idx] = action.payload;
      else state.completions.unshift(action.payload);
      const today = new Date().toISOString().split('T')[0];
      state.todayCompletionIds = state.completions
        .filter(c => c.date === today)
        .map(c => c.habitId);
    },
  },
});

export const { setHabits, addHabit, updateHabit, removeHabit, setCompletions, upsertCompletion } = habitsSlice.actions;
export default habitsSlice.reducer;
