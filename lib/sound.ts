import * as FileSystem from 'expo-file-system';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';

/**
 * Plays a soft "pop" notification — like a website chat widget appearing.
 *
 * No binary asset is bundled; instead a short WAV is synthesised once at
 * runtime (a quick bell-like blip with fast decay), cached, and replayed.
 */

let popUri: string | null = null;
let popPlayer: ReturnType<typeof createAudioPlayer> | null = null;

// ── WAV synthesis ────────────────────────────────────────────────────────────

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function base64FromBytes(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const n = (bytes[i] << 16) | ((rem > 1 ? bytes[i + 1] : 0) << 8);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += rem === 2 ? chars[(n >> 6) & 63] : '=';
    out += '=';
  }
  return out;
}

/** Build a short, pleasant "pop" as a 16-bit mono WAV and return base64. */
function synthPopBase64(): string {
  const sampleRate = 44100;
  const duration = 0.18; // seconds
  const n = Math.floor(sampleRate * duration);
  const bytesPerSample = 2;
  const dataSize = n * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Samples: two stacked tones with a quick pitch drop + fast exponential
  // decay → a soft "bloop/pop". Slight attack avoids a click at the start.
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.006) * Math.exp(-t * 26); // attack + decay
    const freq = 720 - 180 * (t / duration); // gentle downward chirp
    const s =
      Math.sin(2 * Math.PI * freq * t) * 0.6 + Math.sin(2 * Math.PI * freq * 2 * t) * 0.2;
    const val = Math.max(-1, Math.min(1, s * env)) * 0.9;
    view.setInt16(44 + i * 2, val * 32767, true);
  }

  return base64FromBytes(new Uint8Array(buffer));
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Play the pop sound + a light haptic. Safe to call repeatedly; never throws. */
export async function playPop(): Promise<void> {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Ensure audio plays even when the device is on silent (iOS).
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    } catch {
      // non-fatal
    }
    if (!popUri) {
      const uri = FileSystem.cacheDirectory + 'aurora_pop.wav';
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        await FileSystem.writeAsStringAsync(uri, synthPopBase64(), {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      popUri = uri;
    }
    popPlayer = createAudioPlayer({ uri: popUri });
    popPlayer.volume = 1.0;
    popPlayer.play();
  } catch (e) {
    console.warn('[sound] playPop failed:', e);
  }
}
