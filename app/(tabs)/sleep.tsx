import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { RootState, AppDispatch } from '@/store';
import { setLogs, upsertLog } from '@/store/slices/sleepSlice';
import { SleepLog } from '@/types';

interface ChartBar { label: string; value: number }

function SleepChart({ data, color }: { data: ChartBar[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 6 }}>
      {data.map((d, i) => {
        const h = Math.max((d.value / max) * 74, d.value > 0 ? 4 : 0);
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            {d.value > 0 && (
              <Text style={{ fontSize: 8, color: '#9CA3AF', marginBottom: 2 }}>
                {(d.value / 60).toFixed(1)}h
              </Text>
            )}
            <View style={{ width: '80%', height: h, backgroundColor: color, borderRadius: 5, opacity: 0.82 }} />
            <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4, fontWeight: '600' }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

function QualityPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <TouchableOpacity key={s} onPress={() => onChange(s)}>
          <Text style={{ fontSize: 28 }}>{s <= value ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SleepScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const { logs, lastNight } = useSelector((s: RootState) => s.sleep);
  const [refreshing, setRefreshing] = useState(false);
  const [weeklyData, setWeeklyData] = useState<ChartBar[]>([]);

  // Log sheet
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['62%', '88%'], []);
  const [bedtime, setBedtime] = useState(() => {
    const d = new Date(); d.setHours(23, 0, 0, 0); return d;
  });
  const [wakeTime, setWakeTime] = useState(() => {
    const d = new Date(); d.setHours(7, 0, 0, 0); return d;
  });
  const [quality, setQuality] = useState(3);
  const [showBedPicker, setShowBedPicker] = useState(false);
  const [showWakePicker, setShowWakePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const durationMin = useMemo(() => {
    let diff = wakeTime.getTime() - bedtime.getTime();
    if (diff < 0) diff += 24 * 60 * 60 * 1000;
    return Math.round(diff / 60000);
  }, [bedtime, wakeTime]);

  const buildWeekly = useCallback((all: SleepLog[]) => {
    const data: ChartBar[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = d.toISOString().split('T')[0];
      const log = all.find((l) => l.date === key);
      data.push({ label: format(d, 'EEE')[0], value: log?.durationMin ?? 0 });
    }
    setWeeklyData(data);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('sleep_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(14);
    if (data) {
      const mapped: SleepLog[] = data.map((r) => ({
        id: r.id, date: r.date, durationMin: r.duration_min,
        quality: r.quality ?? undefined, sleepStart: r.sleep_start ?? undefined, sleepEnd: r.sleep_end ?? undefined,
      }));
      dispatch(setLogs(mapped));
      buildWeekly(mapped);
    }
  }, [user?.id, dispatch, buildWeekly]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    if (durationMin < 30 || durationMin > 1440) {
      showToast('Duration must be between 30 min and 24 hours', 'error');
      return;
    }
    setSaving(true);
    const date = (wakeTime.getHours() < 12 ? wakeTime : bedtime).toISOString().split('T')[0];
    const newLog: SleepLog = {
      id: `tmp-${Date.now()}`, date, durationMin,
      quality, sleepStart: bedtime.toISOString(), sleepEnd: wakeTime.toISOString(),
    };
    dispatch(upsertLog(newLog));
    try {
      const { data, error } = await supabase
        .from('sleep_logs')
        .upsert({
          user_id: user.id, date, duration_min: durationMin, quality,
          sleep_start: bedtime.toISOString(), sleep_end: wakeTime.toISOString(),
        }, { onConflict: 'user_id,date' })
        .select().single();
      if (error) throw error;
      dispatch(upsertLog({
        id: data.id, date: data.date, durationMin: data.duration_min,
        quality: data.quality ?? undefined, sleepStart: data.sleep_start, sleepEnd: data.sleep_end,
      }));
      showToast('Sleep logged 😴', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sheetRef.current?.close();
      await fetchLogs();
    } catch {
      showToast('Could not save sleep log', 'error');
    } finally {
      setSaving(false);
    }
  }, [user?.id, durationMin, wakeTime, bedtime, quality, dispatch, showToast, fetchLogs]);

  const avgDuration = logs.length > 0
    ? logs.slice(0, 7).reduce((s, l) => s + l.durationMin, 0) / Math.min(logs.length, 7)
    : 0;

  const sleepHrs = lastNight ? (lastNight.durationMin / 60).toFixed(1) : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Sleep</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{format(new Date(), 'EEEE, MMM d')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: theme.sleep }]}
            onPress={() => sheetRef.current?.snapToIndex(0)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.logBtnText}>Log Sleep</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Last Night Card */}
        <Animated.View entering={FadeInDown.delay(60).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#1A1535', '#201848'] : ['#F0EEFF', '#EAE4FF']}
            style={[styles.heroCard]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <Text style={[styles.heroLabel, { color: theme.sleep }]}>Last Night</Text>
            {sleepHrs ? (
              <>
                <Text style={[styles.heroValue, { color: theme.text }]}>{sleepHrs}<Text style={[styles.heroUnit, { color: theme.textSecondary }]}> hrs</Text></Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons key={s} name={s <= (lastNight?.quality ?? 0) ? 'star' : 'star-outline'} size={18} color={s <= (lastNight?.quality ?? 0) ? theme.sleep : theme.border} />
                  ))}
                </View>
                <Text style={[styles.sleepRange, { color: theme.textSecondary }]}>
                  {lastNight?.sleepStart ? format(new Date(lastNight.sleepStart), 'h:mm a') : '—'} → {lastNight?.sleepEnd ? format(new Date(lastNight.sleepEnd), 'h:mm a') : '—'}
                </Text>
              </>
            ) : (
              <Text style={[styles.emptyHero, { color: theme.textSecondary }]}>No sleep logged yet. Tap "Log Sleep" to add last night's sleep.</Text>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Stats Row */}
        <Animated.View entering={FadeInDown.delay(120).springify()} style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{avgDuration > 0 ? (avgDuration / 60).toFixed(1) : '—'}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Avg hrs (7d)</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.statValue, { color: theme.text }]}>{logs.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Nights logged</Text>
          </View>
        </Animated.View>

        {/* Weekly Chart */}
        {weeklyData.length > 0 && (
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Last 7 Nights</Text>
              <SleepChart data={weeklyData} color={theme.sleep} />
            </View>
          </Animated.View>
        )}

        {/* History */}
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Logs</Text>
          {logs.slice(0, 7).length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No sleep logs yet. Start tracking your sleep!</Text>
            </View>
          ) : (
            logs.slice(0, 7).map((log) => (
              <View key={log.id} style={[styles.logRow, { backgroundColor: theme.card }]}>
                <View style={[styles.logIcon, { backgroundColor: theme.sleep + '18' }]}>
                  <Ionicons name="moon" size={16} color={theme.sleep} />
                </View>
                <View style={styles.logInfo}>
                  <Text style={[styles.logDate, { color: theme.text }]}>{format(new Date(log.date), 'EEE, MMM d')}</Text>
                  <Text style={[styles.logDur, { color: theme.textSecondary }]}>{(log.durationMin / 60).toFixed(1)} hrs</Text>
                </View>
                {log.quality ? (
                  <View style={styles.miniStars}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons key={s} name={s <= log.quality! ? 'star' : 'star-outline'} size={11} color={s <= log.quality! ? theme.sleep : theme.border} />
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Animated.View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Log Sleep Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetScrollView contentContainerStyle={[styles.sheetContent, { backgroundColor: theme.card }]}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Log Sleep</Text>

          {/* Bedtime */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Bedtime</Text>
          <TouchableOpacity
            style={[styles.timeBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => setShowBedPicker(true)}
          >
            <Ionicons name="moon-outline" size={18} color={theme.sleep} />
            <Text style={[styles.timeBtnText, { color: theme.text }]}>{format(bedtime, 'h:mm a')}</Text>
          </TouchableOpacity>
          {(showBedPicker || Platform.OS === 'ios') && (
            <DateTimePicker
              value={bedtime}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant={theme.isDark ? 'dark' : 'light'}
              onChange={(_, d) => {
                setShowBedPicker(false);
                if (d) setBedtime(d);
              }}
            />
          )}

          {/* Wake time */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Wake Time</Text>
          <TouchableOpacity
            style={[styles.timeBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
            onPress={() => setShowWakePicker(true)}
          >
            <Ionicons name="sunny-outline" size={18} color={theme.nutrition} />
            <Text style={[styles.timeBtnText, { color: theme.text }]}>{format(wakeTime, 'h:mm a')}</Text>
          </TouchableOpacity>
          {(showWakePicker || Platform.OS === 'ios') && (
            <DateTimePicker
              value={wakeTime}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant={theme.isDark ? 'dark' : 'light'}
              onChange={(_, d) => {
                setShowWakePicker(false);
                if (d) setWakeTime(d);
              }}
            />
          )}

          {/* Duration display */}
          <View style={[styles.durationBadge, { backgroundColor: theme.sleep + '18' }]}>
            <Text style={[styles.durationText, { color: theme.sleep }]}>
              {durationMin >= 60
                ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
                : `${durationMin} min`}
            </Text>
          </View>

          {/* Quality */}
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Sleep Quality</Text>
          <QualityPicker value={quality} onChange={setQuality} />

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.sleep, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Sleep'}</Text>
          </TouchableOpacity>
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: '500' },
  logBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  logBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  heroCard: { borderRadius: 22, padding: 22, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  heroLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  heroValue: { fontSize: 44, fontWeight: '800', letterSpacing: -1, marginBottom: 8 },
  heroUnit: { fontSize: 18, fontWeight: '500' },
  starsRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  sleepRange: { fontSize: 13, fontWeight: '500' },
  emptyHero: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 3, textAlign: 'center' },
  card: { borderRadius: 18, padding: 18, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  emptyCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  logRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  logIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  logInfo: { flex: 1 },
  logDate: { fontSize: 15, fontWeight: '700' },
  logDur: { fontSize: 12, marginTop: 1, fontWeight: '500' },
  miniStars: { flexDirection: 'row', gap: 2 },
  sheetContent: { padding: 24, gap: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 1.5 },
  timeBtnText: { fontSize: 17, fontWeight: '600' },
  durationBadge: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  durationText: { fontSize: 16, fontWeight: '700' },
  saveBtn: { borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
