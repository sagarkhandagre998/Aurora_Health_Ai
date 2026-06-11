/**
 * tts — Text-to-speech edge function using ElevenLabs.
 *
 * Accepts JSON { text: string }, synthesises speech with ElevenLabs Rachel
 * (voice id 21m00Tcm4TlvDq8ikWAM, eleven_flash_v2_5 model), and returns the
 * audio as a base64-encoded string so the client can play it with expo-audio
 * without writing a temporary file.
 *
 * Deploy: supabase functions deploy tts
 * Env vars: ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Client fallback: if this function returns an error or ELEVENLABS_API_KEY is
 * not set (status 503), the client should fall back to expo-speech for
 * on-device TTS.
 *
 * Client playback example (expo-audio):
 *   import { Audio } from 'expo-audio';
 *   import * as FileSystem from 'expo-file-system';
 *
 *   const { audioBase64, mimeType } = res.data;
 *   const uri = FileSystem.cacheDirectory + 'aurora_tts.mp3';
 *   await FileSystem.writeAsStringAsync(uri, audioBase64, { encoding: 'base64' });
 *   const { sound } = await Audio.Sound.createAsync({ uri });
 *   await sound.playAsync();
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

/** ElevenLabs Rachel — calm, natural, female English voice. */
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/**
 * eleven_flash_v2_5: lowest latency ElevenLabs model, optimised for
 * real-time conversational use. Upgrade to eleven_turbo_v2_5 for higher
 * quality at the cost of slightly more latency.
 */
const MODEL_ID = 'eleven_flash_v2_5';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Uint8Array to a base64 string in Deno without hitting the
 * call-stack limit that a single String.fromCharCode(...arr) would on large
 * buffers (typically >~65 KB).
 */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
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

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    // ── API key guard (graceful 503 so client can fall back) ───────────────
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenKey) {
      return json(
        { error: 'TTS service unavailable — ELEVENLABS_API_KEY not configured. Use expo-speech as fallback.' },
        503,
      );
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let text: string;
    try {
      const body = await req.json() as { text?: unknown };
      text = typeof body?.text === 'string' ? body.text.trim() : '';
    } catch {
      return json({ error: 'Request body must be JSON with a "text" field.' }, 400);
    }

    if (!text) return json({ error: '"text" field is required and must be non-empty.' }, 400);

    // Strip emoji / pictographs / symbols so the voice doesn't read them aloud
    // (e.g. "🌟" → "glowing star"). The client UI keeps the original text.
    text = text
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
      .replace(/[☀-➿]/g, '') // misc symbols & dingbats (✅ ✨ ☀)
      .replace(/[←-⇿]/g, '') // arrows
      .replace(/[⌀-⏿]/g, '') // misc technical (⏰)
      .replace(/[⬀-⯿]/g, '') // stars/arrows (⭐)
      .replace(/[︀-️‍⃣]/g, '') // variation selectors, ZWJ, keycap
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!text) return json({ error: 'Nothing to speak after removing symbols.' }, 400);

    // Trim to max allowed length to avoid runaway costs.
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
    }

    // ── Call ElevenLabs API ────────────────────────────────────────────────
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenKey,
          // Request mp3 at 128 kbps — good balance of quality vs. payload size.
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.50,          // 0 = more expressive, 1 = more consistent
            similarity_boost: 0.75,   // closeness to the original voice
            style: 0.0,               // disable style exaggeration for natural speech
            use_speaker_boost: true,  // enhances voice presence
          },
        }),
      },
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text();
      console.error('[tts] ElevenLabs error:', elevenRes.status, errText);

      // Surface a helpful message for common errors.
      if (elevenRes.status === 401) {
        return json({ error: 'Invalid ELEVENLABS_API_KEY.' }, 502);
      }
      if (elevenRes.status === 422) {
        return json({ error: `ElevenLabs rejected the request: ${errText}` }, 502);
      }
      throw new Error(`ElevenLabs API ${elevenRes.status}: ${errText}`);
    }

    // ── Encode audio as base64 ─────────────────────────────────────────────
    const audioBuffer = await elevenRes.arrayBuffer();
    const audioBase64 = uint8ToBase64(new Uint8Array(audioBuffer));

    return json({
      audioBase64,
      mimeType: 'audio/mpeg',
      /** Approx. duration hint (not precise) for the client to pre-size a buffer. */
      byteLength: audioBuffer.byteLength,
    });
  } catch (err) {
    console.error('[tts]', err);
    return json({ error: (err as Error).message }, 500);
  }
});
