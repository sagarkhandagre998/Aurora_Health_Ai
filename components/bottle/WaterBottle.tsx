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
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

// Wrap SVG Path so Reanimated can drive its `d` prop on the UI thread.
const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaterBottleProps {
  /** Water level: 0 (empty) → 1 (full). */
  fillPercent: number;
  width?: number;
  height?: number;
  /** Accent / water color. Defaults to Aurora hydration blue. */
  color?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WaterBottle({
  fillPercent,
  width = 160,
  height = 280,
  color = '#34C5FF',
}: WaterBottleProps) {
  // Stable, collision-safe SVG element IDs per instance.
  const uid = React.useId().replace(/:/g, '');
  const clipId = `wbc${uid}`;
  const gradId = `wbg${uid}`;

  // ── Animated values ──────────────────────────────────────────────────────
  const clampedFill = Math.max(0, Math.min(1, fillPercent));
  const wavePhase = useSharedValue(0);
  const waterY = useSharedValue(height * (1 - clampedFill));

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
    const AMPLITUDE = height * 0.022; // wave height in px
    const FREQ = 2.2; // wave cycles across the width
    const wY = waterY.value;
    const phase = wavePhase.value;

    // Start point
    let d = `M 0 ${wY + Math.sin(phase) * AMPLITUDE}`;

    // Sample the sine curve every 3 px for smoothness vs. perf balance.
    for (let x = 1; x <= width; x += 3) {
      const y = wY + Math.sin((x / width) * Math.PI * 2 * FREQ + phase) * AMPLITUDE;
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
