import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  FadeInUp,
  FadeInDown,
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
import { transcribeAudio, speakText } from '@/lib/voice';

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

const SUGGESTED_PROMPTS = [
  '💧 Log my water intake',
  '😴 How did I sleep last night?',
  '✅ Create a habit for me',
  '🍎 What should I eat today?',
  '📊 Give me my weekly summary',
];

function AuroraOrb({ status }: { status: OrbStatus }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.85);
  const outerScale = useSharedValue(1);

  useEffect(() => {
    if (status === 'idle') {
      scale.value = withSpring(1, { damping: 12 });
      opacity.value = withTiming(0.85, { duration: 300 });
      outerScale.value = withSpring(1);
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
    opacity: 0.2,
  }));

  const colors = ORB_COLORS[status];

  return (
    <View style={orbStyles.container}>
      {/* Outer glow ring */}
      <Animated.View style={[orbStyles.outerGlow, outerStyle, { backgroundColor: colors[0] }]} />
      {/* Inner orb */}
      <Animated.View style={innerStyle}>
        <LinearGradient colors={colors} style={orbStyles.orb} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Ionicons
            name={status === 'listening' ? 'mic' : status === 'thinking' ? 'ellipsis-horizontal' : status === 'speaking' ? 'volume-high' : 'sparkles'}
            size={28}
            color="#fff"
          />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const orbStyles = StyleSheet.create({
  container: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  outerGlow: { position: 'absolute', width: 100, height: 100, borderRadius: 50 },
  orb: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: '#4F7EF5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 12 },
});

function MessageBubble({ msg, theme }: { msg: ChatMessage; theme: ReturnType<typeof import('@/hooks/useTheme').useTheme> }) {
  const isUser = msg.role === 'user';
  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18)}
      style={[bubbleStyles.row, isUser ? bubbleStyles.rowRight : bubbleStyles.rowLeft]}
    >
      {isUser ? (
        <View style={[bubbleStyles.userBubble, { backgroundColor: theme.tint }]}>
          <Text style={bubbleStyles.userText}>{msg.content}</Text>
        </View>
      ) : (
        <LinearGradient
          colors={theme.isDark ? ['#1E2550', '#252840'] : ['#EEF2FF', '#F0E8FF']}
          style={bubbleStyles.aiBubble}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Text style={[bubbleStyles.aiText, { color: theme.text }]}>{msg.content}</Text>
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
        </LinearGradient>
      )}
    </Animated.View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: { marginVertical: 4, paddingHorizontal: 16 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  userBubble: { maxWidth: '78%', padding: 14, borderRadius: 20, borderBottomRightRadius: 6 },
  userText: { color: '#fff', fontSize: 15, lineHeight: 22 },
  aiBubble: { maxWidth: '82%', padding: 14, borderRadius: 20, borderBottomLeftRadius: 6 },
  aiText: { fontSize: 15, lineHeight: 22 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  actionText: { fontSize: 12, fontWeight: '700' },
});

