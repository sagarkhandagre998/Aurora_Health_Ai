import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import BottomSheet, { BottomSheetView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Confetti } from 'react-native-fast-confetti';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { pushWaterToHealthKit } from '@/lib/healthSync';
import { playWaterFill, playWaterDrop } from '@/lib/waterSound';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { WaterBottle } from '@/components/bottle/WaterBottle';
import { WaterSplashOverlay, SplashEvent } from '@/components/bottle/WaterSplashOverlay';
import { DayBars, DayPills } from '@/components/charts/DayBars';
import { formatDate } from '@/utils/date';
import { RootState, AppDispatch } from '@/store';
import { addLog, removeLog, setLogs, setDailyGoal } from '@/store/slices/hydrationSlice';
import { WaterLog } from '@/types';

interface ChartBar {
  date: string;
  value: number;
}

const QUICK_ADD = [
  { label: '+250 ml', amount: 250, icon: 'water-outline' as const },
  { label: '+350 ml', amount: 350, icon: 'water-outline' as const },
  { label: '+500 ml', amount: 500, icon: 'water' as const },
  { label: '+750 ml', amount: 750, icon: 'water' as const },
];

export default function HydrationScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const { logs, todayTotalMl, dailyGoalMl } = useSelector((s: RootState) => s.hydration);
  const hkConnected = useSelector((s: RootState) => s.activity.hkConnected);
  const waterSyncEnabled = useSelector((s: RootState) => s.activity.enabledMetrics.water);
  const today = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(today);
  const selectedLogs = useMemo(
    () => logs.filter((l) => l.loggedAt.startsWith(selectedDate)).slice(0, 30),
    [logs, selectedDate],
  );
  const selectedTotal = useMemo(
    () => selectedLogs.reduce((s, l) => s + l.amountMl, 0),
    [selectedLogs],
  );

  const [refreshing, setRefreshing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [goalModal, setGoalModal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(dailyGoalMl));
  const [weeklyData, setWeeklyData] = useState<ChartBar[]>([]);

  const customSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['32%'], []);
  const [customAmt, setCustomAmt] = useState('');

  // Bumped on every successful add → drives the WaterBottle pour animation.
  const [pourTrigger, setPourTrigger] = useState(0);
  // Active delete "spill" effect (droplets + floating "−X ml removed" label).
  const [splash, setSplash] = useState<SplashEvent | null>(null);

  const fillPercent = dailyGoalMl > 0 ? Math.min(1, todayTotalMl / dailyGoalMl) : 0;
  const prevReached = useRef(false);

  // Confetti on goal reached
  useEffect(() => {
    if (fillPercent >= 1 && !prevReached.current) {
      setShowConfetti(true);
      showToast('🎉 Daily goal reached! Amazing!', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setShowConfetti(false), 4500);
    }
    prevReached.current = fillPercent >= 1;
  }, [fillPercent, showToast]);

  const buildWeekly = useCallback((allLogs: WaterLog[]) => {
    const data: ChartBar[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = d.toISOString().split('T')[0];
      const total = allLogs
        .filter((l) => l.loggedAt.startsWith(key))
        .reduce((s, l) => s + l.amountMl, 0);
      data.push({ date: key, value: total });
    }
    setWeeklyData(data);
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!user?.id) return;
    const since = subDays(new Date(), 6).toISOString().split('T')[0];
    const { data } = await supabase
      .from('water_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('logged_at', `${since}T00:00:00`)
      .order('logged_at', { ascending: false });
    if (data) {
      const mapped: WaterLog[] = data.map((r) => ({
        id: r.id,
        amountMl: r.amount_ml,
        loggedAt: r.logged_at,
      }));
      dispatch(setLogs(mapped));
      buildWeekly(mapped);
    }
  }, [user?.id, dispatch, buildWeekly]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  }, [fetchLogs]);

  const handleAdd = useCallback(
    async (amountMl: number) => {
      if (!user?.id || amountMl <= 0) return;
      const newLog: WaterLog = {
        id: `tmp-${Date.now()}`,
        amountMl,
        loggedAt: new Date().toISOString(),
      };
      // Optimistic
      dispatch(addLog(newLog));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Creative feedback: droplets rain into the bottle + a water "pour" sound.
      setPourTrigger((n) => n + 1);
      playWaterFill();
      showToast(`+${amountMl} ml logged 💧`, 'success');
      try {
        const { data, error } = await supabase
          .from('water_logs')
          .insert({ user_id: user.id, amount_ml: amountMl, logged_at: newLog.loggedAt })
          .select()
          .single();
        if (error) throw error;
        // Replace tmp log with real one
        dispatch(removeLog(newLog.id));
        dispatch(addLog({ id: data.id, amountMl: data.amount_ml, loggedAt: data.logged_at }));
        buildWeekly([...logs, { id: data.id, amountMl: data.amount_ml, loggedAt: data.logged_at }]);
        // Mirror to Apple Health when connected (tags row with HK UUID for dedupe)
        if (hkConnected && waterSyncEnabled) {
          pushWaterToHealthKit(data.id, data.amount_ml, data.logged_at).catch(() => {});
        }
      } catch {
        dispatch(removeLog(newLog.id));
        showToast('Could not save water log', 'error');
      }
    },
    [user?.id, dispatch, showToast, buildWeekly, logs, hkConnected, waterSyncEnabled],
  );

  const handleDelete = useCallback(
    async (id: string, amountMl: number, origin: { x: number; y: number }) => {
      // Creative feedback: water spills across the screen + a floating
      // "−X ml removed" label drifts up, with a descending water "drop" sound.
      setSplash({
        id: `${id}-${pourTrigger}`,
        amountMl,
        x: origin.x,
        y: origin.y,
        color: theme.hydration,
      });
      playWaterDrop();
      dispatch(removeLog(id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await supabase.from('water_logs').delete().eq('id', id);
      } catch {
        showToast('Could not remove log', 'error');
      }
    },
    [dispatch, showToast, theme.hydration, pourTrigger],
  );

  const handleCustomAdd = useCallback(() => {
    const n = parseInt(customAmt, 10);
    if (!n || n < 10 || n > 5000) {
      showToast('Enter a valid amount (10–5000 ml)', 'error');
      return;
    }
    handleAdd(n);
    setCustomAmt('');
    customSheetRef.current?.close();
  }, [customAmt, handleAdd, showToast]);

  const handleGoalSave = useCallback(() => {
    const n = parseInt(goalInput, 10);
    if (!n || n < 500 || n > 8000) {
      showToast('Goal must be between 500–8000 ml', 'error');
      return;
    }
    dispatch(setDailyGoal(n));
    setGoalModal(false);
    showToast('Daily goal updated', 'success');
  }, [goalInput, dispatch, showToast]);

  const remaining = Math.max(0, dailyGoalMl - todayTotalMl);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      {showConfetti && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Confetti />
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />
        }
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).springify()} style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Hydration</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {format(new Date(), 'EEEE, MMM d')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setGoalInput(String(dailyGoalMl));
              setGoalModal(true);
            }}
          >
            <View style={[styles.goalBadge, { backgroundColor: theme.hydration + '18' }]}>
              <Ionicons name="flag" size={13} color={theme.hydration} />
              <Text style={[styles.goalBadgeText, { color: theme.hydration }]}>
                {(dailyGoalMl / 1000).toFixed(1)}L goal
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Bottle + Progress */}
        <Animated.View entering={FadeInDown.delay(60).springify()} style={styles.bottleSection}>
          <WaterBottle
            fillPercent={fillPercent}
            width={130}
            height={230}
            color={theme.hydration}
            pourTrigger={pourTrigger}
          />
          <View style={styles.statsCol}>
            <Text style={[styles.mlValue, { color: theme.text }]}>
              {todayTotalMl.toLocaleString()}
            </Text>
            <Text style={[styles.mlLabel, { color: theme.textSecondary }]}>ml today</Text>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Text style={[styles.remainLabel, { color: theme.hydration }]}>
              {remaining > 0 ? `${remaining} ml left` : '✓ Goal reached!'}
            </Text>
            <Text style={[styles.pctText, { color: theme.textSecondary }]}>
              {Math.round(fillPercent * 100)}% of goal
            </Text>
          </View>
        </Animated.View>

        {/* Quick Add Buttons */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Add</Text>
          <View style={styles.quickRow}>
            {QUICK_ADD.map((q) => (
              <TouchableOpacity
                key={q.amount}
                style={[
                  styles.quickBtn,
                  { backgroundColor: theme.hydration + '18', borderColor: theme.hydration + '40' },
                ]}
                onPress={() => handleAdd(q.amount)}
                activeOpacity={0.75}
              >
                <Ionicons name={q.icon} size={18} color={theme.hydration} />
                <Text style={[styles.quickBtnText, { color: theme.hydration }]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.quickBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
              onPress={() => customSheetRef.current?.snapToIndex(0)}
              activeOpacity={0.75}
            >
              <Ionicons name="add-circle-outline" size={18} color={theme.tint} />
              <Text style={[styles.quickBtnText, { color: theme.tint }]}>Custom</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Weekly Chart — tap a day to view its log */}
        {weeklyData.length > 0 && (
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Last 7 Days</Text>
              <DayBars
                data={weeklyData}
                color={theme.hydration}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                formatValue={(v) => (v > 0 ? `${(v / 1000).toFixed(1)}L` : '')}
                labelColor={theme.textSecondary}
              />
              <View style={{ height: 14 }} />
              <DayPills
                dates={weeklyData.map((d) => d.date)}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                color={theme.hydration}
                cardColor={theme.background}
                borderColor={theme.border}
                textColor={theme.text}
                textSecondary={theme.textSecondary}
              />
            </View>
          </Animated.View>
        )}

        {/* Selected day's logs */}
        <Animated.View entering={FadeInDown.delay(240).springify()}>
          <View style={styles.logHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              {`${formatDate(selectedDate)}'s Log`}
            </Text>
            <Text style={[styles.logHeaderTotal, { color: theme.hydration }]}>
              {selectedTotal.toLocaleString()} ml
            </Text>
          </View>
          {selectedLogs.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {selectedDate === today
                  ? 'No water logged yet today. Tap a quick-add button to start!'
                  : 'No water logged on this day.'}
              </Text>
            </View>
          ) : (
            selectedLogs.map((log) => (
              <View key={log.id} style={[styles.logRow, { backgroundColor: theme.card }]}>
                <View style={[styles.logIcon, { backgroundColor: theme.hydration + '18' }]}>
                  <Ionicons name="water" size={16} color={theme.hydration} />
                </View>
                <View style={styles.logInfo}>
                  <Text style={[styles.logAmt, { color: theme.text }]}>{log.amountMl} ml</Text>
                  <Text style={[styles.logTime, { color: theme.textSecondary }]}>
                    {format(new Date(log.loggedAt), 'h:mm a')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={(e) =>
                    handleDelete(log.id, log.amountMl, {
                      x: e.nativeEvent.pageX,
                      y: e.nativeEvent.pageY,
                    })
                  }
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </Animated.View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Custom amount sheet */}
      <BottomSheet
        ref={customSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }}
        handleIndicatorStyle={{ backgroundColor: theme.border }}
      >
        <BottomSheetView style={[styles.sheetContent, { backgroundColor: theme.card }]}>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Custom Amount</Text>
          <BottomSheetTextInput
            style={[
              styles.sheetInput,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
            placeholder="Enter ml (e.g. 420)"
            placeholderTextColor={theme.textSecondary}
            value={customAmt}
            onChangeText={setCustomAmt}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.sheetBtn, { backgroundColor: theme.hydration }]}
            onPress={handleCustomAdd}
          >
            <Text style={styles.sheetBtnText}>Add Water</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheet>

      {/* Goal edit modal */}
      <Modal
        visible={goalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Daily Water Goal</Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="numeric"
              placeholder="ml per day"
              placeholderTextColor={theme.textSecondary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
                onPress={() => setGoalModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.hydration }]}
                onPress={handleGoalSave}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete "spill" effect: droplets fly out + floating "−X ml removed" */}
      <WaterSplashOverlay splash={splash} onDone={() => setSplash(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: '500' },
  goalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  goalBadgeText: { fontSize: 13, fontWeight: '700' },
  bottleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    marginBottom: 28,
  },
  statsCol: { gap: 6 },
  mlValue: { fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  mlLabel: { fontSize: 14, fontWeight: '500' },
  divider: { height: 1, width: 80, marginVertical: 6 },
  remainLabel: { fontSize: 15, fontWeight: '700' },
  pctText: { fontSize: 13, fontWeight: '500' },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  logHeaderTotal: { fontSize: 15, fontWeight: '800' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700' },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logInfo: { flex: 1 },
  logAmt: { fontSize: 15, fontWeight: '700' },
  logTime: { fontSize: 12, marginTop: 1, fontWeight: '500' },
  emptyCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  sheetContent: { padding: 24, gap: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetInput: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16 },
  sheetBtn: { borderRadius: 14, padding: 16, alignItems: 'center' },
  sheetBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalCard: { width: '100%', borderRadius: 22, padding: 24, gap: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalInput: { borderWidth: 1.5, borderRadius: 12, padding: 14, fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
