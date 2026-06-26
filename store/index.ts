import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import { reduxStorage } from './storage';
import profileReducer from './slices/profileSlice';
import hydrationReducer from './slices/hydrationSlice';
import sleepReducer from './slices/sleepSlice';
import habitsReducer from './slices/habitsSlice';
import nutritionReducer from './slices/nutritionSlice';
import mealPlanReducer from './slices/mealPlanSlice';
import streakReducer from './slices/streakSlice';
import activityReducer from './slices/activitySlice';
// Keep legacy health slice for any remaining references
import healthReducer from './slices/healthSlice';

const rootReducer = combineReducers({
  health: healthReducer,
  profile: profileReducer,
  hydration: hydrationReducer,
  sleep: sleepReducer,
  habits: habitsReducer,
  nutrition: nutritionReducer,
  mealPlan: mealPlanReducer,
  streak: streakReducer,
  activity: activityReducer,
});

const persistConfig = {
  key: 'root',
  storage: reduxStorage,
  whitelist: [
    'health',
    'profile',
    'hydration',
    'sleep',
    'habits',
    'nutrition',
    'mealPlan',
    'streak',
    'activity',
  ],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
