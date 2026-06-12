import * as FileSystem from 'expo-file-system';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

/**
 * Water sound effects for the Hydration module.
 *
 * Like lib/sound.ts, no binary asset is bundled — short WAV clips are
 * synthesised once at runtime, cached on disk, and replayed:
 *   • playWaterFill()  — a soft "pour / gulp" used on quick-add.
 *   • playWaterDrop()  — a descending "bloop" used when a log is removed.
 */

// ── Tiny WAV writer (shared helpers, kept local to avoid coupling) ─────────────

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

/** Wrap a Float32 sample buffer (−1..1) into a 16-bit mono WAV base64 string. */
function encodeWavBase64(samples: Float32Array, sampleRate = 44100): string {
  const n = samples.length;
  const dataSize = n * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < n; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, val * 32767, true);
  }
  return base64FromBytes(new Uint8Array(buffer));
}

// A cheap deterministic noise source (no Math.random dependency for reproducible
// cache); a small LCG gives band-ish noise that reads as "rushing water".
function lcgNoise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

// ── Synthesis ─────────────────────────────────────────────────────────────────

/**
 * "Pour / fill" — models a glass filling with water. The defining cue of that
 * sound is *bubbles whose pitch rises* as the air cavity shrinks (Helmholtz
 * resonance climbs), sitting on a soft trickle of band-limited flow noise.
 *
 *   • Flow bed:  one-pole low-pass over noise → gentle "shhh" trickle.
 *   • Bubbles:   ~22 short sine "bloops", each chirping upward, and the whole
 *                stream's base pitch climbs over the duration → "filling up".
 *   • Envelope:  quick swell in, steady body, soft tail.
 */
function synthWaterFillBase64(): string {
  const sr = 44100;
  const dur = 1.25;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);

  // ── Flow bed: low-passed noise ──────────────────────────────────────────────
  const noise = lcgNoise(0x51d3);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.1) * (t > dur - 0.22 ? Math.max(0, (dur - t) / 0.22) : 1);
    lp += (noise() - lp) * 0.07; // heavier low-pass → soft, watery trickle
    out[i] += lp * 1.1 * env * 0.32;
  }

  // ── Bubble stream: rising-pitch "bloops" ────────────────────────────────────
  const rng = lcgNoise(0x9e37); // reused as a deterministic 0..1-ish source
  const BUBBLES = 22;
  for (let b = 0; b < BUBBLES; b++) {
    const prog = b / (BUBBLES - 1); // 0 → 1 across the fill
    // Bubbles cluster a touch denser toward the end, with mild jitter.
    const jitter = (rng() * 0.5 + 0.5) * 0.04;
    const tStart = Math.min(dur - 0.12, prog * (dur - 0.18) + jitter + 0.02);
    // Base pitch climbs as the glass fills; small per-bubble variation.
    const f0 = 260 + 900 * prog + rng() * 120;
    const life = 0.05 + (rng() * 0.5 + 0.5) * 0.06; // 50–110 ms
    const amp = 0.28 + (rng() * 0.5 + 0.5) * 0.16;
    const startIdx = Math.floor(tStart * sr);
    const lifeN = Math.floor(life * sr);
    for (let j = 0; j < lifeN && startIdx + j < n; j++) {
      const lt = j / sr;
      const localP = j / lifeN;
      // Each bubble chirps upward quickly — the classic "bewp".
      const freq = f0 * (1 + 3.2 * localP);
      // Fast attack, exponential decay.
      const env = Math.min(1, localP / 0.08) * Math.exp(-lt * 34);
      out[startIdx + j] += Math.sin(2 * Math.PI * freq * lt) * amp * env;
    }
  }

  // Soft-clip the mix for warmth instead of harsh digital clipping.
  for (let i = 0; i < n; i++) {
    const x = out[i] * 1.05;
    out[i] = Math.tanh(x) * 0.9;
  }
  return encodeWavBase64(out, sr);
}

/**
 * "Drop / remove" — a short descending bloop (pitch falls fast) with a watery
 * resonant tail. Used when a hydration log is deleted.
 */
function synthWaterDropBase64(): string {
  const sr = 44100;
  const dur = 0.28;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 16);
    const freq = 660 - 440 * (t / dur); // 660 → 220 Hz drop
    let s = Math.sin(2 * Math.PI * freq * t) * 0.7;
    s += Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.25; // sub-octave body
    out[i] = Math.max(-1, Math.min(1, s * env)) * 0.85;
  }
  return encodeWavBase64(out, sr);
}

// ── Cached players ─────────────────────────────────────────────────────────────

let fillUri: string | null = null;
let dropUri: string | null = null;
let fillPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let dropPlayer: ReturnType<typeof createAudioPlayer> | null = null;
let audioModeSet = false;

async function ensureAudioMode() {
  if (audioModeSet) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    audioModeSet = true;
  } catch {
    // non-fatal
  }
}

async function ensureCached(
  fileName: string,
  synth: () => string,
): Promise<string> {
  const uri = FileSystem.cacheDirectory + fileName;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(uri, synth(), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  return uri;
}

/** Play the water-fill "pour" sound. Safe to call repeatedly; never throws. */
export async function playWaterFill(): Promise<void> {
  try {
    await ensureAudioMode();
    if (!fillUri) fillUri = await ensureCached('aurora_water_fill_v2.wav', synthWaterFillBase64);
    fillPlayer = createAudioPlayer({ uri: fillUri });
    fillPlayer.volume = 0.9;
    fillPlayer.play();
  } catch (e) {
    console.warn('[waterSound] playWaterFill failed:', e);
  }
}

/** Play the water-drop "remove" sound. Safe to call repeatedly; never throws. */
export async function playWaterDrop(): Promise<void> {
  try {
    await ensureAudioMode();
    if (!dropUri) dropUri = await ensureCached('aurora_water_drop.wav', synthWaterDropBase64);
    dropPlayer = createAudioPlayer({ uri: dropUri });
    dropPlayer.volume = 0.9;
    dropPlayer.play();
  } catch (e) {
    console.warn('[waterSound] playWaterDrop failed:', e);
  }
}
