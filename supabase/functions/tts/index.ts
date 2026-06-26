/**
 * tts — Text-to-speech edge function.
 *
 * Provider: ElevenLabs (Rachel, eleven_flash_v2_5). Returns mp3.
 *
 * Accepts JSON { text: string } and returns { audioBase64, mimeType, provider }.
 *
 * Deploy: supabase functions deploy tts
 * Env vars:
 *   ELEVENLABS_API_KEY  — ElevenLabs key.
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Client fallback: if this returns 503 (no provider configured) or an error,
 * the client falls back to expo-speech (on-device TTS).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

/** ElevenLabs Sarah — mature, reassuring female voice (free-tier premade). */
const ELEVEN_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
/** eleven_flash_v2_5: lowest-latency ElevenLabs model for conversational use. */
const ELEVEN_MODEL_ID = 'eleven_flash_v2_5';

/** Characters per request guard — keep AI replies short (2-3 sentences). */
const MAX_CHARS = 500;

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

// ─── Audio helpers ──────────────────────────────────────────────────────────

/**
 * Convert a Uint8Array to base64 in Deno without hitting the call-stack limit
 * that a single String.fromCharCode(...arr) would on large buffers (>~65 KB).
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface TtsResult {
  audioBase64: string;
  mimeType: string;
  provider: 'elevenlabs';
}

/** Synthesise with ElevenLabs. Returns mp3, or null on failure. */
async function tryElevenLabs(text: string, key: string): Promise<TtsResult | null> {
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key, Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });
  } catch (e) {
    console.error('[tts] ElevenLabs fetch failed:', (e as Error).message);
    return null;
  }

  if (!res.ok) {
    console.error('[tts] ElevenLabs error', res.status, await res.text());
    return null;
  }

  const audioBuffer = await res.arrayBuffer();
  console.log('[tts] served by elevenlabs');
  return {
    audioBase64: uint8ToBase64(new Uint8Array(audioBuffer)),
    mimeType: 'audio/mpeg',
    provider: 'elevenlabs',
  };
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

    // ── Provider key guard (graceful 503 so client can fall back) ──────────
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenKey) {
      return json(
        {
          error: 'TTS unavailable — set ELEVENLABS_API_KEY. Use expo-speech as fallback.',
        },
        503,
      );
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let text: string;
    try {
      const body = (await req.json()) as { text?: unknown };
      text = typeof body?.text === 'string' ? body.text.trim() : '';
    } catch {
      return json({ error: 'Request body must be JSON with a "text" field.' }, 400);
    }
    if (!text) return json({ error: '"text" field is required and must be non-empty.' }, 400);

    // Strip markdown + emoji / symbols so the voice doesn't read them aloud.
    text = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*([-*•]|\d+\.)\s+/gm, '')
      .replace(/`+/g, '')
      .replace(/[*_|]/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
      .replace(/[☀-➿]/g, '')
      .replace(/[←-⇿]/g, '')
      .replace(/[⌀-⏿]/g, '')
      .replace(/[⬀-⯿]/g, '')
      .replace(/[︀-️‍⃣]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!text) return json({ error: 'Nothing to speak after removing symbols.' }, 400);
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

    // ── Synthesise ─────────────────────────────────────────────────────────
    const result = await tryElevenLabs(text, elevenKey);
    if (!result) {
      return json({ error: 'TTS provider failed.' }, 502);
    }

    return json({
      audioBase64: result.audioBase64,
      mimeType: result.mimeType,
      provider: result.provider,
    });
  } catch (err) {
    console.error('[tts]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
