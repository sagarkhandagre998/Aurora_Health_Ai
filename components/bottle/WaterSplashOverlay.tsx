/**
 * WaterSplashOverlay — a one-shot "spill" effect for the Hydration screen.
 *
 * When a water log is deleted we fling a handful of droplets across the screen
 * and float a "−250 ml removed" pill upward as it fades. Purely decorative,
 * driven entirely on the Reanimated UI thread, and self-dismissing.
 *
 * Usage: render once near the root of the screen and feed it a `splash` object
 * (new identity per delete). Pass `null` when idle.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export interface SplashEvent {
  /** Unique id so re-deleting the same amount still re-triggers. */
  id: string;
  amountMl: number;
  /** Origin of the spill in screen coords (e.g. the deleted row). */
  x: number;
  y: number;
  color: string;
}

const DROPS = 14;

function SpillDrop({
  index,
  originX,
  originY,
  color,
  onLast,
}: {
  index: number;
  originX: number;
  originY: number;
  color: string;
  onLast?: () => void;
}) {
  const t = useSharedValue(0);

  // Fan the droplets out in a downward arc, varied by index (deterministic).
  const angle = (Math.PI * (0.15 + 0.7 * (index / (DROPS - 1)))) + Math.PI * 0.15;
  const speed = 90 + (index % 5) * 46;
  const dx = Math.cos(angle) * speed * (index % 2 === 0 ? 1 : -1);
  const dy = -Math.sin(angle) * speed - 40; // initial upward kick
  const gravity = 320 + (index % 3) * 90;
  const size = 6 + (index % 4) * 2.5;

  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }, (finished) => {
      'worklet';
      if (finished && index === DROPS - 1 && onLast) runOnJS(onLast)();
    });
  }, [t, index, onLast]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    // Projectile motion: x linear, y with gravity.
    const px = dx * p;
    const py = dy * p + 0.5 * gravity * p * p;
    return {
      transform: [{ translateX: px }, { translateY: py }, { scale: 1 - 0.3 * p }],
      opacity: p < 0.1 ? p / 0.1 : 1 - Math.max(0, (p - 0.6) / 0.4),
    };
  });

  return (
    <Animated.View
      style={[
        styles.drop,
        { left: originX, top: originY, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

function FloatingLabel({ amountMl, originX, originY, color }: { amountMl: number; originX: number; originY: number; color: string }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      80,
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 250 }),
      ),
    );
  }, [t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      transform: [{ translateY: -70 * p }, { scale: 0.8 + 0.2 * Math.min(1, p * 3) }],
      opacity: p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.75) / 0.25),
    };
  });

  return (
    <Animated.View style={[styles.labelWrap, { left: originX - 80, top: originY }, style]}>
      <View style={[styles.labelPill, { backgroundColor: color }]}>
        <Text style={styles.labelText}>−{amountMl} ml removed</Text>
      </View>
    </Animated.View>
  );
}

export function WaterSplashOverlay({
  splash,
  onDone,
}: {
  splash: SplashEvent | null;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  if (!splash) return null;

  const ox = Math.max(0, Math.min(width, splash.x));
  const oy = Math.max(0, Math.min(height, splash.y));

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {Array.from({ length: DROPS }).map((_, i) => (
        <SpillDrop
          key={`${splash.id}-${i}`}
          index={i}
          originX={ox}
          originY={oy}
          color={splash.color}
          onLast={i === DROPS - 1 ? onDone : undefined}
        />
      ))}
      <FloatingLabel amountMl={splash.amountMl} originX={ox} originY={oy} color={splash.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { position: 'absolute' },
  labelWrap: { position: 'absolute', width: 160, alignItems: 'center' },
  labelPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  labelText: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },
});

export default WaterSplashOverlay;