export default function CompanionScreen() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<OrbStatus>('idle');
  const [textInput, setTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const listRef = useRef<FlatList>(null);
  const historyRef = useRef<CompanionMessage[]>([]);

  // expo-audio recorder (must be created via the hook — see lib/voice.ts note).
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordStartRef = useRef(0);

  // Greeting on mount
  useEffect(() => {
    const name = profile?.name ?? 'there';
    const greeting: ChatMessage = {
      id: 'greeting',
      role: 'assistant',
      content: `Hi ${name}! I'm Aurora 🌟\n\nI'm your personal health companion. I can help you log water, track sleep, manage habits, log meals, and give you health insights.\n\nHow can I help you today?`,
    };
    setMessages([greeting]);
    historyRef.current = [{ role: 'assistant', content: greeting.content }];
  }, [profile?.name]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
  }, []);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (next.length > 30) next.splice(1, next.length - 30); // keep greeting + 29
      return next;
    });
    historyRef.current = [
      ...historyRef.current,
      { role: msg.role, content: msg.content },
    ].slice(-20);
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSendText = useCallback(async () => {
    const text = textInput.trim();
    if (!text || status !== 'idle') return;
    setTextInput('');
    addMessage({ id: `u-${Date.now()}`, role: 'user', content: text });
    setStatus('thinking');
    try {
      const res = await sendToCompanion(historyRef.current);
      addMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.replyText,
        actions: res.actions.length > 0 ? res.actions : undefined,
      });
    } catch (err) {
      console.error('[Aurora] sendToCompanion (text) failed:', err);
      addMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ ${err instanceof Error ? err.message : 'Aurora is unavailable right now'}`,
      });
      showToast(err instanceof Error ? err.message : 'Aurora is unavailable right now', 'error');
    } finally {
      setStatus('idle');
    }
  }, [textInput, status, addMessage, showToast]);

  const handleMicPressIn = useCallback(async () => {
    if (status !== 'idle') return;
    setIsRecording(true);
    setStatus('listening');
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        throw new Error('Microphone permission denied. Enable it in Settings to use voice.');
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordStartRef.current = Date.now();
    } catch (err) {
      console.error('[Aurora] startRecording failed:', err);
      setIsRecording(false);
      setStatus('idle');
      showToast(err instanceof Error ? err.message : 'Microphone not available', 'error');
    }
  }, [status, showToast, audioRecorder]);

  const handleMicPressOut = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    setStatus('thinking');
    try {
      await audioRecorder.stop();
      // Ignore ultra-short taps that produce an empty/corrupt clip.
      const elapsed = Date.now() - recordStartRef.current;
      const uri = audioRecorder.uri;
      if (elapsed < 500 || !uri) {
        setStatus('idle');
        return;
      }
      const transcript = await transcribeAudio(uri);
      if (!transcript?.trim()) { setStatus('idle'); return; }
      addMessage({ id: `u-${Date.now()}`, role: 'user', content: transcript });
      const res = await sendToCompanion(historyRef.current, true);
      addMessage({
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.replyText,
        actions: res.actions.length > 0 ? res.actions : undefined,
      });
      setStatus('speaking');
      await speakText(res.replyText, res.audioBase64);
    } catch (err) {
      console.error('[Aurora] voice turn failed:', err);
      showToast(err instanceof Error ? err.message : 'Voice turn failed. Try text mode.', 'error');
    } finally {
      setStatus('idle');
    }
  }, [isRecording, addMessage, showToast, audioRecorder]);

  const handlePrompt = useCallback((prompt: string) => {
    setTextInput(prompt.replace(/^[^\s]+\s/, ''));
  }, []);

  const showSuggestions = messages.length <= 1;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Orb header */}
        <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.orbSection}>
          <AuroraOrb status={status} />
          <Text style={[styles.statusLabel, { color: theme.textSecondary }]}>{STATUS_LABELS[status]}</Text>
        </Animated.View>

        {/* Message list */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble msg={item} theme={theme} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            status === 'thinking' ? (
              <View style={styles.thinkingRow}>
                <ActivityIndicator size="small" color={theme.tint} />
                <Text style={[styles.thinkingText, { color: theme.textSecondary }]}>Aurora is thinking…</Text>
              </View>
            ) : null
          }
        />

        {/* Suggested prompts */}
        {showSuggestions && (
          <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.suggestionsWrap}>
            <Text style={[styles.suggestLabel, { color: theme.textSecondary }]}>Try asking:</Text>
            <View style={styles.suggestRow}>
              {SUGGESTED_PROMPTS.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.suggestChip, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => handlePrompt(p)}
                >
                  <Text style={[styles.suggestText, { color: theme.text }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
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
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: theme.tint }]}
              onPress={handleSendText}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <Pressable
              style={[styles.micBtn, { backgroundColor: isRecording ? '#EF4444' : theme.tint }]}
              onPressIn={handleMicPressIn}
              onPressOut={handleMicPressOut}
            >
              <Ionicons name={isRecording ? 'stop' : 'mic'} size={20} color="#fff" />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  orbSection: { alignItems: 'center', paddingTop: 20, paddingBottom: 12 },
  statusLabel: { fontSize: 13, fontWeight: '600', marginTop: 8, letterSpacing: 0.2 },
  listContent: { paddingBottom: 12, paddingTop: 4 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  thinkingText: { fontSize: 14, fontWeight: '500', fontStyle: 'italic' },
  suggestionsWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  suggestLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  suggestText: { fontSize: 13, fontWeight: '500' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 10,
  },
  textInput: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});
