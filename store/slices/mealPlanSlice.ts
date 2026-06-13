import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { MealPlan } from '@/types';

interface MealPlanState {
  plans: MealPlan[];
}

const initialState: MealPlanState = { plans: [] };

export const mealPlanSlice = createSlice({
  name: 'mealPlan',
  initialState,
  reducers: {
    setPlans: (state, action: PayloadAction<MealPlan[]>) => {
      state.plans = action.payload;
    },
    addPlan: (state, action: PayloadAction<MealPlan>) => {
      // De-dupe (the generator may optimistically add, then a refetch arrives).
      state.plans = [action.payload, ...state.plans.filter((p) => p.id !== action.payload.id)];
    },
    removePlan: (state, action: PayloadAction<string>) => {
      state.plans = state.plans.filter((p) => p.id !== action.payload);
    },
    markPlanLogged: (state, action: PayloadAction<string>) => {
      const plan = state.plans.find((p) => p.id === action.payload);
      if (plan) plan.logged = true;
    },
  },
});

export const { setPlans, addPlan, removePlan, markPlanLogged } = mealPlanSlice.actions;
export default mealPlanSlice.reducer;
