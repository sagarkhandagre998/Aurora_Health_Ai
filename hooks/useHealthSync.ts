import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '@/lib/auth';
import { isHealthKitAvailable } from '@/lib/healthkit';
import { syncFromHealthKit } from '@/lib/healthSync';
import type { AppDispatch, RootState } from '@/store';

/** Minimum gap between automatic syncs (ms) to avoid hammering on rapid foregrounds. */
const MIN_SYNC_INTERVAL = 60_000;

/**
 * Auto-syncs Apple Health data on mount and whenever the app returns to the
 * foreground, provided the user has connected HealthKit. Mount once near the
 * root (e.g. RootNavigator). No-ops on non-iOS / unconnected.
 */
export function useHealthSync(): void {
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const hkConnected = useSelector((s: RootState) => s.activity.hkConnected);
  const enabledMetrics = useSelector((s: RootState) => s.activity.enabledMetrics);
  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  const run = useCallback(async () => {
    if (!user?.id || !hkConnected || !isHealthKitAvailable()) return;
    if (inFlightRef.current) return;
    if (Date.now() - lastRunRef.current < MIN_SYNC_INTERVAL) return;
    inFlightRef.current = true;
    lastRunRef.current = Date.now();
    try {
      await syncFromHealthKit(user.id, dispatch, enabledMetrics);
    } catch {
      // Silent — manual sync surfaces errors to the user.
    } finally {
      inFlightRef.current = false;
    }
  }, [user?.id, hkConnected, enabledMetrics, dispatch]);

  // On mount / when connection becomes active.
  useEffect(() => {
    run();
  }, [run]);

  // On app foreground.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') run();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [run]);
}
