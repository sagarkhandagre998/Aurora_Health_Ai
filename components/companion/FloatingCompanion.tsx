import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  cancelAnimation,
  FadeIn,
  FadeOut,
  Easing,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/lib/auth';
import { speakText, stopSpeaking } from '@/lib/voice';
import { playPop } from '@/lib/sound';

const INTRO_SEEN_KEY = 'aurora_intro_seen_v1';
// Website-widget style: appear a few seconds after the user lands.
const APPEAR_DELAY_MS = 6000;

/**
 * FloatingCompanion — a proactive Aurora presence, inspired by website chat
 * widgets (Intercom/Drift/Crisp).
 *
 * Behavior: stays hidden for a few seconds after the user enters, then pops up
 * in the bottom-right corner with a soft click sound and a short guiding
 * message letting the user know the app has an AI companion. On the FIRST run
 * it also speaks a quick hello. Tapping it opens the full Companion screen.
 */
export function FloatingCompanion() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const firstName = profile?.name?.trim().split(' ')[0] || 'there';

  const [visible, setVisible] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const enter = useSharedValue(0); // 0 hidden → 1 shown
  const pulse = useSharedValue(1);
  const ring = useSharedValue(1);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goToCompanion = useCallback(() => {
    stopSpeaking();
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble(null);
    // Hide the floating orb so it doesn't overlap the Companion's voice button.
    setDismissed(true);
    router.push('/(tabs)/companion');
  }, [router]);

  const dismissBubble = useCallback(() => {
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const appearTimer = setTimeout(async () => {
      if (cancelled) return;

      // Pop sound + light haptic as it appears (website-widget feel).
      playPop();

      setVisible(true);
      // Slide/spring up from the corner.
      enter.value = withSequence(
        withSpring(1.08, { damping: 9, stiffness: 110 }),
        withSpring(1, { damping: 10 }),
      );
      // Idle breathing + halo.
      pulse.value = withRepeat(
        withTiming(1.06, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
      ring.value = withRepeat(
        withTiming(1.5, { duration: 2200, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      );

      // Decide the nudge message — richer + spoken on the very first run.
      let firstRun = false;
      try {
        const seen = await AsyncStorage.getItem(INTRO_SEEN_KEY);
        firstRun = !seen;
        if (firstRun) await AsyncStorage.setItem(INTRO_SEEN_KEY, '1');
      } catch {
        // ignore storage errors
      }
      if (cancelled) return;

      const msg = firstRun
        ? `Hi ${firstName}! 👋 I'm Aurora, your AI health companion. Tap me anytime to log water, track sleep, or just chat about how you're feeling.`
        : `Need a hand, ${firstName}? Tap me to log water, sleep, habits or meals — or just ask.`;
      setBubble(msg);

      if (firstRun) {
        speakText(
          `Hi ${firstName}! I'm Aurora, your AI health companion. Tap me anytime to chat.`,
        ).catch(() => {});
      }

      // Auto-dismiss the bubble (keep the orb).
      bubbleTimer.current = setTimeout(() => setBubble(null), firstRun ? 9000 : 6000);
    }, APPEAR_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(appearTimer);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      cancelAnimation(enter);
      cancelAnimation(pulse);
      cancelAnimation(ring);
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orbStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: enter.value * pulse.value }, { translateY: (1 - enter.value) * 40 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1.5 - ring.value) * 0.5,
    transform: [{ scale: ring.value }],
  }));

  if (!visible || dismissed) return null;

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {bubble && (
        <Animated.View
          entering={FadeIn.duration(260)}
          exiting={FadeOut.duration(220)}
          style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border }]}
        >
          <View style={styles.bubbleHeader}>
            <View style={styles.bubbleNameRow}>
              <View style={styles.onlineDot} />
              <Text style={[styles.bubbleName, { color: theme.tint }]}>Aurora</Text>
            </View>
            <TouchableOpacity onPress={dismissBubble} hitSlop={8}>
              <Ionicons name="close" size={15} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.bubbleText, { color: theme.text }]}>{bubble}</Text>
          <TouchableOpacity onPress={goToCompanion} activeOpacity={0.85}>
            <LinearGradient
              colors={['#4F7EF5', '#8B7CF0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.bubbleCta}
            >
              <Ionicons name="chatbubbles" size={14} color="#fff" />
              <Text style={styles.bubbleCtaText}>Chat with Aurora</Text>
            </LinearGradient>
          </TouchableOpacity>
          <View style={[styles.bubbleTail, { borderTopColor: theme.card }]} />
        </Animated.View>
      )}

      <Animated.View style={[styles.orbWrap, orbStyle]}>
        <Animated.View style={[styles.ring, ringStyle, { backgroundColor: theme.tint }]} />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={goToCompanion}
          accessibilityLabel="Open Aurora companion"
        >
          <LinearGradient
            colors={['#4F7EF5', '#8B7CF0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.orb}
          >
            <MaterialCommunityIcons name="robot-happy" size={28} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const ORB = 58;
const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 16,
    bottom: Platform.OS === 'ios' ? 100 : 84,
    alignItems: 'flex-end',
    zIndex: 50,
  },
  orbWrap: { width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: ORB, height: ORB, borderRadius: ORB / 2 },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  bubble: {
    maxWidth: 280,
    marginBottom: 12,
    marginRight: 4,
    padding: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  bubbleNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  bubbleName: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  bubbleText: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  bubbleCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
  },
  bubbleCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bubbleTail: {
    position: 'absolute',
    bottom: -8,
    right: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});

export default FloatingCompanion;
