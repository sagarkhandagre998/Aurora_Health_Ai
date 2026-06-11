/**
 * ProgressRing — Apple activity-ring style circular progress indicator.
 *
 * Implementation: react-native-svg + Reanimated 4
 *   • Background track: full-circle <Circle> at reduced opacity.
 *   • Progress arc: <AnimatedCircle> with animated strokeDashoffset.
 *   • strokeDasharray = circumference; dashoffset = circumference*(1-progress)
 *     so the arc fills clockwise from the top (rotated −90°).
 *   • withSpring drives smooth entry and prop-change transitions.
 *   • Center label rendered as an absolute-positioned React Native <Text>
 *     overlay — no Skia font loading required.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressRingProps {
  /** 0 → 1. Values outside range are clamped. */
  progress: number;
  /** Outer diameter of the ring in px. Default 80. */
  size?: number;
  /** Ring stroke thickness. Default 10. */
  strokeWidth?: number;
  /** Progress arc colour. Defaults to Aurora tint blue. */
  color?: string;
  /** Background track colour. */
  backgroundColor?: string;
  /** Primary center text (e.g. "75%"). */
  label?: string;
  /** Secondary center text shown below label (e.g. "steps"). */
  sublabel?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressRing({
  progress,
  size = 80,
  strokeWidth = 10,
  color = '#4F7EF5',
  backgroundColor = '#E8ECFF',
  label,
  sublabel,
}: ProgressRingProps) {
  const uid = React.useId().replace(/:/g, '');
  const gradId = `prg${uid}`;

  const animProgress = useSharedValue(0);

  // Animate on mount and whenever the progress prop changes.
  useEffect(() => {
    animProgress.value = withSpring(Math.max(0, Math.min(1, progress)), {
      damping: 15,
      stiffness: 80,
    });
  }, [progress, animProgress]);

  // Geometry
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Drive strokeDashoffset on the UI thread.
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animProgress.value),
  }));

  const hasLabel = label !== undefined || sublabel !== undefined;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          {/* Diagonal gradient gives the ring a premium "glow" look */}
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.6" />
          </LinearGradient>
        </Defs>

        {/* Background track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/*
         * Progress arc — wrapped in a <G> that rotates the entire arc so it
         * starts at 12 o'clock. The default SVG circle starts at 3 o'clock.
         */}
        <G transform={`rotate(-90, ${cx}, ${cy})`}>
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center text overlay — absolutely positioned over the SVG */}
      {hasLabel && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.labelWrap}>
            {label !== undefined && (
              <Text
                style={[styles.labelText, { fontSize: size * 0.21, color: '#1E2235' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {label}
              </Text>
            )}
            {sublabel !== undefined && (
              <Text
                style={[styles.sublabelText, { fontSize: size * 0.135, color: '#6B7280' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {sublabel}
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labelWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  labelText: {
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sublabelText: {
    fontWeight: '500',
    marginTop: 1,
    textAlign: 'center',
  },
});

export default ProgressRing;
