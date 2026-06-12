/**
 * WaterBottle — Animated water-fill indicator for Aurora.
 *
 * Implementation: react-native-svg + Reanimated 4
 *   • Bottle silhouette rendered as an SVG <ClipPath>
 *   • Wave path `d` string is computed per-frame inside a Reanimated UI-thread
 *     worklet via useAnimatedProps — no JS-thread bottleneck.
 *   • wavePhase loops 0 → 2π with withRepeat(withTiming) for the scrolling wave.
 *   • waterY tracks fill level and transitions with withSpring.
 *
 * Skia note: @shopify/react-native-skia 1.x + Reanimated 4 share the worklet
 * runtime but Skia.Path.Make() inside Reanimated worklets requires JSI globals
 * that may not be present in all environments. SVG is used here for maximum
 * reliability. Swap the internals for a Canvas implementation once Skia ↔
 * Reanimated 4 interop is stable in your build.
 */
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// Wrap SVG primitives so Reanimated can drive their props on the UI thread.
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Number of droplets that rain into the bottle on each pour.
const DROPLET_COUNT = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaterBottleProps {
  /** Water level: 0 (empty) → 1 (full). */
  fillPercent: number;
  width?: number;
  height?: number;
  /** Accent / water color. Defaults to Aurora hydration blue. */
  color?: string;
  /**
   * Increment this counter to trigger a one-shot "pour" animation:
   * droplets rain in from the neck, the surface splashes, and the fill
   * overshoots then settles. Typically `logs.length` or a dedicated ref.
   */
  pourTrigger?: number;
}

