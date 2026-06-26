/**
 * nutri-coach — Aurora AI meal-preparation edge function.
 *
 * Generates ONE meal recipe that targets the user's requested macros and diet
 * type, using the same OpenAI-compatible provider chain as ai-companion
 * (Cerebras → Groq, gpt-oss-120b). Unlike ai-companion (which only returns tool
 * names), this function returns the FULL structured recipe to the client AND
 * persists it to the meal_plans table so it shows up in the Nutrition tab.
 *
 * Request body:
 *   {
 *     targetMacros: { protein?: number, carbs?: number, fat?: number, calories?: number },
 *     dietType?: 'veg' | 'nonveg' | 'vegan',
 *     mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack',
 *     note?: string            // optional free-text: cuisine, allergies, etc.
 *   }
 *
 * Response: { plan: MealPlan }  (see RECIPE_SHAPE)
 *
 * Deploy: supabase functions deploy nutri-coach
 * Env: CEREBRAS_API_KEY (or ANTHROPIC_API_KEY), GROQ_API_KEY,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface TargetMacros {
  protein?: number;
  carbs?: number;
  fat?: number;
  calories?: number;
}

interface Recipe {
  name: string;
  description: string;
  meal_type: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
  steps: string[];
}

// Pull the first balanced JSON object out of a possibly-noisy model reply.
function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    // Provider chain (same convention as ai-companion).
    const cerebrasKey = Deno.env.get('CEREBRAS_API_KEY') ?? Deno.env.get('ANTHROPIC_API_KEY');
    const groqKey = Deno.env.get('GROQ_API_KEY');

    interface Provider {
      name: string;
      baseUrl: string;
      key: string;
      model: string;
    }
    const providers: Provider[] = [];
    if (cerebrasKey) {
      providers.push({
        name: 'cerebras',
        baseUrl: 'https://api.cerebras.ai/v1',
        key: cerebrasKey,
        model: Deno.env.get('AI_MODEL') ?? 'gpt-oss-120b',
      });
    }
    if (groqKey) {
      providers.push({
        name: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        key: groqKey,
        model: Deno.env.get('GROQ_MODEL') ?? 'openai/gpt-oss-120b',
      });
    }
    if (providers.length === 0) {
      return json({ error: 'AI key not configured (set ANTHROPIC_API_KEY or GROQ_API_KEY).' }, 503);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const {
      targetMacros = {},
      dietType = 'veg',
      mealType,
      note,
    } = body as {
      targetMacros?: TargetMacros;
      dietType?: string;
      mealType?: string;
      note?: string;
    };

    const { protein, carbs, fat, calories } = targetMacros;
    if (protein == null && carbs == null && fat == null && calories == null) {
      return json({ error: 'Provide at least one target macro (protein, carbs, fat or calories).' }, 400);
    }

    const dietLabel =
      dietType === 'nonveg' ? 'non-vegetarian' : dietType === 'vegan' ? 'vegan' : 'vegetarian';

    const targetLines = [
      protein != null ? `protein ≈ ${protein} g` : '',
      carbs != null ? `carbs ≈ ${carbs} g` : '',
      fat != null ? `fat ≈ ${fat} g` : '',
      calories != null ? `calories ≈ ${calories} kcal` : '',
    ]
      .filter(Boolean)
      .join(', ');

    const systemPrompt = [
      'You are Nutri-Coach, an expert nutritionist and chef inside the Aurora health app.',
      'Design ONE single realistic, tasty meal that hits the requested macro targets as closely as possible.',
      `The meal MUST be ${dietLabel}.`,
      'Reply with ONLY a valid JSON object — no prose, no markdown, no code fences. Use this exact shape:',
      '{',
      '  "name": string,            // appetising dish name',
      '  "description": string,     // one short sentence',
      '  "meal_type": "breakfast" | "lunch" | "dinner" | "snack",',
      '  "calories": number,        // achieved totals for the whole meal',
      '  "protein_g": number,',
      '  "carbs_g": number,',
      '  "fat_g": number,',
      '  "ingredients": string[],   // each with quantity, e.g. "200g paneer"',
      '  "steps": string[]          // ordered, concise preparation steps',
      '}',
      'Make the achieved macros realistic for the ingredients listed (do not just echo the targets).',
    ].join('\n');

    const userPrompt = [
      `Create a ${dietLabel} ${mealType ? mealType + ' ' : ''}meal.`,
      `Target macros: ${targetLines}.`,
      note ? `Additional preferences: ${note}.` : '',
      mealType ? `Meal type: ${mealType}.` : 'Choose the most fitting meal type.',
    ]
      .filter(Boolean)
      .join(' ');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // deno-lint-ignore no-explicit-any
    const callAI = async (): Promise<any> => {
      let lastErr = '';
      for (const p of providers) {
        for (let attempt = 0; attempt < 3; attempt++) {
          let res: Response;
          try {
            res = await fetch(`${p.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
              body: JSON.stringify({
                model: p.model,
                // gpt-oss-120b is a reasoning model: hidden reasoning tokens
                // count against max_tokens. Without reasoning_effort=low it
                // spends the WHOLE budget reasoning and returns empty content
                // (finish_reason=length). 'low' makes it emit the recipe.
                reasoning_effort: 'low',
                max_tokens: 3000,
                temperature: 0.7,
                messages,
              }),
            });
          } catch (e) {
            lastErr = `${p.name} fetch failed: ${(e as Error).message}`;
            break;
          }
          if (res.ok) {
            console.log(`[nutri-coach] served by ${p.name} (${p.model})`);
            return await res.json();
          }
          lastErr = `${p.name} ${res.status}: ${await res.text()}`;
          if (res.status === 429 || res.status >= 500) {
            await sleep(400 * Math.pow(2, attempt));
            continue;
          }
          break; // non-retryable; next provider
        }
      }
      throw new Error(`All AI providers failed. Last: ${lastErr || 'unknown'}`);
    };

    const aiData = await callAI();
    if (aiData?.error) throw new Error(`AI gateway error: ${JSON.stringify(aiData.error)}`);

    const content = (aiData?.choices?.[0]?.message?.content ?? '').trim();
    const jsonStr = extractJson(content);
    if (!jsonStr) {
      console.error(
        '[nutri-coach] no JSON in reply. finish_reason=',
        aiData?.choices?.[0]?.finish_reason,
        'content=',
        content.slice(0, 600),
      );
      throw new Error('Nutri-Coach could not produce a recipe. Please try again.');
    }

    let raw: Partial<Recipe>;
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      throw new Error('Nutri-Coach returned an invalid recipe. Please try again.');
    }

    const validMealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    const resolvedMealType =
      mealType && validMealTypes.includes(mealType)
        ? mealType
        : validMealTypes.includes(String(raw.meal_type))
          ? String(raw.meal_type)
          : 'lunch';

    const recipe: Recipe = {
      name: String(raw.name ?? 'Custom meal').trim(),
      description: String(raw.description ?? '').trim(),
      meal_type: resolvedMealType,
      calories: num(raw.calories),
      protein_g: num(raw.protein_g),
      carbs_g: num(raw.carbs_g),
      fat_g: num(raw.fat_g),
      ingredients: strArray(raw.ingredients),
      steps: strArray(raw.steps),
    };

    // Persist to meal_plans so the Nutrition tab can show it (incl. the live
    // voice path, which refetches rather than receiving this response).
    const { data: inserted, error: insertError } = await supabase
      .from('meal_plans')
      .insert({
        user_id: user.id,
        name: recipe.name,
        meal_type: recipe.meal_type,
        diet_type: dietType,
        description: recipe.description,
        calories: recipe.calories,
        protein_g: recipe.protein_g,
        carbs_g: recipe.carbs_g,
        fat_g: recipe.fat_g,
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        logged: false,
      })
      .select()
      .single();

    if (insertError) throw new Error(`DB error: ${insertError.message}`);

    return json({ plan: inserted });
  } catch (err) {
    console.error('[nutri-coach]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
