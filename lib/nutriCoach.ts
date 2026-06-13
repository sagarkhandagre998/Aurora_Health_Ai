import { supabase } from './supabase';
import { MealPlan, DietType } from '@/types';

/**
 * Client wrapper for Nutri-Coach (AI meal preparation).
 *
 * generateMealPlan() calls the `nutri-coach` edge function, which generates ONE
 * recipe for the requested macros + diet, persists it to `meal_plans`, and
 * returns the saved row. fetchMealPlans() loads the user's saved plans.
 *
 * The live/voice path (Aurora's create_meal_plan tool) writes to the same table
 * server-side; the UI just refetches with fetchMealPlans() to pick those up.
 */

export interface MealPlanTargets {
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
}

export interface GenerateMealPlanInput {
  targetMacros: MealPlanTargets;
  dietType: DietType;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  note?: string;
}

// Map a DB row (snake_case, jsonb) → the camelCase MealPlan used by the app.
// deno-lint-ignore no-explicit-any
function mapRow(row: any): MealPlan {
  return {
    id: row.id,
    name: row.name,
    mealType: row.meal_type ?? 'lunch',
    dietType: row.diet_type ?? undefined,
    description: row.description ?? undefined,
    calories: row.calories ?? undefined,
    proteinG: row.protein_g ?? undefined,
    carbsG: row.carbs_g ?? undefined,
    fatG: row.fat_g ?? undefined,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    steps: Array.isArray(row.steps) ? row.steps : [],
    logged: !!row.logged,
    createdAt: row.created_at,
  };
}

export async function generateMealPlan(input: GenerateMealPlanInput): Promise<MealPlan> {
  const { data, error } = await supabase.functions.invoke('nutri-coach', {
    body: {
      targetMacros: input.targetMacros,
      dietType: input.dietType,
      mealType: input.mealType,
      note: input.note,
    },
  });

  if (error) {
    // supabase-js FunctionsHttpError stores the raw Response in error.context.
    let detail = error.message;
    const ctx = (error as { context?: unknown }).context;
    try {
      if (ctx instanceof Response) {
        const body = await ctx
          .clone()
          .json()
          .catch(async () => ({ error: await ctx.clone().text() }));
        if (body?.error) detail = body.error;
        // eslint-disable-next-line no-console
        console.error('[nutri-coach] edge function error body:', body);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[nutri-coach] could not read error body:', e);
    }
    throw new Error(detail);
  }

  const plan = (data as { plan?: unknown })?.plan;
  if (!plan) throw new Error('Nutri-Coach returned no meal.');
  return mapRow(plan);
}

export async function fetchMealPlans(userId: string, limit = 30): Promise<MealPlan[]> {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export async function deleteMealPlan(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markMealPlanLogged(id: string): Promise<void> {
  const { error } = await supabase.from('meal_plans').update({ logged: true }).eq('id', id);
  if (error) throw new Error(error.message);
}