// A single falling droplet animated on the UI thread.
function Droplet({
  index,
  trigger,
  width,
  height,
  color,
}: {
  index: number;
  trigger: number;
  width: number;
  height: number;
  color: string;
}) {
  const progress = useSharedValue(0); // 0 (top of neck) → 1 (hits surface)
  const neckCenter = width / 2;
  // Spread droplets a little across the neck width.
  const spread = ((index - (DROPLET_COUNT - 1) / 2) / DROPLET_COUNT) * (width * 0.22);
  const startY = height * 0.02;
  const endY = height * 0.4;
  const r = 3.2 + (index % 2) * 1.1;

  useEffect(() => {
    if (trigger === 0) return;
    progress.value = 0;
    progress.value = withDelay(
      index * 55,
      withTiming(1, { duration: 360, easing: Easing.in(Easing.quad) }),
    );
  }, [trigger, index, progress]);

  const dropProps = useAnimatedProps(() => {
    'worklet';
    const p = progress.value;
    // Fade in at the start, vanish on "impact" near the bottom.
    const opacity = p <= 0 || p >= 1 ? 0 : p < 0.15 ? p / 0.15 : 1 - (p - 0.85) / 0.15;
    return {
      cx: neckCenter + spread,
      cy: startY + (endY - startY) * p,
      opacity: Math.max(0, Math.min(1, opacity)) * 0.9,
      r,
    };
  });

  return <AnimatedCircle animatedProps={dropProps} fill={color} />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WaterBottle({
  fillPercent,
  width = 160,
  height = 280,
  color = '#34C5FF',
  pourTrigger = 0,
}: WaterBottleProps) {
  // Stable, collision-safe SVG element IDs per instance.
  const uid = React.useId().replace(/:/g, '');
  const clipId = `wbc${uid}`;
  const gradId = `wbg${uid}`;

  // ── Animated values ──────────────────────────────────────────────────────
  const clampedFill = Math.max(0, Math.min(1, fillPercent));
  const wavePhase = useSharedValue(0);
  const waterY = useSharedValue(height * (1 - clampedFill));
  // Extra wave amplitude injected on a pour → big "splash", settling to calm.
  const splash = useSharedValue(0);

  // Perpetual wave phase: 0 → 2π, repeating forever.
  useEffect(() => {
    wavePhase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 2500, easing: Easing.linear }),
      -1,
      false,
    );
  }, [wavePhase]);

  // Smooth fill-level transition whenever the prop changes.
  useEffect(() => {
    const fill = Math.max(0, Math.min(1, fillPercent));
    waterY.value = withSpring(height * (1 - fill), { damping: 14, stiffness: 75 });
  }, [fillPercent, height, waterY]);

  // One-shot "pour" reaction: the surface splashes up then settles, and the
  // water level dips slightly (as droplets land) before springing back.
  useEffect(() => {
    if (pourTrigger === 0) return;
    splash.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 900, easing: Easing.out(Easing.cubic) }),
    );
    const fill = Math.max(0, Math.min(1, fillPercent));
    const target = height * (1 - fill);
    waterY.value = withSequence(
      // delay until the droplets reach the surface
      withDelay(180, withTiming(target + height * 0.04, { duration: 120 })),
      withSpring(target, { damping: 9, stiffness: 120 }),
    );
  }, [pourTrigger, fillPercent, height, splash, waterY]);

  // ── Static geometry (memoised per width/height) ──────────────────────────

  /**
   * Bottle silhouette path:
   *   Narrow neck (36% of width) at the top with rounded corners,
   *   angled shoulders tapering out to a wide rectangular body,
   *   rounded bottom corners.
   */
  const bottleD = useMemo(() => {
    const bp = width * 0.07; // horizontal body inset from edge
    const nw = width * 0.36; // neck width
    const nl = (width - nw) / 2; // neck left-edge x
    const nh = height * 0.14; // shoulder drop (neck → body transition)
    const nr = 10; // neck corner radius
    const br = 14; // body bottom corner radius

    return [
      // Top-left neck corner
      `M ${nl + nr} 0`,
      `Q ${nl} 0 ${nl} ${nr}`,
      // Left shoulder diagonal then left body wall
      `L ${bp} ${nh}`,
      `L ${bp} ${height - br}`,
      // Bottom-left corner
      `Q ${bp} ${height} ${bp + br} ${height}`,
      // Bottom edge
      `L ${width - bp - br} ${height}`,
      // Bottom-right corner
      `Q ${width - bp} ${height} ${width - bp} ${height - br}`,
      // Right body wall then right shoulder diagonal
      `L ${width - bp} ${nh}`,
      `L ${nl + nw} ${nr}`,
      // Top-right neck corner
      `Q ${nl + nw} 0 ${nl + nw - nr} 0`,
      // Top of neck closed by Z
      'Z',
    ].join(' ');
  }, [width, height]);

  /** Specular highlight — short diagonal stroke on the bottle's left face. */
  const highlightD = useMemo(() => {
    const bp = width * 0.07;
    const x = bp + 8;
    return `M ${x} ${height * 0.19} L ${x - 3} ${height * 0.57}`;
  }, [width, height]);

  // ── Animated wave path (runs on UI thread) ───────────────────────────────

  /**
   * Each frame: compute a sine-wave path that starts at `waterY` and sweeps
   * across the full width, then closes downward to fill the area below.
   * `wavePhase` shifts the phase so the wave appears to scroll left-to-right.
   */
  const waveAnimatedProps = useAnimatedProps(() => {
    'worklet';
    // Splash boosts the amplitude and adds a faster secondary ripple so the
    // surface visibly churns right after a pour, then eases back to calm.
    const s = splash.value;
    const AMPLITUDE = height * (0.022 + 0.07 * s); // wave height in px
    const FREQ = 2.2; // wave cycles across the width
    const wY = waterY.value;
    const phase = wavePhase.value;

    // Start point
    let d = `M 0 ${wY + Math.sin(phase) * AMPLITUDE}`;

    // Sample the sine curve every 3 px for smoothness vs. perf balance.
    for (let x = 1; x <= width; x += 3) {
      const ripple = Math.sin((x / width) * Math.PI * 2 * (FREQ + 3 * s) + phase * 1.7) * AMPLITUDE * s * 0.6;
      const y = wY + Math.sin((x / width) * Math.PI * 2 * FREQ + phase) * AMPLITUDE + ripple;
      d += ` L ${x} ${y}`;
    }

    // Close the filled area below the wave.
    d += ` L ${width} ${height + 20} L 0 ${height + 20} Z`;
    return { d };
  });

  const tintColor = `${color}2E`; // ~18 % opacity background tint for empty bottle

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          {/* Clip everything to the bottle silhouette */}
          <ClipPath id={clipId}>
            <Path d={bottleD} />
          </ClipPath>

          {/* Subtle horizontal gradient across the water fill */}
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity="0.80" />
            <Stop offset="0.5" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.84" />
          </LinearGradient>
        </Defs>

        {/* Empty-bottle tint (always visible) */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={tintColor}
          clipPath={`url(#${clipId})`}
        />

        {/* Animated wave fill — d prop driven by worklet */}
        <AnimatedPath
          d=""
          animatedProps={waveAnimatedProps}
          fill={`url(#${gradId})`}
          clipPath={`url(#${clipId})`}
        />

        {/* Falling droplets on each pour (fall within the bottle silhouette) */}
        {pourTrigger > 0 &&
          Array.from({ length: DROPLET_COUNT }).map((_, i) => (
            <Droplet
              key={i}
              index={i}
              trigger={pourTrigger}
              width={width}
              height={height}
              color={color}
            />
          ))}

        {/* Bottle outline drawn on top for glass clarity */}
        <Path d={bottleD} fill="none" stroke={color} strokeWidth={2.5} opacity={0.55} />

        {/* Specular highlight on the left face of the glass */}
        <Path
          d={highlightD}
          fill="none"
          stroke="white"
          strokeWidth={3.5}
          strokeLinecap="round"
          opacity={0.3}
        />
      </Svg>
    </View>
  );
}

export default WaterBottle;
