import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { getOverviewSummary } from './overview-summary';
import { useCoverageToday } from './use-coverage';

type Snapshot = {
  vehicleId: number;
  data: Awaited<ReturnType<typeof getOverviewSummary>> | null;
  error: string | null;
};

export function useOverviewSummary(vehicleId: number) {
  const db = useSQLiteContext();
  const today = useCoverageToday();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    // Keep this vehicle's loaded cards visible during a focus refresh.
    void getOverviewSummary(db, vehicleId, today).then((data) => {
      if (active) setSnapshot({ vehicleId, data, error: null });
    }).catch(() => {
      if (active) setSnapshot({ vehicleId, data: null, error: 'Could not load' });
    });
    return () => { active = false; };
  }, [db, vehicleId, today]));
  // Never expose a previous vehicle's snapshot, even before the next effect runs.
  const current = snapshot?.vehicleId === vehicleId ? snapshot : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !current, today };
}
