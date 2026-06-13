import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  cancelAnimation,
  interpolate,
  Extrapolation,
  Easing,
} from 'react-native-reanimated';

/**
 * AnimatedMicButton — the center tab FAB for Aurora's voice companion.
 *
 * Draws the eye to the voice feature with voice-assistant style visuals
 * (Google Assistant / Meta Voice SDK): concentric "sonar" rings that expand
 * and fade, layered under a softly breathing, glowing orb.
 *
 * The attention animation is intentionally NOT constant — it plays in short
 * bursts with quiet gaps in between, so it nudges without nagging. Once the
 * user actually opens the companion tab it stops for good (persisted), since
 * the feature has been discovered. When idle the orb is a calm static button.
 *
 * Rendered inside `tabBarIcon`, so it only handles the visuals — the parent
 * <Tabs.Screen> + HapticTab own the press/navigation + haptics.
 */

const FAB = 62;
const RING_COUNT = 3;
// Stagger each ring by a third of the cycle so emission looks continuous.
const RING_CYCLE_MS = 2400;

// One attention burst, then a quiet gap, repeating until discovered.
const BURST_MS = 3800;
const REST_MS = 7000;
const INITIAL_DELAY_MS = 1500;

// Once the user has opened the companion tab, never attract again.
const ATTENTION_SEEN_KEY = 'aurora_voice_attention_seen_v1';

function SonarRing({ index, playing }: { index: number; playing: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (playing) {
      progress.value = withDelay(
        (RING_CYCLE_MS / RING_COUNT) * index,
        withRepeat(
          withTiming(1, { duration: RING_CYCLE_MS, easing: Easing.out(Easing.ease) }),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(progress.value, [0, 1], [0.9, 2.1], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(progress.value, [0, 0.15, 1], [0, 0.35, 0], Extrapolation.CLAMP),
  }));

  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

export function AnimatedMicButton({ focused }: { focused: boolean }) {
  // Whether the attention feature is still enabled (not yet discovered).
  const [active, setActive] = useState(false);
  // Whether we're currently inside an attention burst.
  const [playing, setPlaying] = useState(false);

  // Idle breathing of the orb (scale + glow share this driver).
  const breathe = useSharedValue(0);
  // Quick bounce when the tab becomes active.
  const bounce = useSharedValue(1);

  // On mount, enable attention only if the user hasn't discovered it yet.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ATTENTION_SEEN_KEY)
      .then((seen) => {
        if (!cancelled && !seen) setActive(true);
      })
      .catch(() => {
        if (!cancelled) setActive(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The moment the user opens the companion tab, stop attracting — for good.
  useEffect(() => {
    if (focused) {
      setActive(false);
      setPlaying(false);
      AsyncStorage.setItem(ATTENTION_SEEN_KEY, '1').catch(() => {});
    }
  }, [focused]);

  // Burst scheduler: while active, alternate short bursts with quiet gaps.
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let on = false;
    const tick = () => {
      on = !on;
      setPlaying(on);
      timer = setTimeout(tick, on ? BURST_MS : REST_MS);
    };
    timer = setTimeout(tick, INITIAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);

  // Breathing runs only during a burst; otherwise the orb rests calm.
  useEffect(() => {
    if (playing) {
      breathe.value = withRepeat(
        withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(breathe);
      breathe.value = withTiming(0, { duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Quick confirming bounce when the tab becomes active.
  useEffect(() => {
    if (focused) {
      bounce.value = withSequence(
        withTiming(0.88, { duration: 110, easing: Easing.out(Easing.ease) }),
        withTiming(1.06, { duration: 160, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 140, easing: Easing.inOut(Easing.ease) }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  const orbStyle = useAnimatedStyle(() => {
    const breatheScale = interpolate(breathe.value, [0, 1], [1, 1.05]);
    return {
      transform: [{ scale: breatheScale * bounce.value }],
      shadowOpacity: interpolate(breathe.value, [0, 1], [0.4, 0.7]),
      shadowRadius: interpolate(breathe.value, [0, 1], [10, 18]),
    };
  });

  const glowStyle = useAnimatedStyle(() => ({
    // Halo only appears during a burst (breathe rests at 0 when idle).
    opacity: interpolate(breathe.value, [0, 1], [0, 0.5], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1.15, 1.4]) }],
  }));

  return (
    <View pointerEvents="none" style={styles.wrapper}>
      {Array.from({ length: RING_COUNT }).map((_, i) => (
        <SonarRing key={i} index={i} playing={playing} />
      ))}

      {/* Soft halo that brightens with the breathing cycle during a burst. */}
      <Animated.View style={[styles.glow, glowStyle]} />

      <Animated.View style={[styles.orb, orbStyle]}>
        <LinearGradient
          colors={['#4F7EF5', '#8B7CF0']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
        <Ionicons name="mic" size={26} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    top: -18,
    width: FAB,
    height: FAB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    borderWidth: 2,
    borderColor: '#6E8BF5',
  },
  glow: {
    position: 'absolute',
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: '#7C83F0',
  },
  orb: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F7EF5',
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});

export default AnimatedMicButton;
