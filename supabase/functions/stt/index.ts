/**
 * stt — Speech-to-text edge function using OpenAI Whisper.
 *
 * Accepts a multipart/form-data POST with a single `file` field (audio/m4a,
 * audio/mp4, audio/wav, etc.), forwards it to the Whisper API, and returns
 * the transcript as JSON.
 *
 * Deploy: supabase functions deploy stt
 * Env vars: GROQ_API_KEY (free at console.groq.com), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Falls back to OPENAI_API_KEY if set (for Whisper on OpenAI directly).
 *
 * Client usage (expo-audio):
 *   const form = new FormData();
 *   form.append('file', { uri, name: 'recording.m4a', type: 'audio/m4a' } as any);
 *   const res = await supabase.functions.invoke('stt', { body: form });
 *   const { transcript } = res.data;
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

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // ── API key guard ──────────────────────────────────────────────────────
    // Prefer Groq (free tier) over OpenAI for Whisper transcription.
    const groqKey = Deno.env.get('GROQ_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const sttKey = groqKey ?? openaiKey;

    if (!sttKey) {
      return json(
        { error: 'STT service unavailable — set GROQ_API_KEY (free at console.groq.com).' },
        503,
      );
    }

    // Groq uses the same Whisper API format as OpenAI, just a different base URL and model name.
    const sttUrl = groqKey
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';
    const sttModel = groqKey ? 'whisper-large-v3' : 'whisper-1';

    // ── Parse multipart form data ──────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return json({ error: 'Request body must be multipart/form-data.' }, 400);
    }

    const fileEntry = formData.get('file');

    // formData.get returns File | string | null in Deno.
    if (!fileEntry || typeof fileEntry === 'string') {
      return json({ error: 'Missing "file" field in form data.' }, 400);
    }

    const audioFile = fileEntry as File;

    // Whisper requires a file extension it recognises. If the client doesn't
    // set one (e.g. React Native FormData quirks) default to m4a.
    const fileName = audioFile.name?.trim() || 'recording.m4a';

    // ── Forward to OpenAI Whisper ──────────────────────────────────────────
    const whisperForm = new FormData();
    // Append as Blob with an explicit filename so Whisper can infer the codec.
    whisperForm.append('file', audioFile, fileName);
    whisperForm.append('model', sttModel);
    whisperForm.append('language', 'en');
    whisperForm.append('response_format', 'json');

    const whisperRes = await fetch(sttUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sttKey}`,
        // Do NOT set Content-Type here — fetch sets it automatically with the
        // correct multipart boundary when the body is a FormData instance.
      },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      console.error('[stt] Whisper error:', whisperRes.status, errText);
      throw new Error(`Whisper API error ${whisperRes.status}: ${errText}`);
    }

    const { text: transcript } = (await whisperRes.json()) as { text: string };

    return json({ transcript: transcript?.trim() ?? '' });
  } catch (err) {
    console.error('[stt]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
