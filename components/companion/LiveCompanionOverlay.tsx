import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  cancelAnimation,
  FadeInDown,
  FadeOutUp,
} from 'react-native-reanimated';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import { useTheme } from '@/hooks/useTheme';
import { transcribeAudio, speakText, stopSpeaking } from '@/lib/voice';
import { sendToCompanion, CompanionMessage } from '@/lib/ai';
import { useLiveCompanionOpen, closeLiveCompanion } from '@/lib/liveCompanion';

// ─── Live phase ──────────────────────────────────────────────────────────────

type LivePhase = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

const PHASE_COLORS: Record<LivePhase, [string, string]> = {
  connecting: ['#4F7EF5', '#8B7CF0'],
  listening: ['#34C5FF', '#4F7EF5'],
  thinking: ['#8B7CF0', '#6B5CE7'],
  speaking: ['#22C55E', '#4CAF82'],
  error: ['#EF4444', '#DC2626'],
};

const PHASE_LABELS: Record<LivePhase, string> = {
  connecting: 'Connecting…',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Tap to retry',
};

// ─── Voice-activity-detection tuning (silence detection via mic metering) ─────

const POLL_MS = 150; // how often we sample the mic level
const SPEECH_DB = -38; // metering above this (dB) counts as speech
const SILENCE_MS = 1300; // trailing silence that ends a turn
const MAX_UTTERANCE_MS = 14000; // hard cap on a single turn
const NO_SPEECH_MS = 7000; // if nothing is said, restart listening
const MIN_UTTERANCE_MS = 500; // ignore sub-half-second blips
const START_GRACE_MS = 350; // ignore the mic warm-up spike
const FIXED_WINDOW_MS = 5000; // fallback when metering is unavailable/flat

// Recorder with audio-level metering enabled so we can detect end-of-speech.
const LIVE_RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// ─── Compact live orb ─────────────────────────────────────────────────────────

function LiveOrb({ phase, size = 56 }: { phase: LivePhase; size?: number }) {
  const scale = useSharedValue(1);
  const ring = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(ring);
    if (phase === 'listening') {
      scale.value = withRepeat(withTiming(1.14, { duration: 520 }), -1, true);
      ring.value = withRepeat(withTiming(1.4, { duration: 700 }), -1, true);
    } else if (phase === 'speaking') {
      scale.value = withRepeat(withTiming(1.12, { duration: 320 }), -1, true);
      ring.value = withRepeat(withTiming(1.28, { duration: 380 }), -1, true);
    } else if (phase === 'thinking' || phase === 'connecting') {
      scale.value = withRepeat(withTiming(1.06, { duration: 460 }), -1, true);
      ring.value = withRepeat(withTiming(1.16, { duration: 560 }), -1, true);
    } else {
      scale.value = withSpring(1, { damping: 12 });
      ring.value = withTiming(1, { duration: 200 });
    }
  }, [phase, scale, ring]);

  const innerStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ring.value }],
    opacity: (1.4 - ring.value) * 0.6,
  }));

  const colors = PHASE_COLORS[phase];
  const inner = size * 0.74;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors[0],
          },
          ringStyle,
        ]}
      />
      <Animated.View style={innerStyle}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={
              phase === 'listening'
                ? 'mic'
                : phase === 'thinking' || phase === 'connecting'
                  ? 'ellipsis-horizontal'
                  : phase === 'speaking'
                    ? 'volume-high'
                    : 'alert'
            }
            size={inner * 0.4}
            color="#fff"
          />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

// ─── Overlay ───────────────────────────────────────────────────────────────────

/**
 * LiveCompanionOverlay — Aurora's hands-free "Live" mode.
 *
 * Mounted globally (in the tabs layout) so it survives navigation between
 * modules. While open it runs a continuous turn loop, reusing the exact same
 * pipeline as the tap-to-talk Companion:
 *
 *   listen (auto stop on silence) → STT → ai-companion (+tools) → TTS → listen …
 *
 * It never taps anything: the user just talks, Aurora acts + replies aloud, then
 * it listens again. Closes only when the user taps the X. Server-side tool
 * actions (log water, complete habit, …) persist to Supabase, so the affected
 * screen shows them on its next load / pull-to-refresh.
 */
