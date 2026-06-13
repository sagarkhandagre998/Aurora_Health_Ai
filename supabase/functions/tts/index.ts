/**
 * tts — Text-to-speech edge function.
 *
 * Primary provider: Google Gemini TTS (gemini-2.5-flash-preview-tts) using the
 * "Aoede" prebuilt voice — the same lifelike voice family as Gemini Live's
 * native audio. Gemini returns raw 24kHz/16-bit mono PCM, which we wrap in a
 * WAV header so the client can play it directly.
 *
 * Fallback provider: ElevenLabs (Rachel, eleven_flash_v2_5). Used when Gemini
 * is rate-limited (429), errors, or has no API key. Returns mp3.
 *
 * Provider order depends on the caller's `prefer` field:
 *   prefer = 'gemini'      (Live flow)    → Gemini first, ElevenLabs fallback.
 *   prefer = 'elevenlabs'  (general, def) → ElevenLabs first, Gemini fallback.
 * The Live flow favours Gemini's lifelike voice; the general chat favours
 * ElevenLabs' lower latency for snappier replies. Either way the other
 * provider is the automatic fallback on rate-limit/error.
 *
 * Accepts JSON { text: string, prefer?: 'gemini' | 'elevenlabs' } and returns
 * { audioBase64, mimeType, provider }.
 *
 * Deploy: supabase functions deploy tts
 * Env vars:
 *   GEMINI_API_KEY      — Google AI Studio key (primary). Free tier works.
 *   ELEVENLABS_API_KEY  — ElevenLabs key (fallback).
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional overrides: GEMINI_TTS_MODEL, GEMINI_TTS_VOICE.
 *
 * Client fallback: if this returns 503 (no providers configured) or an error,
 * the client falls back to expo-speech (on-device TTS).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Gemini TTS model on the generateContent API (free tier, with rate limits). */
const GEMINI_MODEL = Deno.env.get('GEMINI_TTS_MODEL') ?? 'gemini-2.5-flash-preview-tts';
/** Prebuilt voice — Aoede: warm, melodic female. Shared with Gemini Live. */
const GEMINI_VOICE = Deno.env.get('GEMINI_TTS_VOICE') ?? 'Aoede';

/** ElevenLabs Rachel — calm, natural female English voice (fallback). */
const ELEVEN_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
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

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Wrap raw signed 16-bit little-endian PCM in a minimal 44-byte WAV header so
 * expo-audio can play it. Gemini TTS returns mono 24kHz PCM by default.
 */
function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bitsPerSample = 16): Uint8Array {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  const out = new Uint8Array(buffer);
  out.set(pcm, 44);
  return out;
}

// ─── Providers ────────────────────────────────────────────────────────────────

interface TtsResult {
  audioBase64: string;
  mimeType: string;
  provider: 'gemini' | 'elevenlabs';
}

/**
 * Synthesise with Gemini TTS. Returns the WAV audio, or null when it should
 * fall back (rate-limited, errored, or no audio in the response).
 */
async function tryGemini(text: string, key: string): Promise<TtsResult | null> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
            },
          },
        }),
      },
    );
  } catch (e) {
    console.error('[tts] Gemini fetch failed:', (e as Error).message);
    return null;
  }

  if (res.status === 429) {
    console.log('[tts] Gemini rate-limited (429) — falling back to ElevenLabs.');
    return null;
  }
  if (!res.ok) {
    console.error('[tts] Gemini error', res.status, await res.text());
    return null;
  }

  // deno-lint-ignore no-explicit-any
  const data = (await res.json()) as any;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  // deno-lint-ignore no-explicit-any
  const audioPart = parts.find((p: any) => p?.inlineData?.data);
  if (!audioPart) {
    console.error('[tts] Gemini returned no audio part.');
    return null;
  }

  const mime: string = audioPart.inlineData.mimeType ?? 'audio/L16;codec=pcm;rate=24000';
  const rate = parseInt(mime.match(/rate=(\d+)/)?.[1] ?? '24000', 10);
  const pcm = base64ToUint8(audioPart.inlineData.data as string);
  const wav = pcmToWav(pcm, rate);

  console.log(`[tts] served by gemini (${GEMINI_MODEL}, voice=${GEMINI_VOICE})`);
  return { audioBase64: uint8ToBase64(wav), mimeType: 'audio/wav', provider: 'gemini' };
}

/** Synthesise with ElevenLabs (fallback). Returns mp3, or null on failure. */
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
  console.log('[tts] served by elevenlabs (fallback)');
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
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GEMINI_API');
    const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!geminiKey && !elevenKey) {
      return json(
        {
          error:
            'TTS unavailable — set GEMINI_API_KEY (primary) or ELEVENLABS_API_KEY (fallback). Use expo-speech as fallback.',
        },
        503,
      );
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let text: string;
    let prefer: 'gemini' | 'elevenlabs';
    try {
      const body = (await req.json()) as { text?: unknown; prefer?: unknown };
      text = typeof body?.text === 'string' ? body.text.trim() : '';
      // Default to ElevenLabs-first (general chat) for lower latency; the Live
      // flow explicitly passes prefer:'gemini' for the more lifelike voice.
      prefer = body?.prefer === 'gemini' ? 'gemini' : 'elevenlabs';
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

    // ── Synthesise, honouring the preferred provider with auto-fallback ────
    let result: TtsResult | null = null;
    if (prefer === 'gemini') {
      if (geminiKey) result = await tryGemini(text, geminiKey);
      if (!result && elevenKey) result = await tryElevenLabs(text, elevenKey);
    } else {
      if (elevenKey) result = await tryElevenLabs(text, elevenKey);
      if (!result && geminiKey) result = await tryGemini(text, geminiKey);
    }

    if (!result) {
      return json({ error: 'All TTS providers failed.' }, 502);
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
