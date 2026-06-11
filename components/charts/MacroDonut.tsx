/**
 * MacroDonut — Protein / carbs / fat breakdown donut chart.
 *
 * Implementation: react-native-svg custom arc paths.
 *   Segments are sized by caloric contribution (protein 4 kcal/g,
 *   carbs 4 kcal/g, fat 9 kcal/g) so the ring reflects energy share,
 *   not just gram weight.
 *
 *   strokeLinecap="butt" is intentional — round caps bleed into adjacent
 *   segments unless the gap is many times the stroke-width. Butt caps with
 *   a 3° gap give a clean Apple-style separation.
 *
 * VictoryPie note: victory-native v41 does not ship a Pie chart component.
 * This custom SVG implementation is therefore the correct approach for v41.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MacroDonutProps {
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  /** Outer diameter of the donut in px. Default 160. */
  size?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MACRO_CONFIG = [
  { key: 'protein' as const, label: 'Protein', color: '#4F7EF5', calPerG: 4 },
  { key: 'carbs' as const, label: 'Carbs', color: '#34C5FF', calPerG: 4 },
  { key: 'fat' as const, label: 'Fat', color: '#F5A623', calPerG: 9 },
];

/** Minimum arc sweep before we skip rendering the segment (avoids slivers). */
const MIN_SWEEP_DEG = 5;

/** Gap between adjacent segments in degrees. */
const GAP_DEG = 3;

/** Internal type for a computed arc segment. */
type Segment = {
  key: string;
  label: string;
  color: string;
  grams: number;
  start: number;
  end: number;
};

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180); // 0° = 12 o'clock
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * SVG arc path for a stroke-drawn arc segment (no fill).
 * Returns an empty string when sweep is zero or negative.
 */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const sweep = Math.min(endDeg - startDeg, 359.9);
  if (sweep <= 0) return '';
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, startDeg + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  // Arc drawn clockwise (sweep-flag = 1).
  return `M ${s.x.toFixed(3)} ${s.y.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${e.x.toFixed(3)} ${e.y.toFixed(3)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MacroDonut({ protein, carbs, fat, size = 160 }: MacroDonutProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38; // arc radius
  const sw = size * 0.12; // stroke width (ring thickness)

  const gramValues: Record<string, number> = { protein, carbs, fat };

  const { totalCal, segments } = useMemo(() => {
    const totalCal = MACRO_CONFIG.reduce((sum, m) => sum + gramValues[m.key] * m.calPerG, 0);

    if (totalCal === 0) return { totalCal: 0, segments: [] as Segment[] };

    let angle = 0;

    const segments: Segment[] = [];

    for (const m of MACRO_CONFIG) {
      const grams = gramValues[m.key];
      const sweep = ((grams * m.calPerG) / totalCal) * 360;

      if (sweep < MIN_SWEEP_DEG) {
        angle += sweep;
        continue;
      }

      const halfGap = GAP_DEG / 2;
      segments.push({
        key: m.key,
        label: m.label,
        color: m.color,
        grams,
        start: angle + halfGap,
        end: angle + sweep - halfGap,
      });
      angle += sweep;
    }

    return { totalCal, segments };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protein, carbs, fat]);

  return (
    <View style={styles.container}>
      {/* ── Donut SVG ─────────────────────────────────────────────────── */}
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          {/* Background track — shows the "empty" portion */}
          <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8ECFF" strokeWidth={sw} />

          {/* One arc path per macro */}
          {segments.map((seg) => (
            <Path
              key={seg.key}
              d={arcPath(cx, cy, r, seg.start, seg.end)}
              fill="none"
              stroke={seg.color}
              strokeWidth={sw}
              strokeLinecap="butt"
            />
          ))}
        </Svg>

        {/* Center: total calories */}
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Text style={styles.calValue}>{Math.round(totalCal)}</Text>
          <Text style={styles.calUnit}>kcal</Text>
        </View>
      </View>

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <View style={styles.legend}>
        {MACRO_CONFIG.map((m) => {
          const grams = gramValues[m.key] ?? 0;
          return (
            <View key={m.key} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              <View>
                <Text style={styles.legendLabel}>{m.label}</Text>
                <Text style={styles.legendGrams}>{grams}g</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  calValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E2235',
    letterSpacing: -0.5,
  },
  calUnit: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  legendGrams: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E2235',
  },
});
