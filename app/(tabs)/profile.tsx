import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useDispatch, useSelector } from 'react-redux';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { getHealthProviderName } from '@/lib/healthProvider';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/components/ui/toast';
import { RootState, AppDispatch } from '@/store';
import { updateProfile, clearProfile } from '@/store/slices/profileSlice';

interface HealthMemory {
  id: string;
  observation: string;
  created_at: string;
}

const HEALTH_PROVIDER_NAME = getHealthProviderName();

const GOAL_LABELS: Record<string, string> = {
  improve_hydration: '💧 Better Hydration',
  sleep_better: '😴 Sleep Better',
  build_habits: '✅ Build Habits',
  eat_healthier: '🥗 Eat Healthier',
  improve_energy: '⚡ More Energy',
  improve_consistency: '🎯 Be Consistent',
};

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text style={[sectionStyles.header, { color: theme.textSecondary }]}>
      {title.toUpperCase()}
    </Text>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  rightElement,
  iconColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  iconColor?: string;
}) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      style={[sectionStyles.row, { backgroundColor: theme.card }]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && !rightElement}
    >
      <View style={[sectionStyles.iconBox, { backgroundColor: (iconColor ?? theme.tint) + '18' }]}>
        <Ionicons name={icon} size={18} color={iconColor ?? theme.tint} />
      </View>
      <View style={sectionStyles.rowBody}>
        <Text style={[sectionStyles.rowLabel, { color: theme.text }]}>{label}</Text>
        {value ? (
          <Text style={[sectionStyles.rowValue, { color: theme.textSecondary }]}>{value}</Text>
        ) : null}
      </View>
      {rightElement ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
        ) : null)}
    </TouchableOpacity>
  );
}

const sectionStyles = StyleSheet.create({
  header: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
  rowValue: { fontSize: 13, marginTop: 1, fontWeight: '400' },
});

