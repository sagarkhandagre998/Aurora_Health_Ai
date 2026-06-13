import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withDelay,
  cancelAnimation,
  Easing,
  FadeInUp,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import { sendToCompanion, CompanionMessage } from '@/lib/ai';
import { transcribeAudio, speakText, speakWithServerVoice, stopSpeaking } from '@/lib/voice';

type OrbStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ tool: string; result: string }>;
}

const ORB_COLORS: Record<OrbStatus, [string, string]> = {
  idle: ['#4F7EF5', '#8B7CF0'],
  listening: ['#34C5FF', '#4F7EF5'],
  thinking: ['#8B7CF0', '#6B5CE7'],
  speaking: ['#22C55E', '#4CAF82'],
};

const STATUS_LABELS: Record<OrbStatus, string> = {
  idle: 'Aurora',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
};

// Self-contained questions so a single tap yields a useful spoken answer.
const SUGGESTED_PROMPTS = [
  '💧 How much water have I had today?',
  '😴 How did I sleep last night?',
  '✅ Suggest a healthy habit for me',
  '🍎 What should I eat today?',
  '📊 Give me my weekly summary',
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function greetingText(name: string): string {
  return `Hi ${name}! I'm Aurora 🌟 your personal health companion. I can log water, track sleep, manage habits, log meals, and share insights. How can I help today?`;
}

// ─── Aurora orb ─────────────────────────────────────────────────────────────

function AuroraOrb({ status, size = 100 }: { status: OrbStatus; size?: number }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.85);
  const outerScale = useSharedValue(1);
  const inner = size * 0.72;

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(outerScale);
    if (status === 'idle') {
      scale.value = withSpring(1, { damping: 12 });
      opacity.value = withTiming(0.85, { duration: 300 });
      outerScale.value = withRepeat(withTiming(1.08, { duration: 2200 }), -1, true);
    } else if (status === 'listening') {
      scale.value = withRepeat(withTiming(1.15, { duration: 550 }), -1, true);
      outerScale.value = withRepeat(withTiming(1.3, { duration: 700 }), -1, true);
      opacity.value = withTiming(1);
    } else if (status === 'thinking') {
      scale.value = withRepeat(withTiming(1.06, { duration: 450 }), -1, true);
      outerScale.value = withRepeat(withTiming(1.12, { duration: 600 }), -1, true);
    } else if (status === 'speaking') {
      scale.value = withRepeat(withTiming(1.12, { duration: 350 }), -1, true);
      outerScale.value = withRepeat(withTiming(1.2, { duration: 400 }), -1, true);
    }
  }, [status, scale, opacity, outerScale]);

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerScale.value }],
    opacity: 0.18,
  }));

  const colors = ORB_COLORS[status];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          { position: 'absolute', width: size, height: size, borderRadius: size / 2 },
          outerStyle,
          { backgroundColor: colors[0] },
        ]}
      />
      <Animated.View style={innerStyle}>
        <LinearGradient
          colors={colors}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors[0],
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.5,
            shadowRadius: 16,
            elevation: 12,
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons
            name={
              status === 'listening'
                ? 'mic'
                : status === 'thinking'
                  ? 'ellipsis-horizontal'
                  : status === 'speaking'
                    ? 'volume-high'
                    : 'sparkles'
            }
            size={inner * 0.38}
            color="#fff"
          />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

// ─── Animated waveform (recording overlay) ──────────────────────────────────

