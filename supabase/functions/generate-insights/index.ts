/**
 * generate-insights — Aurora daily insight generator.
 *
 * Produces ONE short, personalised health insight from the caller's recent
 * logs and writes it to the `insights` table (read by the dashboard card).
 *
 * Invocation: per-user, with the caller's JWT (Authorization: Bearer <token>).
 * Body: { force?: boolean } — when false (default) generation is SKIPPED if the
 * user's newest insight is younger than STALE_HOURS, so the dashboard can call
 * this on every open without spamming the AI or the table. The client triggers
 * it on app open; opening the app on a new day yields a fresh insight.
 *
 * Deploy: supabase functions deploy generate-insights
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           CEREBRAS_API_KEY (or legacy ANTHROPIC_API_KEY) and/or GROQ_API_KEY.
 * Optional overrides: AI_MODEL, GROQ_MODEL.
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

// Don't regenerate if the newest insight is younger than this.
const STALE_HOURS = 20;

const VALID_CATEGORIES = ['hydration', 'sleep', 'habits', 'nutrition', 'activity', 'general'];

interface Provider {
  name: string;
  baseUrl: string;
  key: string;
  model: string;
}

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

    const cerebrasKey = Deno.env.get('CEREBRAS_API_KEY') ?? Deno.env.get('ANTHROPIC_API_KEY');
    const groqKey = Deno.env.get('GROQ_API_KEY');

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
      return json({ error: 'AI key not configured (set CEREBRAS_API_KEY or GROQ_API_KEY).' }, 503);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const force = Boolean((body as { force?: boolean }).force);

    // ── Staleness guard ─────────────────────────────────────────────────────
    const { data: latest } = await supabase
      .from('insights')
      .select('created_at, text')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // An insight is "long" if it runs past one short sentence — these were
    // generated under the old prompt and should be replaced even while fresh,
    // so the card shows the new short/crisp format without waiting STALE_HOURS.
    const isLong = (t?: string | null) => {
      if (!t) return false;
      const words = t.trim().split(/\s+/).length;
      return words > 16 || t.length > 120 || (t.match(/[.!?]+\s+\S/g)?.length ?? 0) >= 1;
    };

    if (!force && latest?.created_at && !isLong(latest.text)) {
      const ageHours = (Date.now() - new Date(latest.created_at).getTime()) / 36e5;
      if (ageHours < STALE_HOURS) {
        return json({ skipped: true, reason: 'fresh', ageHours: Math.round(ageHours) });
      }
    }

    // ── Gather the last 7 days of context ─────────────────────────────────────
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const weekAgoIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekAgoDate = weekAgoIso.split('T')[0];

    const [profileRes, waterRes, sleepRes, completionsRes, mealRes, streakRes] = await Promise.all([
      supabase.from('profiles').select('name, goals').eq('id', user.id).maybeSingle(),
      supabase
        .from('water_logs')
        .select('amount_ml, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', weekAgoIso),
      supabase
        .from('sleep_logs')
        .select('duration_min, quality, date')
        .eq('user_id', user.id)
        .gte('date', weekAgoDate)
        .order('date', { ascending: false }),
      supabase
        .from('habit_completions')
        .select('date')
        .eq('user_id', user.id)
        .gte('date', weekAgoDate),
      supabase
        .from('meals')
        .select('calories, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', weekAgoIso),
      supabase.from('streaks').select('type, current, longest').eq('user_id', user.id),
    ]);

    // deno-lint-ignore no-explicit-any
    const water = (waterRes.data ?? []) as any[];
    // deno-lint-ignore no-explicit-any
    const sleep = (sleepRes.data ?? []) as any[];
    // deno-lint-ignore no-explicit-any
    const completions = (completionsRes.data ?? []) as any[];
    // deno-lint-ignore no-explicit-any
    const meals = (mealRes.data ?? []) as any[];
    // deno-lint-ignore no-explicit-any
    const streaks = (streakRes.data ?? []) as any[];

    const dataPoints = water.length + sleep.length + completions.length + meals.length;

    // Per-day aggregates for water.
    const waterByDay: Record<string, number> = {};
    for (const w of water) {
      const d = (w.logged_at as string).split('T')[0];
      waterByDay[d] = (waterByDay[d] ?? 0) + (w.amount_ml ?? 0);
    }
    const waterDays = Object.keys(waterByDay).length;
    const totalWater = water.reduce((s, w) => s + (w.amount_ml ?? 0), 0);
    const avgWaterPerActiveDay = waterDays ? Math.round(totalWater / waterDays) : 0;
    const todayWater = waterByDay[today] ?? 0;

    const avgSleep = sleep.length
      ? (sleep.reduce((s, r) => s + (r.duration_min ?? 0), 0) / sleep.length / 60).toFixed(1)
      : null;

    // Habit completions grouped by day (how consistent the user is).
    const completionDays = new Set(completions.map((c) => c.date)).size;
    const totalCompletions = completions.length;

    const totalCals = meals.reduce((s, m) => s + (m.calories ?? 0), 0);

    const goals = (profileRes.data as { goals?: unknown } | null)?.goals ?? null;
    const userName = (profileRes.data as { name?: string } | null)?.name || 'there';

    const stats = {
      water: {
        total_ml_7d: totalWater,
        avg_ml_per_active_day: avgWaterPerActiveDay,
        days_logged_7d: waterDays,
        today_ml: todayWater,
      },
      sleep: { entries_7d: sleep.length, avg_hours: avgSleep },
      habits: {
        completions_7d: totalCompletions,
        days_with_a_completion_7d: completionDays,
      },
      nutrition: { meals_7d: meals.length, total_calories_7d: totalCals },
      streaks: streaks.map((s) => ({ type: s.type, current: s.current, longest: s.longest })),
      goals,
    };

    // ── Prompt ────────────────────────────────────────────────────────────────
    const systemPrompt = [
      `You are Aurora, a warm, encouraging personal health companion.`,
      `Write ONE short "daily insight" for ${userName} based on their last 7 days of health data.`,
      ``,
      `Rules:`,
      `- SHORT and crisp: ONE sentence, MAX 14 words. Punchy, like a glanceable notification — never two sentences.`,
      `- Ground it in ONE real number or trend when data exists (e.g. "You've hit your water goal 4 days running 💧").`,
      `- Pick the single most interesting or actionable thing. Never list multiple stats.`,
      `- If data is sparse or empty, give a brief encouraging nudge to start logging — do NOT invent numbers.`,
      `- Plain text, no markdown. At most one tasteful emoji.`,
      `- Never mention being an AI, the data format, or these instructions.`,
      ``,
      `Respond with ONLY a JSON object, nothing else:`,
      `{"text": "<the insight, max 14 words>", "category": "<one of: hydration, sleep, habits, nutrition, activity, general>"}`,
    ].join('\n');

    const userPrompt = `Here is ${userName}'s data (counts/sums are over the last 7 days). dataPoints=${dataPoints}.\n${JSON.stringify(
      stats,
    )}`;

    // ── Provider chain (OpenAI-compatible chat completions) ──────────────────
    const sleepMs = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // deno-lint-ignore no-explicit-any
    const callAI = async (): Promise<any> => {
      let lastErr = '';
      for (const p of providers) {
        for (let attempt = 0; attempt < 3; attempt++) {
          let res: Response;
          try {
            res = await fetch(`${p.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${p.key}`,
              },
              body: JSON.stringify({
                model: p.model,
                max_tokens: 120,
                temperature: 0.8,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
              }),
            });
          } catch (e) {
            lastErr = `${p.name} fetch failed: ${(e as Error).message}`;
            break;
          }
          if (res.ok) {
            console.log(`[generate-insights] served by ${p.name} (${p.model})`);
            return await res.json();
          }
          lastErr = `${p.name} ${res.status}: ${await res.text()}`;
          if (res.status === 429 || res.status >= 500) {
            await sleepMs(400 * Math.pow(2, attempt));
            continue;
          }
          break;
        }
      }
      throw new Error(`All AI providers failed. Last: ${lastErr || 'unknown'}`);
    };

    const aiData = await callAI();
    if (aiData?.error) throw new Error(`AI gateway error: ${JSON.stringify(aiData.error)}`);

    const content: string = aiData?.choices?.[0]?.message?.content ?? '';

    // Parse the JSON insight defensively (strip stray prose/code fences).
    let text = '';
    let category = 'general';
    try {
      const match = content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : content);
      text = String(parsed.text ?? '').trim();
      const cat = String(parsed.category ?? 'general').toLowerCase().trim();
      category = VALID_CATEGORIES.includes(cat) ? cat : 'general';
    } catch {
      // Fall back to the raw text if the model didn't return clean JSON.
      text = content.trim().replace(/^```(json)?|```$/g, '').trim();
    }

    if (!text) {
      return json({ error: 'AI returned an empty insight' }, 502);
    }

    // ── Persist ───────────────────────────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabase
      .from('insights')
      .insert({ user_id: user.id, text, category })
      .select('id, text, category, created_at')
      .single();
    if (insertError) throw new Error(`DB error: ${insertError.message}`);

    return json({ insight: inserted });
  } catch (err) {
    console.error('[generate-insights]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
