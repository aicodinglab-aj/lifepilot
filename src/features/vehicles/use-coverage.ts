import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppState } from 'react-native';
import { getCurrentCoverage } from '@/database/vehicle-coverage';
import type { CoverageRecord } from './coverage-record';
import { localToday } from './coverage-status';

// Refresh on focus, foreground and local midnight. This is display logic, not a reminder scheduler.
export function useCoverageToday() {
  const [today, setToday] = useState(localToday);
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      clearTimeout(timer);
      const now = new Date(); setToday(localToday(now));
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, Math.max(1000, next.getTime() - now.getTime() + 100));
    }
    refresh();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []));
  return today;
}
export function useCoverageSummary(vehicleId: number) {
  const db = useSQLiteContext();
  const today = useCoverageToday();
  const [data, setData] = useState<{ insurance: CoverageRecord | null; puc: CoverageRecord | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true; setLoading(true);
    void (async () => {
      try {
        const [insurance, puc] = await Promise.all([getCurrentCoverage(db, 'insurance', vehicleId, today), getCurrentCoverage(db, 'puc', vehicleId, today)]);
        if (active) { setData({ insurance, puc }); setError(null); }
      } catch (cause) { if (active) { setData(null); setError(cause instanceof Error ? cause.message : 'Could not load Insurance & PUC.'); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
    // Retry refreshes data while this screen is already focused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, vehicleId, today, retry]));
  return { data, loading, error, today, reload: () => setRetry((value) => value + 1) };
}
