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
      // Main emoji planes (😀 🌟 💧 🍎 …) — needs the `u` flag.
      .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
      // Regional indicator symbols / flags.
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
      // Misc symbols & dingbats (✨ ✅ ☀ ☔ …) and supplemental arrows.
      .replace(/[☀-➿]/g, '')
      // Arrows.
      .replace(/[←-⇿]/g, '')
      // Misc technical (⏰ ⌛ …).
      .replace(/[⌀-⏿]/g, '')
      // Stars, extra arrows (⭐ U+2B50 …).
      .replace(/[⬀-⯿]/g, '')
      // Variation selectors, zero-width joiner, keycap combiner.
      .replace(/[︀-️‍⃣]/g, '')
      // Tidy whitespace left behind.
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export async function speakText(text: string, audioBase64?: string): Promise<void> {
  if (audioBase64) {
    const uri = FileSystem.cacheDirectory + 'aurora_tts.mp3';
    await FileSystem.writeAsStringAsync(uri, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const player = createAudioPlayer({ uri });
    player.play();
  } else {
    const spoken = stripForSpeech(text);
    if (spoken) Speech.speak(spoken, { language: 'en-US', rate: 0.95 });
  }
}