export default function ProfileScreen() {
  const theme = useTheme();
  const { user, profile: authProfile, signOut, refreshProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const profile = useSelector((s: RootState) => s.profile.profile);

  const [healthMemory, setHealthMemory] = useState<HealthMemory[]>([]);
  const [editModal, setEditModal] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(
    profile?.notificationPrefs ?? { hydration: true, sleep: true, habits: true, insights: true },
  );

  // Edit form state
  const [editName, setEditName] = useState(profile?.name ?? '');
  const [editAge, setEditAge] = useState(profile?.age ? String(profile.age) : '');
  const [editHeight, setEditHeight] = useState(profile?.heightCm ? String(profile.heightCm) : '');
  const [editWeight, setEditWeight] = useState(profile?.weightKg ? String(profile.weightKg) : '');

  const { todayTotalMl, dailyGoalMl } = useSelector((s: RootState) => s.hydration);
  const { logs: sleepLogs } = useSelector((s: RootState) => s.sleep);
  const { habits, todayCompletionIds } = useSelector((s: RootState) => s.habits);
  const hkConnected = useSelector((s: RootState) => s.activity.hkConnected);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
      dispatch(
        updateProfile({
          name: data.name ?? '',
          age: data.age ?? undefined,
          heightCm: data.height_cm ?? undefined,
          weightKg: data.weight_kg ?? undefined,
          goals: data.goals ?? [],
          notificationPrefs: data.notification_prefs ?? {
            hydration: true,
            sleep: true,
            habits: true,
            insights: true,
          },
        }),
      );
      setNotifPrefs(
        data.notification_prefs ?? { hydration: true, sleep: true, habits: true, insights: true },
      );
    }
    const { data: mem } = await supabase
      .from('health_memory')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (mem) setHealthMemory(mem);
  }, [user?.id, dispatch]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = useCallback(async () => {
    if (!user?.id) return;
    const updates = {
      name: editName.trim() || profile?.name,
      age: editAge ? parseInt(editAge) : null,
      height_cm: editHeight ? parseFloat(editHeight) : null,
      weight_kg: editWeight ? parseFloat(editWeight) : null,
    };
    try {
      await supabase.from('profiles').update(updates).eq('id', user.id);
      dispatch(
        updateProfile({
          name: updates.name ?? '',
          age: updates.age ?? undefined,
          heightCm: updates.height_cm ?? undefined,
          weightKg: updates.weight_kg ?? undefined,
        }),
      );
      showToast('Profile updated', 'success');
      setEditModal(false);
      await refreshProfile();
    } catch {
      showToast('Could not update profile', 'error');
    }
  }, [
    user?.id,
    editName,
    editAge,
    editHeight,
    editWeight,
    profile,
    dispatch,
    showToast,
    refreshProfile,
  ]);

  const handleToggleNotif = useCallback(
    async (key: keyof typeof notifPrefs, value: boolean) => {
      const next = { ...notifPrefs, [key]: value };
      setNotifPrefs(next);
      dispatch(updateProfile({ notificationPrefs: next }));
      if (user?.id) {
        await supabase.from('profiles').update({ notification_prefs: next }).eq('id', user.id);
      }
    },
    [notifPrefs, dispatch, user?.id],
  );

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          dispatch(clearProfile());
          router.replace('/');
        },
      },
    ]);
  }, [signOut, dispatch]);

  const displayName = profile?.name ?? authProfile?.name ?? 'Aurora User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const memberSince = user?.created_at ? format(new Date(user.created_at), 'MMM yyyy') : '—';

  // Weekly stats
  const avgSleep =
    sleepLogs.slice(0, 7).length > 0
      ? (
          sleepLogs.slice(0, 7).reduce((s, l) => s + l.durationMin, 0) /
          sleepLogs.slice(0, 7).length /
          60
        ).toFixed(1)
      : '—';
  const hydPct = dailyGoalMl > 0 ? Math.round((todayTotalMl / dailyGoalMl) * 100) : 0;
  const activeHabits = habits.filter((h) => h.status === 'active');
  const habPct =
    activeHabits.length > 0
      ? Math.round((todayCompletionIds.length / activeHabits.length) * 100)
      : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <Animated.View entering={FadeInDown.delay(0).springify()}>
          <LinearGradient
            colors={theme.isDark ? ['#1A1D2E', '#252840'] : ['#EEF2FF', '#F4F6FF']}
            style={styles.headerCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={[styles.displayName, { color: theme.text }]}>{displayName}</Text>
            <Text style={[styles.memberSince, { color: theme.textSecondary }]}>
              Member since {memberSince}
            </Text>
            {profile?.goals && profile.goals.length > 0 && (
              <View style={styles.goalsRow}>
                {profile.goals.slice(0, 3).map((g) => (
                  <View key={g} style={[styles.goalChip, { backgroundColor: theme.tint + '18' }]}>
                    <Text style={[styles.goalChipText, { color: theme.tint }]}>
                      {GOAL_LABELS[g] ?? g}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {/* Personal Info */}
        <Animated.View entering={FadeInDown.delay(60).springify()}>
          <SectionHeader title="Personal Info" />
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Row
              icon="person-outline"
              label="Name"
              value={displayName}
              onPress={() => {
                setEditName(profile?.name ?? '');
                setEditAge(profile?.age ? String(profile.age) : '');
                setEditHeight(profile?.heightCm ? String(profile.heightCm) : '');
                setEditWeight(profile?.weightKg ? String(profile.weightKg) : '');
                setEditModal(true);
              }}
            />
            <Row
              icon="body-outline"
              label="Height"
              value={profile?.heightCm ? `${profile.heightCm} cm` : 'Not set'}
            />
            <Row
              icon="fitness-outline"
              label="Weight"
              value={profile?.weightKg ? `${profile.weightKg} kg` : 'Not set'}
            />
            <Row
              icon="calendar-outline"
              label="Age"
              value={profile?.age ? `${profile.age} years` : 'Not set'}
            />
          </View>
        </Animated.View>

        {/* Notifications */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <SectionHeader title="Notifications" />
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            {(Object.keys(notifPrefs) as Array<keyof typeof notifPrefs>).map((key) => (
              <Row
                key={key}
                icon={
                  key === 'hydration'
                    ? 'water-outline'
                    : key === 'sleep'
                      ? 'moon-outline'
                      : key === 'habits'
                        ? 'checkmark-circle-outline'
                        : 'bulb-outline'
                }
                label={`${key.charAt(0).toUpperCase() + key.slice(1)} Reminders`}
                iconColor={
                  key === 'hydration'
                    ? theme.hydration
                    : key === 'sleep'
                      ? theme.sleep
                      : key === 'habits'
                        ? theme.habits
                        : theme.tint
                }
                rightElement={
                  <Switch
                    value={notifPrefs[key]}
                    onValueChange={(v) => handleToggleNotif(key, v)}
                    trackColor={{ false: theme.border, true: theme.tint + '80' }}
                    thumbColor={notifPrefs[key] ? theme.tint : theme.textSecondary}
                  />
                }
              />
            ))}
          </View>
        </Animated.View>

        {/* Devices */}
        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <SectionHeader title="Devices & Data" />
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Row
              icon={Platform.OS === 'ios' ? 'heart-outline' : 'pulse-outline'}
              label={HEALTH_PROVIDER_NAME}
              iconColor={Platform.OS === 'ios' ? '#FF4F6D' : '#2E7D5B'}
              value={hkConnected ? 'Connected' : 'Not connected'}
              onPress={() => router.push('/health-connect')}
            />
          </View>
        </Animated.View>

        {/* Weekly Summary */}
        <Animated.View entering={FadeInDown.delay(180).springify()}>
          <SectionHeader title="Today at a Glance" />
          <View style={[styles.statsCard, { backgroundColor: theme.card }]}>
            <View style={styles.statItem}>
              <Text style={styles.statEmoji}>💧</Text>
              <Text style={[styles.statVal, { color: theme.text }]}>{hydPct}%</Text>
              <Text style={[styles.statLbl, { color: theme.textSecondary }]}>Hydration</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <Text style={styles.statEmoji}>😴</Text>
              <Text style={[styles.statVal, { color: theme.text }]}>{avgSleep}h</Text>
              <Text style={[styles.statLbl, { color: theme.textSecondary }]}>Avg Sleep</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <Text style={styles.statEmoji}>✅</Text>
              <Text style={[styles.statVal, { color: theme.text }]}>{habPct}%</Text>
              <Text style={[styles.statLbl, { color: theme.textSecondary }]}>Habits</Text>
            </View>
          </View>
        </Animated.View>

        {/* Aurora's Memory */}
        {healthMemory.length > 0 && (
          <Animated.View entering={FadeInDown.delay(240).springify()}>
            <SectionHeader title="What Aurora Knows About You" />
            <View style={[styles.section, { backgroundColor: theme.card }]}>
              {healthMemory.map((m) => (
                <View key={m.id} style={styles.memoryRow}>
                  <Ionicons name="sparkles" size={14} color={theme.tint} style={{ marginTop: 2 }} />
                  <Text style={[styles.memoryText, { color: theme.textSecondary }]}>
                    {m.observation}
                  </Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Account */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <SectionHeader title="Account" />
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Row icon="mail-outline" label="Email" value={user?.email ?? '—'} />
          </View>
        </Animated.View>

        {/* Sign Out */}
        <Animated.View entering={FadeInDown.delay(360).springify()} style={styles.signOutWrap}>
          <TouchableOpacity
            style={[
              styles.signOutBtn,
              { backgroundColor: theme.error + '15', borderColor: theme.error + '30' },
            ]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color={theme.error} />
            <Text style={[styles.signOutText, { color: theme.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: 110 }} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Name</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor={theme.textSecondary}
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Age</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={editAge}
              onChangeText={setEditAge}
              placeholder="Years"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Height (cm)</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={editHeight}
              onChangeText={setEditHeight}
              placeholder="e.g. 175"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Weight (kg)</Text>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
              ]}
              value={editWeight}
              onChangeText={setEditWeight}
              placeholder="e.g. 70"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.border }]}
                onPress={() => setEditModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.tint }]}
                onPress={handleSaveProfile}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingBottom: 20 },
  headerCard: {
    margin: 20,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  displayName: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  memberSince: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  goalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    justifyContent: 'center',
  },
  goalChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  goalChipText: { fontSize: 12, fontWeight: '700' },
  section: { marginHorizontal: 20, borderRadius: 16, overflow: 'hidden' },
  statsCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statEmoji: { fontSize: 20 },
  statVal: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  statLbl: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  statDivider: { width: 1, height: 48, marginHorizontal: 8 },
  memoryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'transparent',
  },
  memoryText: { fontSize: 14, lineHeight: 20, flex: 1, fontWeight: '400' },
  signOutWrap: { paddingHorizontal: 20, marginTop: 24 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  signOutText: { fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 10,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 13, fontSize: 15 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