function LiveCompanionOverlayInner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<LivePhase>('connecting');
  const [youSaid, setYouSaid] = useState('');
  const [auroraSaid, setAuroraSaid] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const recorder = useAudioRecorder(LIVE_RECORDING_OPTIONS);
  const activeRef = useRef(false);
  const historyRef = useRef<CompanionMessage[]>([]);
  // Refs that let close() synchronously tear down an in-flight listen turn so
  // nothing touches the (possibly releasing) native recorder after teardown.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnResolveRef = useRef<((uri: string | null) => void) | null>(null);

  // Keep a phase setter that also bails out fast once we've closed.
  const setLivePhase = useCallback((p: LivePhase) => {
    if (activeRef.current || p === 'error') setPhase(p);
  }, []);

  const safeStopRecorder = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      // already stopped / never started / released — ignore
    }
  }, [recorder]);

  // Synchronously abort any in-progress listen turn (clear the poll timer and
  // resolve the pending promise) without calling into the native recorder.
  const abortTurn = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    const resolve = turnResolveRef.current;
    turnResolveRef.current = null;
    resolve?.(null);
  }, []);

  /**
   * Record one turn, auto-stopping when the user goes quiet (VAD). Resolves to
   * the recorded file URI, or null if nothing usable was captured (silence,
   * aborted, too short).
   */
  const listenForTurn = useCallback((): Promise<string | null> => {
    return new Promise(async (resolve) => {
      // If we were torn down before this turn even started, bail immediately.
      if (!activeRef.current) {
        resolve(null);
        return;
      }
      try {
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch {
        resolve(null);
        return;
      }
      if (!activeRef.current) {
        // Closed during prepare — stop and bail without polling.
        await safeStopRecorder();
        resolve(null);
        return;
      }
      setLivePhase('listening');

      const start = Date.now();
      let lastVoiceAt = start;
      let speechStarted = false;
      let meterMin = Infinity;
      let meterMax = -Infinity;
      let useFixedWindow = false;
      let finished = false;

      // Expose this turn's resolver so close()/cleanup can abort it instantly.
      turnResolveRef.current = resolve;

      const finish = async (useUri: boolean) => {
        if (finished) return;
        finished = true;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        turnResolveRef.current = null;
        let uri: string | null = null;
        try {
          await recorder.stop();
          uri = recorder.uri ?? null;
        } catch {
          uri = null;
        }
        const dur = Date.now() - start;
        resolve(useUri && uri && dur >= MIN_UTTERANCE_MS ? uri : null);
      };

      const timer = setInterval(() => {
        if (!activeRef.current) {
          void finish(false);
          return;
        }
        const now = Date.now();
        const elapsed = now - start;
        if (elapsed < START_GRACE_MS) return;

        let m: number | undefined;
        try {
          m = recorder.getStatus().metering;
        } catch {
          // Recorder released/unavailable — end this turn safely.
          void finish(false);
          return;
        }
        const hasMeter = typeof m === 'number' && !Number.isNaN(m);

        if (hasMeter && !useFixedWindow) {
          meterMin = Math.min(meterMin, m as number);
          meterMax = Math.max(meterMax, m as number);
          // Some devices report a flat/constant level (metering unsupported in
          // practice). If the signal never varies, fall back to a fixed window.
          if (elapsed > 1200 && meterMax - meterMin < 1) useFixedWindow = true;

          if ((m as number) > SPEECH_DB) {
            speechStarted = true;
            lastVoiceAt = now;
          }
        }

        if (useFixedWindow || !hasMeter) {
          if (elapsed >= FIXED_WINDOW_MS) void finish(true);
          return;
        }

        if (speechStarted && now - lastVoiceAt >= SILENCE_MS) {
          void finish(true); // natural end of an utterance
        } else if (!speechStarted && elapsed >= NO_SPEECH_MS) {
          void finish(false); // nobody spoke — loop will re-listen
        } else if (elapsed >= MAX_UTTERANCE_MS) {
          void finish(true); // safety cap
        }
      }, POLL_MS);
      pollTimerRef.current = timer;
    });
  }, [recorder, safeStopRecorder, setLivePhase]);

  /** Speak a reply and resolve once playback finishes (with a safety timeout). */
  const speakAndWait = useCallback(
    (text: string, audioBase64?: string, mimeType?: string): Promise<void> => {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        speakText(text, audioBase64, { mimeType, onDone: finish }).catch(finish);
        // Fallback in case the playback "finished" event never arrives.
        const ms = Math.min(25000, Math.max(3500, text.length * 95));
        setTimeout(finish, ms);
      });
    },
    [],
  );

  const open = useLiveCompanionOpen();

  // The continuous loop — runs for the lifetime of an open session.
  useEffect(() => {
    if (!open) return;

    activeRef.current = true;
    setErrorMsg('');
    setYouSaid('');
    setAuroraSaid('');
    setPhase('connecting');
    historyRef.current = [];

    (async () => {
      // Permission + audio session.
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setErrorMsg('Microphone permission denied. Enable it in Settings to use Live.');
          setPhase('error');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch {
        setErrorMsg('Microphone is unavailable right now.');
        setPhase('error');
        return;
      }

      while (activeRef.current) {
        const uri = await listenForTurn();
        if (!activeRef.current) break;
        if (!uri) continue; // silence / aborted — listen again

        setLivePhase('thinking');
        let transcript = '';
        try {
          transcript = (await transcribeAudio(uri)).trim();
        } catch {
          transcript = '';
        }
        if (!activeRef.current) break;
        if (!transcript) continue; // nothing intelligible — listen again

        setYouSaid(transcript);
        historyRef.current = [
          ...historyRef.current,
          { role: 'user' as const, content: transcript },
        ].slice(-20);

        let reply = '';
        let audioBase64: string | undefined;
        let audioMimeType: string | undefined;
        try {
          // Live flow → ElevenLabs voice.
          const res = await sendToCompanion(historyRef.current, true);
          reply = res.replyText;
          audioBase64 = res.audioBase64;
          audioMimeType = res.audioMimeType;
        } catch (err) {
          reply = err instanceof Error ? err.message : 'Sorry, I had trouble with that.';
        }
        if (!activeRef.current) break;

        setAuroraSaid(reply);
        historyRef.current = [
          ...historyRef.current,
          { role: 'assistant' as const, content: reply },
        ].slice(-20);

        if (reply) {
          setLivePhase('speaking');
          await speakAndWait(reply, audioBase64, audioMimeType);
        }
        // loop back to listening
      }
    })();

    return () => {
      activeRef.current = false;
      abortTurn();
      void safeStopRecorder();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = useCallback(() => {
    activeRef.current = false;
    abortTurn();
    void safeStopRecorder();
    stopSpeaking();
    closeLiveCompanion();
  }, [abortTurn, safeStopRecorder]);

  if (!open) return null;

  const colors = PHASE_COLORS[phase];
  const subtitle =
    phase === 'error'
      ? errorMsg || 'Something went wrong.'
      : auroraSaid || youSaid || 'Just start talking — I’m listening.';

  return (
    <View pointerEvents="box-none" style={[styles.root, { top: insets.top + 8 }]}>
      <Animated.View
        entering={FadeInDown.springify().damping(16)}
        exiting={FadeOutUp.duration(180)}
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
      >
        <LiveOrb phase={phase} size={54} />

        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <View style={[styles.liveDot, { backgroundColor: colors[0] }]} />
            <Text style={[styles.title, { color: colors[0] }]}>Aurora Live</Text>
            <Text style={[styles.phaseText, { color: theme.textSecondary }]}>
              · {PHASE_LABELS[phase]}
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: theme.text }]} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleClose}
          style={[styles.closeBtn, { backgroundColor: theme.background }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="End Aurora Live"
        >
          <Ionicons name="close" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export function LiveCompanionOverlay() {
  // Keep the inner component (and its recorder hook) mounted for the app's
  // lifetime. Toggling mount on open/close races the native recorder's release
  // against the in-flight listen loop and crashes ("shared object already
  // released"); instead we keep the recorder stable and gate behavior on `open`.
  return <LiveCompanionOverlayInner />;
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
    paddingHorizontal: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 460,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  title: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  phaseText: { fontSize: 12, fontWeight: '600' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LiveCompanionOverlay;
