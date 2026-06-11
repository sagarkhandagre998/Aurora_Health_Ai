import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Meal } from '@/types';

interface NutritionState {
  meals: Meal[];
  todayMeals: Meal[];
}

const initialState: NutritionState = { meals: [], todayMeals: [] };

export const nutritionSlice = createSlice({
  name: 'nutrition',
  initialState,
  reducers: {
    setMeals: (state, action: PayloadAction<Meal[]>) => {
      state.meals = action.payload;
      const today = new Date().toISOString().split('T')[0];
      state.todayMeals = action.payload.filter(m => m.loggedAt.startsWith(today));
    },
    addMeal: (state, action: PayloadAction<Meal>) => {
      state.meals.unshift(action.payload);
      const today = new Date().toISOString().split('T')[0];
      if (action.payload.loggedAt.startsWith(today)) {
        state.todayMeals.unshift(action.payload);
      }
    },
    removeMeal: (state, action: PayloadAction<string>) => {
      state.meals = state.meals.filter(m => m.id !== action.payload);
      state.todayMeals = state.todayMeals.filter(m => m.id !== action.payload);
    },
  },
});

export const { setMeals, addMeal, removeMeal } = nutritionSlice.actions;
export default nutritionSlice.reducer;
