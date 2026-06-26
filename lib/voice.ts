import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import { createAudioPlayer } from 'expo-audio';
import { supabase } from './supabase';

/**
 * Voice helpers for Aurora.
 *
 * NOTE: Audio RECORDING is NOT handled here. expo-audio only exposes a working
 * recorder via the `useAudioRecorder` hook (the `AudioRecorder` class is a
 * type-only export — `new AudioRecorder()` is `undefined` at runtime). The
 * recorder therefore lives in the Companion component; this module only takes
 * the resulting file URI and handles transcription + speech output.
 */

/** Upload a recorded audio file to the `stt` edge function and return the text. */
export async function transcribeAudio(uri: string): Promise<string> {
  if (!uri) return '';

  const formData = new FormData();
  // React Native FormData file shape.
  formData.append('file', { uri, name: 'audio.m4a', type: 'audio/m4a' } as unknown as Blob);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}` },
    body: formData,
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error ?? `STT failed (${response.status})`);
  }
  return (json.transcript as string) ?? '';
}

/**
 * Remove emoji, pictographs and symbol characters so the TTS engine doesn't
 * read them aloud (e.g. "🌟" → "glowing star"). Kept emoji-free text is used
 * ONLY for speech — the chat UI still shows the original text with emojis.
 */
export function stripForSpeech(text: string): string {
  return (
    text
      // ── Markdown → plain speech ──────────────────────────────────────────
      // Bold/italic markers (**x**, *x*, __x__, _x_) → keep the inner words.
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Headings (#, ##) and blockquotes (>).
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/^\s*>\s?/gm, '')
      // Bullet / list markers at line start (-, *, •, 1.).
      .replace(/^\s*([-*•]|\d+\.)\s+/gm, '')
      // Inline code / backticks.
      .replace(/`+/g, '')
      // Any leftover stray asterisks/underscores/pipes.
      .replace(/[*_|]/g, '')
      // ── Emoji & symbols ──────────────────────────────────────────────────
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
      .replace(/[☀-➿]/g, '')
      .replace(/[←-⇿]/g, '')
      .replace(/[⌀-⏿]/g, '')
      .replace(/[⬀-⯿]/g, '')
      .replace(/[︀-️‍⃣]/g, '')
      // Tidy whitespace left behind.
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

let activePlayer: ReturnType<typeof createAudioPlayer> | null = null;

export async function speakText(
  text: string,
  audioBase64?: string,
  opts?: { onDone?: () => void; mimeType?: string },
): Promise<void> {
  if (audioBase64) {
    // ElevenLabs returns MP3. Match the file extension to the payload's mime
    // type so expo-audio decodes it correctly.
    const ext = opts?.mimeType?.includes('wav') ? 'wav' : 'mp3';
    const uri = `${FileSystem.cacheDirectory}aurora_tts.${ext}`;
    await FileSystem.writeAsStringAsync(uri, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const player = createAudioPlayer({ uri });
    activePlayer = player;
    player.play();
    if (opts?.onDone) {
      player.addListener('playbackStatusUpdate', (s: { didJustFinish?: boolean }) => {
        if (s?.didJustFinish) opts.onDone?.();
      });
    }
  } else {
    const spoken = stripForSpeech(text);
    if (spoken) {
      Speech.speak(spoken, { language: 'en-US', rate: 0.95, onDone: opts?.onDone });
    } else {
      opts?.onDone?.();
    }
  }
}

/**
 * Synthesise arbitrary text into Aurora's server voice (ElevenLabs)
 * via the `tts` edge function. Returns the audio payload, or null on failure
 * so callers can fall back to on-device TTS. Used for text we generate on the
 * client (e.g. the opening greeting) that doesn't come from the AI companion.
 */
export async function synthesizeSpeech(
  text: string,
): Promise<{ audioBase64: string; mimeType: string } | null> {
  const spoken = stripForSpeech(text);
  if (!spoken) return null;
  try {
    const { data, error } = await supabase.functions.invoke('tts', { body: { text: spoken } });
    if (error) return null;
    const audioBase64 = (data as { audioBase64?: string })?.audioBase64;
    const mimeType = (data as { mimeType?: string })?.mimeType ?? 'audio/wav';
    return audioBase64 ? { audioBase64, mimeType } : null;
  } catch {
    return null;
  }
}

/**
 * Speak text using Aurora's server voice, falling back to on-device TTS when
 * the TTS service is unavailable. Convenience wrapper around synthesizeSpeech
 * + speakText for client-generated text.
 */
export async function speakWithServerVoice(
  text: string,
  opts?: { onDone?: () => void },
): Promise<void> {
  const audio = await synthesizeSpeech(text);
  return speakText(text, audio?.audioBase64, {
    onDone: opts?.onDone,
    mimeType: audio?.mimeType,
  });
}

/** Immediately stop any in-progress speech (device TTS + ElevenLabs audio). */
export function stopSpeaking(): void {
  Speech.stop();
  try {
    activePlayer?.pause();
  } catch {
    // ignore
  }
  activePlayer = null;
}