function WaveBar({ delay, color }: { delay: number; color: string }) {
  const h = useSharedValue(10);
  useEffect(() => {
    h.value = withDelay(
      delay,
      withRepeat(withTiming(42, { duration: 420, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
    return () => cancelAnimation(h);
  }, [delay, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[{ width: 6, borderRadius: 3, backgroundColor: color }, style]} />;
}

function Waveform({ color }: { color: string }) {
  const delays = [0, 120, 240, 90, 300, 180, 60, 210, 330];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 48 }}>
      {delays.map((d, i) => (
        <WaveBar key={i} delay={d} color={color} />
      ))}
    </View>
  );
}

// ─── Streaming (typewriter) text — reveals as Aurora speaks ──────────────────

function StreamingText({
  text,
  style,
  onUpdate,
  onDone,
}: {
  text: string;
  style: object;
  onUpdate?: () => void;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    if (!text) {
      onDone?.();
      return;
    }
    const total = text.length;
    const words = text.trim().split(/\s+/).length;
    // Pace roughly to natural speech (~2.7 words/sec), clamped for short replies.
    const dur = Math.max(1100, (words / 2.7) * 1000);
    const start = Date.now();
    const id = setInterval(() => {
      const p = (Date.now() - start) / dur;
      const n = Math.min(total, Math.ceil(p * total));
      setShown(n);
      if (n % 6 === 0) onUpdate?.();
      if (n >= total) {
        clearInterval(id);
        onUpdate?.();
        onDone?.();
      }
    }, 28);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const done = shown >= text.length;
  return (
    <Text style={style}>
      {text.slice(0, shown)}
      {!done && <Text style={{ opacity: 0.5 }}>▍</Text>}
    </Text>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  theme,
  isStreaming,
  onUpdate,
  onStreamDone,
}: {
  msg: ChatMessage;
  theme: ReturnType<typeof import('@/hooks/useTheme').useTheme>;
  isStreaming: boolean;
  onUpdate: () => void;
  onStreamDone: () => void;
}) {
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <Animated.View entering={FadeInUp.springify().damping(18)} style={[bubbleStyles.row, bubbleStyles.rowRight]}>
        <LinearGradient
          colors={[theme.tint, '#6B5CE7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={bubbleStyles.userBubble}
        >
          <Text style={bubbleStyles.userText}>{msg.content}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} style={[bubbleStyles.row, bubbleStyles.rowLeft]}>
      {/* Sparkle avatar */}
      <LinearGradient
        colors={['#4F7EF5', '#8B7CF0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={bubbleStyles.avatar}
      >
        <Ionicons name="sparkles" size={13} color="#fff" />
      </LinearGradient>

      <View style={[bubbleStyles.aiBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {isStreaming ? (
          <StreamingText
            text={msg.content}
            style={[bubbleStyles.aiText, { color: theme.text }]}
            onUpdate={onUpdate}
            onDone={onStreamDone}
          />
        ) : (
          <Text style={[bubbleStyles.aiText, { color: theme.text }]}>{msg.content}</Text>
        )}
        {msg.actions && msg.actions.length > 0 && (
          <View style={bubbleStyles.actionsRow}>
            {msg.actions.map((a, i) => (
              <View key={i} style={[bubbleStyles.actionChip, { backgroundColor: theme.success + '22' }]}>
                <Ionicons name="checkmark-circle" size={13} color={theme.success} />
                <Text style={[bubbleStyles.actionText, { color: theme.success }]}>{a.tool}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { marginVertical: 5, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 2,
  },
  userBubble: {
    maxWidth: '78%',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 22,
    borderBottomRightRadius: 7,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  aiBubble: {
    maxWidth: '80%',
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 22,
    borderBottomLeftRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  aiText: { fontSize: 15, lineHeight: 22 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
});

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CompanionScreen() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<OrbStatus>('idle');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamSpeaking, setStreamSpeaking] = useState(false);
  const [greetingSpeaking, setGreetingSpeaking] = useState(false);
  const listRef = useRef<FlatList>(null);
  const historyRef = useRef<CompanionMessage[]>([]);
  const greetedSpokenRef = useRef(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordStartRef = useRef(0);

  const firstName = profile?.name?.trim().split(' ')[0] || 'there';
  const firstNameRef = useRef(firstName);
  firstNameRef.current = firstName;

  // Greeting — set once, and only refresh the name while still on the greeting
  // (never wipe an in-progress conversation when the profile loads).
  useEffect(() => {
    const content = greetingText(firstName);
    setMessages((prev) => {
      if (prev.length === 0) return [{ id: 'greeting', role: 'assistant', content }];
      if (prev.length === 1 && prev[0].id === 'greeting') return [{ id: 'greeting', role: 'assistant', content }];
      return prev;
    });
    historyRef.current = [{ role: 'assistant', content }];
  }, [firstName]);

  // Speak a short greeting once when the module opens. Slight delay lets the
  // profile name settle so it greets you by name.
  useEffect(() => {
    if (greetedSpokenRef.current) return;
    greetedSpokenRef.current = true;
    const timer = setTimeout(() => {
      const spoken = `Hi ${firstNameRef.current}! I'm Aurora, your health companion. How can I help today?`;
      setGreetingSpeaking(true);
      speakWithServerVoice(spoken, { onDone: () => setGreetingSpeaking(false) }).catch(() =>
        setGreetingSpeaking(false),
      );
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 60);
  }, []);

  const addMessage = useCallback(
    (msg: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > 30) next.splice(1, next.length - 30);
        return next;
      });
      historyRef.current = [...historyRef.current, { role: msg.role, content: msg.content }].slice(-20);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  // Core send path shared by typed input, suggestions and voice.
  const sendMessage = useCallback(
    async (text: string, speak = false) => {
      const trimmed = text.trim();
      if (!trimmed || status !== 'idle') return;
      // Cut the opening greeting if it's still playing.
      stopSpeaking();
      setGreetingSpeaking(false);
      addMessage({ id: `u-${Date.now()}`, role: 'user', content: trimmed });
      setStatus('thinking');
      try {
        const res = await sendToCompanion(historyRef.current, speak);
        const aid = `a-${Date.now()}`;
        addMessage({
          id: aid,
          role: 'assistant',
          content: res.replyText,
          actions: res.actions.length > 0 ? res.actions : undefined,
        });
        // Stream the reply text; if spoken, fire TTS in parallel so the words
        // appear as Aurora speaks.
        setStreamSpeaking(speak);
        setStreamingId(aid);
        if (speak && res.replyText) {
          speakText(res.replyText, res.audioBase64, { mimeType: res.audioMimeType }).catch((e) =>
            console.error('[Aurora] speak failed:', e),
          );
        }
      } catch (err) {
        console.error('[Aurora] sendToCompanion failed:', err);
        addMessage({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${err instanceof Error ? err.message : 'Aurora is unavailable right now'}`,
        });
        showToast(err instanceof Error ? err.message : 'Aurora is unavailable right now', 'error');
      } finally {
        setStatus('idle');
      }
    },
    [status, addMessage, showToast],
  );

  const handleStreamDone = useCallback(() => {
    setStreamingId(null);
    setStreamSpeaking(false);
  }, []);

  const handleSendText = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    setTextInput('');
    sendMessage(text, false);
  }, [textInput, sendMessage]);

  const handlePrompt = useCallback(
    (prompt: string) => {
      sendMessage(prompt.replace(/^[^\s]+\s/, ''), true);
    },
    [sendMessage],
  );

  // Reset to a fresh conversation (back to the greeting / hero state).
  const resetConversation = useCallback(() => {
    const content = greetingText(firstName);
    setStreamingId(null);
    setStreamSpeaking(false);
    setStatus('idle');
    setTextInput('');
    setMessages([{ id: 'greeting', role: 'assistant', content }]);
    historyRef.current = [{ role: 'assistant', content }];
  }, [firstName]);

  // ── Recording: tap to start, tap to stop (Gemini-style) ──────────────────
  const startRecording = useCallback(async () => {
    if (status !== 'idle') return;
    stopSpeaking();
    setGreetingSpeaking(false);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        throw new Error('Microphone permission denied. Enable it in Settings to use voice.');
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordStartRef.current = Date.now();
      setIsRecording(true);
      setStatus('listening');
    } catch (err) {
      console.error('[Aurora] startRecording failed:', err);
      setIsRecording(false);
      setStatus('idle');
      showToast(err instanceof Error ? err.message : 'Microphone not available', 'error');
    }
  }, [status, showToast, audioRecorder]);

  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setStatus('thinking');
    try {
      await audioRecorder.stop();
      const elapsed = Date.now() - recordStartRef.current;
      const uri = audioRecorder.uri;
      if (elapsed < 500 || !uri) {
        setStatus('idle');
        return;
      }
      const transcript = await transcribeAudio(uri);
      if (!transcript?.trim()) {
        setStatus('idle');
        return;
      }
      addMessage({ id: `u-${Date.now()}`, role: 'user', content: transcript });
      const res = await sendToCompanion(historyRef.current, true);
      const aid = `a-${Date.now()}`;
      addMessage({
        id: aid,
        role: 'assistant',
        content: res.replyText,
        actions: res.actions.length > 0 ? res.actions : undefined,
      });
      setStreamSpeaking(true);
      setStreamingId(aid);
      if (res.replyText) {
        speakText(res.replyText, res.audioBase64).catch((e) => console.error('[Aurora] speak failed:', e));
      }
    } catch (err) {
      console.error('[Aurora] voice turn failed:', err);
      showToast(err instanceof Error ? err.message : 'Voice turn failed. Try text mode.', 'error');
    } finally {
      setStatus('idle');
    }
  }, [isRecording, addMessage, showToast, audioRecorder]);

  const cancelRecording = useCallback(async () => {
    setIsRecording(false);
    setStatus('idle');
    try {
      await audioRecorder.stop();
    } catch {
      // ignore
    }
  }, [audioRecorder]);

  const orbStatus: OrbStatus =
    (streamingId && streamSpeaking) || greetingSpeaking ? 'speaking' : status;
  const isEmpty = messages.length <= 1;

  // Stop any speech if the user leaves the screen.
  useEffect(() => () => stopSpeaking(), []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isEmpty ? (
          // ── Premium hero / greeting empty state ──────────────────────────
          <ScrollView
            contentContainerStyle={styles.heroWrap}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeInDown.springify().damping(16)} style={{ alignItems: 'center' }}>
              <AuroraOrb status={orbStatus} size={116} />
            </Animated.View>
            <Animated.Text
              entering={FadeInUp.delay(120).springify()}
              style={[styles.heroGreeting, { color: theme.text }]}
            >
              {timeGreeting()}, {firstName}
            </Animated.Text>
            <Animated.Text
              entering={FadeInUp.delay(180).springify()}
              style={[styles.heroSub, { color: theme.textSecondary }]}
            >
              I'm Aurora, your health companion. Ask me anything about your hydration, sleep, habits or nutrition.
            </Animated.Text>

            <View style={styles.heroChips}>
              {SUGGESTED_PROMPTS.map((p, i) => (
                <Animated.View key={i} entering={FadeInUp.delay(240 + i * 60).springify()}>
                  <TouchableOpacity
                    style={[styles.suggestChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                    onPress={() => handlePrompt(p)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.suggestText, { color: theme.text }]}>{p}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <>
            {/* Compact orb header + new-conversation button */}
            <View style={styles.header}>
              <AuroraOrb status={orbStatus} size={64} />
              <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>{STATUS_LABELS[orbStatus]}</Text>
              <TouchableOpacity
                style={[styles.newChatBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={resetConversation}
                activeOpacity={0.8}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Start a new conversation"
              >
                <Ionicons name="create-outline" size={16} color={theme.tint} />
                <Text style={[styles.newChatText, { color: theme.tint }]}>New</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <MessageBubble
                  msg={item}
                  theme={theme}
                  isStreaming={item.id === streamingId}
                  onUpdate={() => scrollToBottom(false)}
                  onStreamDone={handleStreamDone}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => scrollToBottom(false)}
              ListFooterComponent={
                status === 'thinking' ? (
                  <Animated.View entering={FadeIn} style={styles.thinkingRow}>
                    <View style={[bubbleStyles.avatar, { marginBottom: 0 }]}>
                      <Ionicons name="sparkles" size={13} color="#fff" />
                    </View>
                    <ActivityIndicator size="small" color={theme.tint} />
                    <Text style={[styles.thinkingText, { color: theme.textSecondary }]}>Aurora is thinking…</Text>
                  </Animated.View>
                ) : null
              }
            />
          </>
        )}

        {/* Input bar */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 40 : 0}
          tint={theme.isDark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={[styles.inputBarBlur, { borderTopColor: theme.border }]}
        >
          <View style={[styles.inputBar, { backgroundColor: theme.card + (Platform.OS === 'ios' ? 'D9' : 'FF') }]}>
            <TextInput
              style={[styles.textInput, { color: theme.text, backgroundColor: theme.background }]}
              placeholder="Message Aurora…"
              placeholderTextColor={theme.textSecondary}
              value={textInput}
              onChangeText={setTextInput}
              onSubmitEditing={handleSendText}
              returnKeyType="send"
              multiline
              maxLength={500}
            />
            {textInput.trim().length > 0 ? (
              <TouchableOpacity style={[styles.sendBtn, { backgroundColor: theme.tint }]} onPress={handleSendText}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.micBtn, { backgroundColor: theme.tint }]}
                onPress={startRecording}
                activeOpacity={0.85}
              >
                <Ionicons name="mic" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </BlurView>
      </KeyboardAvoidingView>

      {/* ── Gemini-style recording overlay ──────────────────────────────── */}
      {isRecording && (
        <Animated.View entering={FadeIn.duration(180)} style={styles.overlay}>
          <BlurView
            intensity={60}
            tint={theme.isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background + 'D0' }]} />

          <View style={styles.overlayContent}>
            <AuroraOrb status="listening" size={140} />
            <Text style={[styles.overlayTitle, { color: theme.text }]}>Listening…</Text>
            <Text style={[styles.overlayHint, { color: theme.textSecondary }]}>Tap stop when you're done</Text>

            <View style={styles.waveWrap}>
              <Waveform color={theme.tint} />
            </View>

            <View style={styles.overlayBtns}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={cancelRecording}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.stopBtn} onPress={stopRecording} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  style={styles.stopBtnInner}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="stop" size={26} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
              <View style={{ width: 52 }} />
            </View>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },

  // Hero / empty state
  heroWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  heroGreeting: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 24, textAlign: 'center' },
  heroSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 320 },
  heroChips: { marginTop: 30, gap: 10, width: '100%', alignItems: 'center' },

  // Chat header
  header: { alignItems: 'center', paddingTop: 8, paddingBottom: 6, justifyContent: 'center' },
  statusLabel: { fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
  newChatBtn: {
    position: 'absolute',
    right: 16,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  newChatText: { fontSize: 13, fontWeight: '700' },

  listContent: { paddingBottom: 16, paddingTop: 4 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  thinkingText: { fontSize: 14, fontWeight: '500', fontStyle: 'italic' },

  suggestChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 240,
    alignItems: 'center',
  },
  suggestText: { fontSize: 14, fontWeight: '600' },

  // Input bar
  inputBarBlur: { borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 10,
  },
  textInput: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 110,
    lineHeight: 20,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  micBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },

  // Recording overlay
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  overlayContent: { alignItems: 'center', paddingHorizontal: 32 },
  overlayTitle: { fontSize: 24, fontWeight: '800', marginTop: 28, letterSpacing: -0.3 },
  overlayHint: { fontSize: 14, marginTop: 6 },
  waveWrap: { marginTop: 30, marginBottom: 8 },
  overlayBtns: { flexDirection: 'row', alignItems: 'center', gap: 28, marginTop: 36 },
  cancelBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stopBtn: { borderRadius: 38 },
  stopBtnInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 10,
  },
});
