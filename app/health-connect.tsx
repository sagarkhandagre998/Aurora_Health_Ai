import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';

import { useAuth } from '@/lib/auth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { isHealthAvailable, getHealthProviderName, getHealthProvider } from '@/lib/healthProvider';
import { syncFromHealthKit } from '@/lib/healthSync';
import { RootState, AppDispatch } from '@/store';
import { setHkConnected, setEnabledMetric, resetActivity } from '@/store/slices/activitySlice';
import type { HealthMetric } from '@/types';

const PROVIDER = getHealthProviderName();
const IS_IOS = Platform.OS === 'ios';
// Apple Health → heart/red; Health Connect → pulse/green.
const BRAND_ICON: React.ComponentProps<typeof Ionicons>['name'] = IS_IOS ? 'heart' : 'pulse';
const BRAND_COLOR = IS_IOS ? '#FF4F6D' : '#2E7D5B';
const BRAND_TINT = IS_IOS ? 'rgba(255,79,109,0.14)' : 'rgba(46,125,91,0.14)';

const METRICS: {
  key: HealthMetric;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}[] = [
  {
    key: 'steps',
    label: 'Steps',
    desc: 'Daily step count',
    icon: 'walk-outline',
    color: '#4CAF82',
  },
  {
    key: 'activeEnergy',
    label: 'Active Energy',
    desc: 'Calories burned through movement',
    icon: 'flame-outline',
    color: '#F5A623',
  },
  {
    key: 'sleep',
    label: 'Sleep',
    desc: 'Import sleep analysis into your sleep log',
    icon: 'moon-outline',
    color: '#8B7CF0',
  },
  {
    key: 'water',
    label: 'Water',
    desc: `Two-way sync with ${PROVIDER} hydration`,
    icon: 'water-outline',
    color: '#34C5FF',
  },
];

