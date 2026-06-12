/**
 * DayBars — selectable 7-day (or N-day) bar chart.
 *
 * Plain React Native Views (no Skia/victory) so it stays dependency-light and
 * matches the inline charts that previously lived in the hydration/sleep
 * screens. When `onSelect` is provided each bar becomes tappable and the
 * selected day is highlighted; otherwise it renders as a static chart (used by
 * the weekly report cards).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { format, parseISO } from 'date-fns';

export interface DayBarsDatum {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  value: number;
}

export interface DayBarsProps {
  data: DayBarsDatum[];
  color: string;
  /** Currently selected ISO date — highlights its bar. */
  selectedDate?: string;
  /** When provided, bars become tappable. */
  onSelect?: (date: string) => void;
  /** Formats the small value label shown above a bar. Hidden when it returns ''. */
  formatValue?: (value: number) => string;
  /** Total chart height (bars + labels). Default 124. */
  height?: number;
  /** Secondary text colour for labels. */
  labelColor?: string;
}

function dayLabel(date: string): string {
  try {
    return format(parseISO(date), 'EEE')[0];
  } catch {
    return '—';
  }
}

export function DayBars({
  data,
  color,
  selectedDate,
  onSelect,
  formatValue,
  height = 124,
  labelColor = '#9CA3AF',
}: DayBarsProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barAreaH = height - 28; // reserve room for the day label row

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
      {data.map((d) => {
        const isSelected = selectedDate === d.date;
        const dimmed = selectedDate != null && !isSelected;
        const h = Math.max((d.value / max) * (barAreaH - 18), d.value > 0 ? 4 : 0);
        const valueLabel = formatValue ? formatValue(d.value) : '';

        const Wrapper: React.ElementType = onSelect ? TouchableOpacity : View;
        const wrapperProps = onSelect
          ? { onPress: () => onSelect(d.date), activeOpacity: 0.7 }
          : {};

        return (
          <Wrapper key={d.date} style={styles.col} {...wrapperProps}>
            <View style={styles.barArea}>
              {d.value > 0 && valueLabel !== '' && (
                <Text
                  style={[styles.valueLabel, { color: isSelected ? color : labelColor }]}
                  numberOfLines={1}
                >
                  {valueLabel}
                </Text>
              )}
              <View
                style={{
                  width: '78%',
                  height: h,
                  backgroundColor: color,
                  borderRadius: 5,
                  opacity: dimmed ? 0.35 : 0.92,
                }}
              />
            </View>
            <Text
              style={[
                styles.dayLabel,
                {
                  color: isSelected ? color : labelColor,
                  fontWeight: isSelected ? '800' : '600',
                },
              ]}
            >
              {dayLabel(d.date)}
            </Text>
            <View style={[styles.dot, { backgroundColor: isSelected ? color : 'transparent' }]} />
          </Wrapper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barArea: { width: '100%', alignItems: 'center', justifyContent: 'flex-end', flex: 1 },
  valueLabel: { fontSize: 8, marginBottom: 2, fontWeight: '700' },
  dayLabel: { fontSize: 10, marginTop: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
});

// ── DayPills ────────────────────────────────────────────────────────────────

export interface DayPillsProps {
  /** ISO dates oldest → newest. */
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
  color: string;
  /** Card/track colours from the active theme. */
  cardColor: string;
  borderColor: string;
  textColor: string;
  textSecondary: string;
}

/** Horizontal row of selectable day pills (weekday initial + date number). */
export function DayPills({
  dates,
  selectedDate,
  onSelect,
  color,
  cardColor,
  borderColor,
  textColor,
  textSecondary,
}: DayPillsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={pillStyles.row}
    >
      {dates.map((date) => {
        const selected = date === selectedDate;
        let weekday = '—';
        let dayNum = '';
        try {
          weekday = format(parseISO(date), 'EEE');
          dayNum = format(parseISO(date), 'd');
        } catch {
          /* keep fallback */
        }
        return (
          <TouchableOpacity
            key={date}
            onPress={() => onSelect(date)}
            activeOpacity={0.8}
            style={[
              pillStyles.pill,
              {
                backgroundColor: selected ? color : cardColor,
                borderColor: selected ? color : borderColor,
              },
            ]}
          >
            <Text style={[pillStyles.weekday, { color: selected ? '#fff' : textSecondary }]}>
              {weekday}
            </Text>
            <Text style={[pillStyles.dayNum, { color: selected ? '#fff' : textColor }]}>
              {dayNum}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const pillStyles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 2 },
  pill: {
    width: 46,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 2,
  },
  weekday: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  dayNum: { fontSize: 16, fontWeight: '800' },
});

export default DayBars;
