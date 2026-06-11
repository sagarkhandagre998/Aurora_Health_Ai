/**
 * WeeklyBar — 7-day bar chart powered by victory-native v41.
 *
 * IMPORTANT — victory-native v41 API note:
 *   v41 is a complete rewrite that does NOT export the classic VictoryChart /
 *   VictoryBar / VictoryAxis API. Those names existed in v36-v40. The correct
 *   v41 API uses CartesianChart + Bar, which render via @shopify/react-native-skia.
 *
 * Axis labels in v41 require a loaded SkFont. To avoid that complexity the
 * x-axis day labels are rendered as a plain React Native View/Text row below
 * the chart canvas — they align visually via space-around flex layout.
 */
import { format, parseISO } from 'date-fns';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bar, CartesianChart } from 'victory-native';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyBarProps {
  /** Up to 7 data points. Each entry must have an ISO-8601 date string. */
  data: Array<{ date: string; value: number }>;
  /** Bar fill colour. Defaults to Aurora tint. */
  color?: string;
  /** Unit label shown top-right (e.g. "ml", "hrs"). Optional. */
  unit?: string;
  /** Total component height in px. Default 200. */
  height?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyBar({ data, color = '#4F7EF5', unit, height = 200 }: WeeklyBarProps) {
  /**
   * Map data to numeric indices so victory-native can scale the x-axis cleanly.
   * Real date strings as x values cause uneven spacing when days are missing.
   */
  const chartData = useMemo(
    () => data.map((d, i) => ({ idx: i, val: Math.max(0, d.value) })),
    [data],
  );

  const dayLabels = useMemo(
    () =>
      data.map((d) => {
        try {
          return format(parseISO(d.date), 'EEE');
        } catch {
          return '—';
        }
      }),
    [data],
  );

  // ── Edge cases ──────────────────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No data this week</Text>
      </View>
    );
  }

  // ── Layout heights ───────────────────────────────────────────────────────
  const LABEL_ROW_H = 22; // px reserved for the custom day-label row
  const UNIT_ROW_H = unit ? 18 : 0;
  const chartHeight = height - LABEL_ROW_H - UNIT_ROW_H;

  return (
    <View style={{ height }}>
      {/* Optional unit annotation — top-right */}
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}

      {/* Chart canvas — victory-native v41 CartesianChart */}
      <View style={{ height: chartHeight }}>
        <CartesianChart
          data={chartData}
          xKey="idx"
          yKeys={['val']}
          /*
           * domainPadding is in data-space units for v41.
           * With x values 0–6, left/right=0.5 adds half a "bar slot" of
           * padding on each side so the first and last bars aren't clipped.
           */
          domainPadding={{ left: 0.5, right: 0.5, top: 12 }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.val}
              chartBounds={chartBounds}
              color={color}
              roundedCorners={{ topLeft: 5, topRight: 5 }}
              innerPadding={0.3}
              animate={{ type: 'timing', duration: 400 }}
            />
          )}
        </CartesianChart>
      </View>

      {/* Custom x-axis day labels aligned to bars via space-around */}
      <View style={styles.labelRow}>
        {dayLabels.map((label: string, i: number) => (
          <Text key={i} style={styles.dayLabel}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  dayLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
    flex: 1,
  },
  unit: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'right',
    paddingRight: 6,
    marginBottom: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
