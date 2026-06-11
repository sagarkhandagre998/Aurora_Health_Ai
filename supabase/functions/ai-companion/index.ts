/**
 * ai-companion — Aurora AI edge function.
 *
 * Runs an agentic loop powered by Claude claude-opus-4-5 with tool use.
 * On each request it:
 *   1. Verifies the caller's JWT via Supabase auth.
 *   2. Loads today's personalised stats to build the system prompt.
 *   3. Executes a Claude agent loop (max 5 turns) that can call any of
 *      the 7 health-data tools against the Postgres DB.
 *   4. Optionally calls the /tts function when useVoice = true.
 *   5. Returns { replyText, actions, audioBase64? }.
 *
 * Deploy: supabase functions deploy ai-companion
 * Env vars required: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                    SUPABASE_ANON_KEY (for internal TTS call)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── CORS ─────────────────────────────────────────────────────────────────────

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

// ─── Claude tool definitions ──────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'add_water',
    description: 'Log a water intake entry for the user.',
    input_schema: {
      type: 'object',
      properties: {
        amount_ml: {
          type: 'number',
          description: 'Amount of water drunk in millilitres (e.g. 250 for a glass).',
        },
      },
      required: ['amount_ml'],
    },
  },
  {
    name: 'log_sleep',
    description: 'Log or update a sleep entry for the user.',
    input_schema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Sleep duration in hours (e.g. 7.5).' },
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format. Omit to use today.',
        },
        quality: {
          type: 'number',
          description: 'Optional sleep quality rating from 1 (poor) to 10 (excellent).',
        },
      },
      required: ['hours'],
    },
  },
  {
    name: 'create_habit',
    description: 'Create a new daily or weekly habit for the user to track.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the habit (e.g. "Morning stretch").' },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly'],
          description: 'How often the habit should be done. Defaults to daily.',
        },
        target_per_day: {
          type: 'number',
          description: 'Target number of completions per day. Defaults to 1.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'complete_habit',
    description: 'Mark a habit as completed for today. Finds the habit by name (partial match).',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name (or partial name) of the habit to complete.',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'log_meal',
    description: 'Log a meal or food item for the user.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the meal or food.' },
        meal_type: {
          type: 'string',
          enum: ['breakfast', 'lunch', 'dinner', 'snack'],
          description: 'Meal category.',
        },
        calories: { type: 'number', description: 'Total calories. Optional.' },
        protein_g: { type: 'number', description: 'Protein in grams. Optional.' },
        carbs_g: { type: 'number', description: 'Carbohydrates in grams. Optional.' },
        fat_g: { type: 'number', description: 'Fat in grams. Optional.' },
      },
      required: ['name', 'meal_type'],
    },
  },
  {
    name: 'get_progress',
    description: "Retrieve a summary of the user's health progress.",
    input_schema: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['today', 'week'],
          description: "Time window: 'today' for today only, 'week' for the last 7 days.",
        },
      },
      required: ['range'],
    },
  },
  {
    name: 'remember',
    description:
      'Save an important personal observation about the user to long-term memory so you can reference it in future conversations.',
    input_schema: {
      type: 'object',
      properties: {
        observation: {
          type: 'string',
          description: 'The insight or fact to remember (e.g. "User prefers morning workouts").',
        },
      },
      required: ['observation'],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function executeTool(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  today: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (toolName) {
    // ── add_water ──────────────────────────────────────────────────────────
    case 'add_water': {
      const { error } = await supabase.from('water_logs').insert({
        user_id: userId,
        amount_ml: Number(input.amount_ml),
      });
      if (error) throw new Error(`DB error: ${error.message}`);
      return { success: true, logged_ml: input.amount_ml };
    }

    // ── log_sleep ──────────────────────────────────────────────────────────
    case 'log_sleep': {
      const date = (input.date as string | undefined) ?? today;
      const hours = Number(input.hours);
      const quality = input.quality !== undefined ? Number(input.quality) : null;

      const { error } = await supabase.from('sleep_logs').upsert(
        {
          user_id: userId,
          date,
          duration_min: Math.round(hours * 60),
          ...(quality !== null && { quality }),
        },
        { onConflict: 'user_id,date' },
      );
      if (error) throw new Error(`DB error: ${error.message}`);
      return { success: true, logged_hours: hours, date };
    }

    // ── create_habit ───────────────────────────────────────────────────────
    case 'create_habit': {
      const { error } = await supabase.from('habits').insert({
        user_id: userId,
        name: input.name as string,
        frequency: (input.frequency as string | undefined) ?? 'daily',
        target_per_day: input.target_per_day !== undefined ? Number(input.target_per_day) : 1,
        status: 'active',
      });
      if (error) throw new Error(`DB error: ${error.message}`);
      return { success: true, habit_name: input.name };
    }

    // ── complete_habit ─────────────────────────────────────────────────────
    case 'complete_habit': {
      // Find the habit by partial name match.
      const { data: habitData, error: findError } = await supabase
        .from('habits')
        .select('id, name')
        .eq('user_id', userId)
        .eq('status', 'active')
        .ilike('name', `%${input.name as string}%`)
        .limit(1)
        .maybeSingle();

      if (findError) throw new Error(`DB error: ${findError.message}`);
      if (!habitData) {
        return {
          success: false,
          message: `No active habit matching "${input.name}" found. Use create_habit first.`,
        };
      }

      const { error: upsertError } = await supabase.from('habit_completions').upsert(
        {
          user_id: userId,
          habit_id: habitData.id,
          date: today,
          count: 1,
        },
        { onConflict: 'habit_id,date' },
      );
      if (upsertError) throw new Error(`DB error: ${upsertError.message}`);
      return { success: true, habit: habitData.name, date: today };
    }

    // ── log_meal ───────────────────────────────────────────────────────────
    case 'log_meal': {
      const { error } = await supabase.from('meals').insert({
        user_id: userId,
        name: input.name as string,
        meal_type: input.meal_type as string,
        calories: input.calories !== undefined ? Number(input.calories) : null,
        protein_g: input.protein_g !== undefined ? Number(input.protein_g) : null,
        carbs_g: input.carbs_g !== undefined ? Number(input.carbs_g) : null,
        fat_g: input.fat_g !== undefined ? Number(input.fat_g) : null,
      });
      if (error) throw new Error(`DB error: ${error.message}`);
      return { success: true, meal: input.name, meal_type: input.meal_type };
    }

    // ── get_progress ───────────────────────────────────────────────────────
    case 'get_progress': {
      const range = input.range as 'today' | 'week';
      const startIso =
        range === 'today'
          ? `${today}T00:00:00Z`
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const startDate = startIso.split('T')[0];

      const [waterRes, sleepRes, habitsRes, mealsRes] = await Promise.all([
        supabase
          .from('water_logs')
          .select('amount_ml')
          .eq('user_id', userId)
          .gte('logged_at', startIso),
        supabase
          .from('sleep_logs')
          .select('duration_min, quality, date')
          .eq('user_id', userId)
          .gte('date', startDate)
          .order('date', { ascending: false }),
        supabase
          .from('habit_completions')
          .select('id')
          .eq('user_id', userId)
          .gte('date', startDate),
        supabase
          .from('meals')
          .select('calories, protein_g, carbs_g, fat_g, name, meal_type')
          .eq('user_id', userId)
          .gte('logged_at', startIso),
      ]);

      // deno-lint-ignore no-explicit-any
      const totalWater = (waterRes.data ?? []).reduce(
        (s: number, r: any) => s + (r.amount_ml ?? 0),
        0,
      );
      // deno-lint-ignore no-explicit-any
      const totalCals = (mealsRes.data ?? []).reduce(
        (s: number, m: any) => s + (m.calories ?? 0),
        0,
      );
      // deno-lint-ignore no-explicit-any
      const avgSleep = sleepRes.data?.length
        ? // deno-lint-ignore no-explicit-any
          (
            sleepRes.data.reduce((s: number, r: any) => s + (r.duration_min ?? 0), 0) /
            sleepRes.data.length /
            60
          ).toFixed(1)
        : null;

      return {
        range,
        water_ml: totalWater,
        avg_sleep_hours: avgSleep,
        sleep_entries: sleepRes.data?.length ?? 0,
        habits_completed: habitsRes.data?.length ?? 0,
        total_calories: totalCals,
        meals_logged: mealsRes.data?.length ?? 0,
      };
    }

    // ── remember ───────────────────────────────────────────────────────────
    case 'remember': {
      const { error } = await supabase.from('health_memory').insert({
        user_id: userId,
        observation: input.observation as string,
      });
      if (error) throw new Error(`DB error: ${error.message}`);
      return { success: true, saved: input.observation };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── Request handler ──────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    // Supports both freemodel.dev (FREEMODEL_API_KEY) and direct Anthropic (ANTHROPIC_API_KEY)
    const anthropicKey = Deno.env.get('FREEMODEL_API_KEY') ?? Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicKey) return json({ error: 'FREEMODEL_API_KEY not configured' }, 503);

    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json();
    const {
      message,
      conversationHistory = [],
      useVoice = false,
    } = body as {
      message: string;
      conversationHistory?: unknown[];
      useVoice?: boolean;
    };

    if (!message?.trim()) return json({ error: 'message is required' }, 400);

    const today = new Date().toISOString().split('T')[0];

    // ── Load personalised context ──────────────────────────────────────────
    const [profileRes, waterRes, sleepRes, habitsRes, mealRes, memoryRes] = await Promise.all([
      supabase.from('profiles').select('name, goals').eq('id', user.id).maybeSingle(),
      supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', user.id)
        .gte('logged_at', `${today}T00:00:00Z`),
      supabase
        .from('sleep_logs')
        .select('duration_min, quality')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('habit_completions').select('id').eq('user_id', user.id).eq('date', today),
      supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .gte('logged_at', `${today}T00:00:00Z`),
      supabase
        .from('health_memory')
        .select('observation')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    // deno-lint-ignore no-explicit-any
    const waterMl = (waterRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_ml ?? 0), 0);
    const sleepHours = sleepRes.data ? (sleepRes.data.duration_min / 60).toFixed(1) : 'N/A';
    const habitsCount = habitsRes.data?.length ?? 0;
    const mealCount = mealRes.data?.length ?? 0;
    const goalMl = 2500; // default hydration goal
    const userName = (profileRes.data as { name?: string } | null)?.name || 'there';

    // deno-lint-ignore no-explicit-any
    const memories = (memoryRes.data ?? []).map((m: any) => m.observation as string).join('; ');

    // ── System prompt ──────────────────────────────────────────────────────
    const systemPrompt = [
      `You are Aurora, a warm, supportive, and knowledgeable personal health companion.`,
      `The user's name is ${userName}.`,
      `Today's stats: hydration ${waterMl}ml / ${goalMl}ml goal, last sleep: ${sleepHours}h, habits completed today: ${habitsCount}, meals logged today: ${mealCount}.`,
      memories ? `Recent observations about this user: ${memories}` : '',
      `Keep replies SHORT and speech-friendly (2–3 sentences max for voice). Be encouraging, warm, and personal.`,
      `When the user asks you to log something, use the appropriate tool and always confirm what you recorded.`,
      `If you're unsure about a value (e.g. calories), make a reasonable estimate and mention it.`,
    ]
      .filter(Boolean)
      .join('\n');

    // ── Agent loop ─────────────────────────────────────────────────────────
    const messages: unknown[] = [...conversationHistory, { role: 'user', content: message }];

    const actions: string[] = [];
    let replyText = '';

    for (let turn = 0; turn < 5; turn++) {
      // Use freemodel.dev Anthropic-compatible endpoint when FREEMODEL_API_KEY is set,
      // otherwise fall back to the official Anthropic endpoint.
      const claudeBaseUrl = Deno.env.get('FREEMODEL_API_KEY')
        ? 'https://cc.freemodel.dev'
        : 'https://api.anthropic.com';

      const claudeRes = await fetch(`${claudeBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: systemPrompt,
          tools: TOOLS,
          messages,
        }),
      });

      if (!claudeRes.ok) {
        const errBody = await claudeRes.text();
        throw new Error(`Claude API ${claudeRes.status}: ${errBody}`);
      }

      // deno-lint-ignore no-explicit-any
      const claudeData = (await claudeRes.json()) as any;
      const { stop_reason, content } = claudeData;

      // Append assistant turn to the running conversation.
      messages.push({ role: 'assistant', content });

      // ── End turn: extract reply text and exit loop ─────────────────────
      if (stop_reason === 'end_turn') {
        // deno-lint-ignore no-explicit-any
        replyText = (content as any[])
          // deno-lint-ignore no-explicit-any
          .filter((b: any) => b.type === 'text')
          // deno-lint-ignore no-explicit-any
          .map((b: any) => b.text as string)
          .join(' ')
          .trim();
        break;
      }

      // ── Tool use: execute each tool, collect results, continue ─────────
      if (stop_reason === 'tool_use') {
        // deno-lint-ignore no-explicit-any
        const toolBlocks = (content as any[]).filter((b: any) => b.type === 'tool_use');
        const toolResults = await Promise.all(
          // deno-lint-ignore no-explicit-any
          toolBlocks.map(async (block: any) => {
            let result: unknown;
            try {
              result = await executeTool(supabase, user.id, today, block.name, block.input);
              actions.push(block.name);
            } catch (err) {
              result = { error: (err as Error).message };
            }
            return {
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            };
          }),
        );

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Any other stop reason (max_tokens, stop_sequence) — exit.
      break;
    }

    if (!replyText) {
      replyText = "I've taken care of that for you! Let me know if there's anything else you need.";
    }

    // ── Optional TTS ───────────────────────────────────────────────────────
    let audioBase64: string | undefined;
    if (useVoice && replyText) {
      try {
        const ttsRes = await fetch(`${supabaseUrl}/functions/v1/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            apikey: anonKey,
          },
          body: JSON.stringify({ text: replyText }),
        });
        if (ttsRes.ok) {
          const ttsData = await ttsRes.json();
          audioBase64 = ttsData.audioBase64 as string | undefined;
        }
      } catch {
        // TTS failure is non-fatal; voice falls back to device TTS on the client.
      }
    }

    return json({ replyText, actions, ...(audioBase64 && { audioBase64 }) });
  } catch (err) {
    console.error('[ai-companion]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