export default function HealthConnectScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();

  const { hkConnected, enabledMetrics, lastSyncedAt } = useSelector((s: RootState) => s.activity);
  const available = isHealthAvailable();

  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleConnect = useCallback(async () => {
    if (!available) {
      showToast(`${PROVIDER} isn't available on this device`, 'error');
      return;
    }
    setConnecting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const granted = await (getHealthProvider()?.requestPermissions() ?? Promise.resolve(false));
    if (granted) {
      dispatch(setHkConnected(true));
      showToast(`${PROVIDER} connected`, 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Immediate first sync
      if (user?.id) {
        setSyncing(true);
        await syncFromHealthKit(user.id, dispatch, enabledMetrics);
        setSyncing(false);
      }
    } else {
      showToast(`Could not connect to ${PROVIDER}`, 'error');
    }
    setConnecting(false);
  }, [available, dispatch, showToast, user?.id, enabledMetrics]);

  const handleSync = useCallback(async () => {
    if (!user?.id) return;
    setSyncing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await syncFromHealthKit(user.id, dispatch, enabledMetrics);
    setSyncing(false);
    if (res) {
      const parts: string[] = [];
      if (res.sleepNights) parts.push(`${res.sleepNights} nights`);
      if (res.waterImported) parts.push(`${res.waterImported} water`);
      showToast(parts.length ? `Synced ${parts.join(', ')}` : 'Up to date', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      showToast('Nothing to sync', 'error');
    }
  }, [user?.id, dispatch, enabledMetrics, showToast]);

  const handleDisconnect = useCallback(() => {
    dispatch(resetActivity());
    showToast(`${PROVIDER} disconnected`, 'success');
  }, [dispatch, showToast]);

  const toggleMetric = useCallback(
    (metric: HealthMetric, enabled: boolean) => {
      Haptics.selectionAsync();
      dispatch(setEnabledMetric({ metric, enabled }));
    },
    [dispatch],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: PROVIDER,
          headerBackTitle: 'Settings',
        }}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Hero */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#1A2A22', '#181E28'] : ['#EFF6F0', '#EEF6FF']}
            style={styles.hero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={[styles.heroIcon, { backgroundColor: BRAND_TINT }]}>
              <Ionicons name={BRAND_ICON} size={30} color={BRAND_COLOR} />
            </View>
            <Text style={[styles.heroTitle, { color: theme.text }]}>{PROVIDER}</Text>
            <Text style={[styles.heroSub, { color: theme.textSecondary }]}>
              Sync steps, energy, sleep, and water so Aurora understands your full picture.
            </Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: hkConnected ? theme.success + '20' : theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: hkConnected ? theme.success : theme.textSecondary },
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  { color: hkConnected ? theme.success : theme.textSecondary },
                ]}
              >
                {hkConnected ? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {!available && (
          <Animated.View entering={FadeInDown.delay(60).springify()}>
            <View style={[styles.noticeCard, { backgroundColor: theme.card }]}>
              <Ionicons name="information-circle-outline" size={18} color={theme.textSecondary} />
              <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                {IS_IOS
                  ? 'HealthKit is unavailable in this build. Rebuild the dev client with the Health plugin enabled to connect.'
                  : Platform.OS === 'android'
                    ? 'Health Connect isn’t available. Install/enable the Health Connect app and rebuild the dev client with the plugin enabled.'
                    : 'Device health sync is only available on iPhone and Android.'}
              </Text>
            </View>
          </Animated.View>
        )}

        {/* Connect / Sync actions */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          {!hkConnected ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.tint, opacity: connecting || !available ? 0.6 : 1 },
              ]}
              onPress={handleConnect}
              disabled={connecting || !available}
              activeOpacity={0.85}
            >
              <Ionicons name="link" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {connecting ? 'Connecting…' : `Connect ${PROVIDER}`}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: theme.tint, opacity: syncing ? 0.6 : 1 },
              ]}
              onPress={handleSync}
              disabled={syncing}
              activeOpacity={0.85}
            >
              <Ionicons name={syncing ? 'sync' : 'sync-outline'} size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
            </TouchableOpacity>
          )}
          {hkConnected && (
            <Text style={[styles.lastSync, { color: theme.textSecondary }]}>
              {lastSyncedAt
                ? `Last synced ${formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })}`
                : 'Not synced yet'}
            </Text>
          )}
        </Animated.View>

        {/* Per-metric toggles */}
        <Animated.View entering={FadeInDown.delay(180).springify()}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>DATA TO SYNC</Text>
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            {METRICS.map((m, idx) => (
              <View key={m.key}>
                <View style={styles.row}>
                  <View style={[styles.iconBox, { backgroundColor: m.color + '18' }]}>
                    <Ionicons name={m.icon} size={18} color={m.color} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowLabel, { color: theme.text }]}>{m.label}</Text>
                    <Text style={[styles.rowDesc, { color: theme.textSecondary }]}>{m.desc}</Text>
                  </View>
                  <Switch
                    value={enabledMetrics[m.key]}
                    onValueChange={(v) => toggleMetric(m.key, v)}
                    trackColor={{ false: theme.border, true: m.color + '80' }}
                    thumbColor={enabledMetrics[m.key] ? m.color : theme.textSecondary}
                    disabled={!hkConnected}
                  />
                </View>
                {idx < METRICS.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                )}
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Disconnect */}
        {hkConnected && (
          <Animated.View entering={FadeInDown.delay(240).springify()}>
            <TouchableOpacity
              style={[
                styles.disconnectBtn,
                { borderColor: theme.error + '30', backgroundColor: theme.error + '12' },
              ]}
              onPress={handleDisconnect}
              activeOpacity={0.8}
            >
              <Ionicons name="unlink-outline" size={18} color={theme.error} />
              <Text style={[styles.disconnectText, { color: theme.error }]}>Disconnect</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.privacyNote}>
          <Ionicons name="lock-closed-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
            Health data stays in your private Aurora account. You can revoke access anytime from the
            iOS Health app → Sharing.
          </Text>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, gap: 4 },
  hero: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 8,
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  heroSub: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, fontWeight: '500' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 16,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  noticeCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 54,
    borderRadius: 16,
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  lastSync: { textAlign: 'center', fontSize: 12, fontWeight: '500', marginTop: 10 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  section: { borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowDesc: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 60 },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 24,
  },
  disconnectText: { fontSize: 15, fontWeight: '700' },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 4,
  },
  privacyText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
