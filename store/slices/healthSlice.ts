import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Legacy types kept here after types/index.ts was replaced by Aurora domain types
interface HealthEntry {
  id: string;
  date: string;
  mood: string;
  waterIntake: number;
  exercise: string;
  sleepHours: number;
  notes: string;
}
interface Goal {
  id: string;
  title: string;
  type: 'WATER' | 'SLEEP' | 'STEPS' | 'CUSTOM';
  targetValue: number;
  currentValue: number;
  unit: string;
}

interface HealthState {
  entries: HealthEntry[];
  goals: Goal[];
}

const initialState: HealthState = {
  entries: [],
  goals: [],
};

export const healthSlice = createSlice({
  name: 'health',
  initialState,
  reducers: {
    addEntry: (state, action: PayloadAction<HealthEntry>) => {
      state.entries.push(action.payload);
      recalculateGoalProgress(state);
    },
    addGoal: (state, action: PayloadAction<Goal>) => {
      state.goals.push(action.payload);
    },
    recalculateGoals: (state) => {
      recalculateGoalProgress(state);
    },
    deleteGoal: (state, action: PayloadAction<string>) => {
      state.goals = state.goals.filter((g) => g.id !== action.payload);
    },
    updateEntry: (state, action: PayloadAction<HealthEntry>) => {
      const index = state.entries.findIndex((e) => e.id === action.payload.id);
      if (index !== -1) {
        state.entries[index] = action.payload;
        recalculateGoalProgress(state);
      }
    },
    deleteEntry: (state, action: PayloadAction<string>) => {
      state.entries = state.entries.filter((e) => e.id !== action.payload);
      recalculateGoalProgress(state);
    },
  },
});

const recalculateGoalProgress = (state: HealthState) => {
  const today = new Date().toISOString().split('T')[0];
  const todayEntries = state.entries.filter((e) => e.date.startsWith(today));

  const totalWater = todayEntries.reduce((sum, e) => sum + e.waterIntake, 0);
  const totalSleep = todayEntries.reduce((sum, e) => sum + e.sleepHours, 0);

  state.goals.forEach((goal) => {
    if (goal.type === 'WATER') {
      goal.currentValue = totalWater;
    } else if (goal.type === 'SLEEP') {
      goal.currentValue = totalSleep;
    }
  });
};

export const { addEntry, updateEntry, addGoal, recalculateGoals, deleteGoal, deleteEntry } =
  healthSlice.actions;

export default healthSlice.reducer;
